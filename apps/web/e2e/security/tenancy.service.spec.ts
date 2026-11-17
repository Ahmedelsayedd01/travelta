import { expect, test } from '@playwright/test';
import { ACCOUNTS } from '../fixtures';
import { demoBackend } from '../helpers/service';
import { isoDays, uniqueEmail } from '../factories/data';

/**
 * Authorisation at the service boundary (TENANCY_AND_SECURITY): every check below calls the backend operation
 * directly with a real session token, bypassing the UI entirely. Hidden navigation is not a security control.
 */

test.describe('service boundary', () => {
  test('no session: protected operations are refused', async () => {
    const b = await demoBackend();
    for (const fn of [() => b.call('bookings.list', { page: 1, pageSize: 5 }), () => b.call('auth.me'), () => b.call('wallet.get', {})]) {
      expect(await b.outcome(fn)).toBe('UNAUTHENTICATED');
    }
  });

  test('a customer session cannot call staff or platform operations', async () => {
    const b = await demoBackend();
    await b.signInAs(ACCOUNTS.customer, 'customer');
    const calls: Record<string, () => Promise<unknown>> = {
      'orgs.list': () => b.call('orgs.list', { page: 1, pageSize: 5 }),
      'kyc.queue': () => b.call('kyc.queue', { page: 1, pageSize: 5 }),
      'accounting.trialBalance': () => b.call('accounting.trialBalance', {}),
      'payables.list': () => b.call('payables.list', { page: 1, pageSize: 5 } as never),
      'customers.list': () => b.call('customers.list', { page: 1, pageSize: 5 }),
      'roles.list': () => b.call('roles.list'),
      'wallet.list': () => b.call('wallet.list', { page: 1, pageSize: 5 } as never),
    };
    for (const [name, fn] of Object.entries(calls)) expect(await b.outcome(fn), name).toMatch(/FORBIDDEN|UNAUTHENTICATED/);
  });

  test('agencies are isolated: another agency cannot read or list a booking, customer or wallet', async () => {
    const b = await demoBackend();
    await b.signInAs(ACCOUNTS.agencyOwner);
    const booking = (await b.call('bookings.list', { page: 1, pageSize: 1 })).items[0]!;
    const customer = (await b.call('customers.list', { page: 1, pageSize: 1 })).items[0]!;
    const wallet = await b.call('wallet.get', {});
    expect(booking && customer && wallet).toBeTruthy();

    await b.signInAs(ACCOUNTS.otherAgencyOwner);
    expect(await b.outcome(() => b.call('bookings.get', { id: booking.id }))).toBe('NOT_FOUND');
    expect(await b.outcome(() => b.call('customers.get', { id: customer.id }))).toBe('NOT_FOUND');
    const walletId = (wallet as unknown as { wallet: { id: string } }).wallet.id;
    expect(await b.outcome(() => b.call('wallet.get', { walletId }))).toMatch(/NOT_FOUND|FORBIDDEN/);
    const theirs = await b.call('bookings.list', { page: 1, pageSize: 100, search: booking.ref } as never);
    expect(theirs.items.map((x) => x.id)).not.toContain(booking.id);
  });

  test('suppliers are isolated: another supplier cannot read or change a product', async () => {
    const b = await demoBackend();
    await b.signInAs(ACCOUNTS.supplierAdmin);
    const product = (await b.call('catalog.list', { page: 1, pageSize: 1 })).items[0]!;
    await b.signInAs('supplier@skybridge.demo');
    expect(await b.outcome(() => b.call('catalog.get', { id: product.id }))).toMatch(/NOT_FOUND|FORBIDDEN/);
    expect(await b.outcome(() => b.call('catalog.delete', { id: product.id }))).toMatch(/NOT_FOUND|FORBIDDEN/);
    const theirs = await b.call('catalog.list', { page: 1, pageSize: 100 });
    expect(theirs.items.map((x) => x.id)).not.toContain(product.id);
  });

  test('customers are isolated, and storefront prices never expose supplier cost', async () => {
    const b = await demoBackend();
    await b.signInAs(ACCOUNTS.customer, 'customer');
    const dest = (await b.call('reference.destinations', { page: 1, pageSize: 100 })).items.find((d) => d.code === 'LXR')!;
    const search = await b.call('search.run', { serviceType: 'hotel', destinationId: dest.id, from: isoDays(30), to: isoDays(33), rooms: [{ adults: 2, childAges: [] }], adults: 2, children: 0, infants: 0, pageSize: 20 } as never);
    const option = search.items[0]!.options[0]!;
    expect((option as { buyMinor?: number | null }).buyMinor ?? null, 'customer sees no supplier cost').toBeNull();
    await b.call('cart.addOffer', { offerId: option.offerId });
    const cart = await b.call('cart.get', {});
    const item = cart.items[0]!;
    const adults = item.occupancy.rooms.reduce((a, r) => a + r.adults, 0);
    const booking = await b.call('checkout.submit', {
      idempotencyKey: `e2e-${Date.now()}`, customerId: null,
      items: [{ itemId: item.id, acceptedPriceMinor: item.priceMinor, details: {}, travellers: Array.from({ length: adults }, (_, i) => ({ type: 'adult', title: 'mr', firstName: `Guest${i}`, lastName: 'Demo', dateOfBirth: null, nationalityIso2: 'EG', passportNo: `A${1000 + i}`, passportExpiry: '2031-01-01', mahram: null, lead: i === 0 })) }],
      payment: { method: 'card', card: { number: '4242424242424242', expiry: '12/29', cvc: '123', holder: 'Sara Ali' } },
    } as never);
    expect(booking.items[0]!.costMinor, 'customer booking hides cost').toBeNull();

    // A different customer: registered fresh, sees nothing of Sara's.
    const registered = await b.call('auth.registerCustomer', { name: 'Other Customer', email: uniqueEmail('other'), password: 'Other#Pass2027', locale: 'en' }) as unknown as { token: string };
    b.useToken(registered.token);
    expect((await b.call('auth.me')).user.email).not.toBe(ACCOUNTS.customer);
    expect(await b.outcome(() => b.call('bookings.get', { id: booking.id }))).toBe('NOT_FOUND');
    expect((await b.call('bookings.list', { page: 1, pageSize: 100 })).total).toBe(0);
  });

  test('another customer cannot open a booking by id', async () => {
    const b = await demoBackend();
    await b.signInAs(ACCOUNTS.agencyOwner);
    // Any agency booking id is equally foreign to a customer; the check is the same code path.
    const foreign = (await b.call('bookings.list', { page: 1, pageSize: 1 })).items[0]!;
    await b.signInAs(ACCOUNTS.customer, 'customer');
    expect(await b.outcome(() => b.call('bookings.get', { id: foreign.id }))).toBe('NOT_FOUND');
    expect((await b.call('bookings.list', { page: 1, pageSize: 100 })).items.map((x) => x.id)).not.toContain(foreign.id);
  });

  test('logout invalidates the session token', async () => {
    const b = await demoBackend();
    const session = await b.signInAs(ACCOUNTS.agencyOwner);
    expect(await b.outcome(() => b.call('auth.me'))).toBe('OK');
    await b.call('auth.logout');
    b.useToken(session.token);
    expect(await b.outcome(() => b.call('auth.me'))).toBe('UNAUTHENTICATED');
    expect(await b.outcome(() => b.call('bookings.list', { page: 1, pageSize: 1 }))).toBe('UNAUTHENTICATED');
  });

  test('suspending an organization ends its sessions and blocks booking until it is reactivated (TENANCY §74)', async () => {
    const b = await demoBackend();
    const dest = async () => (await b.call('reference.destinations', { page: 1, pageSize: 100 })).items.find((d) => d.code === 'LXR')!.id;
    const tryToBook = async () => {
      const search = await b.call('search.run', { serviceType: 'hotel', destinationId: await dest(), from: isoDays(30), to: isoDays(33), rooms: [{ adults: 2, childAges: [] }], adults: 2, children: 0, infants: 0, pageSize: 20 } as never);
      const offer = search.items.flatMap((r) => r.options)[0]!;
      return b.outcome(() => b.call('cart.addOffer', { offerId: offer.offerId }));
    };
    // Agencies that are not active never book: pending KYC (Red Sea) and expired documents (Sunrise).
    await b.signInAs(ACCOUNTS.otherAgencyOwner);
    expect(await tryToBook(), 'pending-KYC agency').toBe('ORG_NOT_ELIGIBLE');
    await b.signInAs('owner@sunrise.demo');
    expect(await tryToBook(), 'expired-documents agency').toBe('ORG_NOT_ELIGIBLE');

    // An active agency (Al Noor) is suspended, then reactivated.
    const live = await b.signInAs('owner@alnoor.demo');
    expect(await tryToBook(), 'active agency').toBe('OK');
    await b.signInAs(ACCOUNTS.platformAdmin);
    const alNoor = (await b.call('orgs.list', { page: 1, pageSize: 100 })).items.find((o) => o.name.en.toLowerCase().includes('noor'))!;
    await b.call('orgs.setStatus', { id: alNoor.id, status: 'suspended', reason: 'E2E compliance hold' });

    b.useToken(live.token);
    expect(await b.outcome(() => b.call('auth.me')), 'existing session revoked').toBe('UNAUTHENTICATED');
    await b.signInAs('owner@alnoor.demo'); // signing in is allowed (to pay / read), booking is not
    expect(await tryToBook(), 'suspended agency cannot book').toBe('ORG_NOT_ELIGIBLE');

    await b.signInAs(ACCOUNTS.platformAdmin);
    await b.call('orgs.setStatus', { id: alNoor.id, status: 'active', reason: 'E2E hold lifted' });
    await b.signInAs('owner@alnoor.demo');
    expect(await tryToBook(), 'reactivated agency books again').toBe('OK');
  });

  test('sub-agencies are one level deep: a sub-agency cannot create its own sub-agency', async () => {
    const b = await demoBackend();
    await b.signInAs(ACCOUNTS.subAgencyOwner);
    const outcome = await b.outcome(() => b.call('subAgencies.create', {
      name: { en: 'Nested E2E', ar: 'متداخلة' }, legalName: 'Nested E2E LLC', city: 'Cairo', contactEmail: uniqueEmail('nested'), contactPhone: '+201000000000',
      owner: { name: 'Nested Owner', email: uniqueEmail('nested-owner') },
    } as never));
    expect(outcome).toMatch(/FORBIDDEN|BUSINESS_RULE|INVALID|CONFLICT/);
  });
});
