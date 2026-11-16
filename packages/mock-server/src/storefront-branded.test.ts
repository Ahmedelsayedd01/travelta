import { describe, expect, it } from 'vitest';
import { checkoutCart, destId, findOffer, login, loginCustomer } from './test-flows';
import { testServer } from './test-utils';

/** M22: agency-branded storefronts — settings, contrast, domains, public resolution, agency B2C pricing and tenancy. */
describe('agency-branded storefront', () => {
  it('validates branding, publishes, and verifies a custom domain through simulated DNS', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const sf = await server.handle('storefront.get', undefined, nile.token);
    expect(sf).toMatchObject({ published: true, entitled: true, slug: 'nile-horizon' });
    const base = { displayName: sf.displayName, tagline: sf.tagline, logo: null, primaryColor: sf.primaryColor, heroColor: sf.heroColor, subdomain: sf.subdomain };
    await expect(server.handle('storefront.save', { ...base, primaryColor: '#FACC15' }, nile.token)).rejects.toMatchObject({ details: [{ field: 'primaryColor', issue: 'validation.contrast' }] });
    await expect(server.handle('storefront.save', { ...base, subdomain: 'alnoor' }, nile.token)).rejects.toMatchObject({ details: [{ field: 'subdomain', issue: 'validation.subdomain_taken' }] });
    const req = await server.handle('storefront.requestDomain', { domain: 'book.nilehorizon.com' }, nile.token);
    expect(req).toMatchObject({ domainStatus: 'pending' });
    expect(req.verificationToken).toMatch(/^travelta-verify=/);
    expect((await server.handle('storefront.verifyDomain', undefined, nile.token)).domainStatus).toBe('failed');
    await server.handle('storefront.simulateDns', undefined, nile.token);
    const ok = await server.handle('storefront.verifyDomain', undefined, nile.token);
    expect(ok).toMatchObject({ domainStatus: 'verified', urls: { custom: 'book.nilehorizon.com' } });
    expect((await server.handle('storefront.public', { host: 'book.nilehorizon.com' })).slug).toBe('nile-horizon');
    expect((await server.handle('storefront.public', { host: 'nilehorizon.localhost:3001' })).slug).toBe('nile-horizon');
    await server.handle('storefront.setPublished', { published: false }, nile.token);
    await expect(server.handle('storefront.public', { slug: 'nile-horizon' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(server.handle('search.run', { serviceType: 'hotel', destinationId: await destId(server, 'LXR'), from: '2026-12-01', to: '2026-12-04', rooms: [{ adults: 2, childAges: [] }], adults: 2, children: 0, infants: 0, storefront: 'nile-horizon', pageSize: 5 } as never)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('requires the storefront add-on to publish', async () => {
    const { server } = testServer();
    const sunrise = await login(server, 'owner@sunrise.demo');
    await expect(server.handle('storefront.setPublished', { published: true }, sunrise.token)).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
  });

  it('customers of the agency storefront book at agency B2C prices into the agency tenant', async () => {
    const { server } = testServer();
    const anon = await findOffer(server, null, { serviceType: 'hotel', destinationId: await destId(server, 'LXR'), from: '2026-12-10', to: '2026-12-13', rooms: [{ adults: 2, childAges: [] }], storefront: 'nile-horizon' } as never, (_, o) => o === 'network');
    expect(anon.option.priceMinor).toBeGreaterThan(0);
    const hossam = await loginCustomer(server, 'traveller@nilehorizon.example', 'nile-horizon');
    const { option } = await findOffer(server, hossam.token, { serviceType: 'hotel', destinationId: await destId(server, 'LXR'), from: '2026-12-10', to: '2026-12-13', rooms: [{ adults: 2, childAges: [] }] }, (_, o) => o === 'network');
    await server.handle('cart.addOffer', { offerId: option.offerId, storefront: 'nile-horizon' }, hossam.token);
    const booking = await checkoutCart(server, hossam.token, { storefront: 'nile-horizon', payment: { method: 'card', card: { number: '4242424242424242', expiry: '12/29', cvc: '123', holder: 'Hossam Adel' } } } as never);
    expect(booking).toMatchObject({ channel: 'b2c', sellerName: 'Nile Horizon Travel', paymentStatus: 'authorized' });
    const nile = await login(server, 'owner@nilehorizon.demo');
    expect((await server.handle('bookings.get', { id: booking.id }, nile.token)).customerName).toBe('Hossam Adel');
    const sara = await loginCustomer(server);
    await expect(server.handle('bookings.get', { id: booking.id }, sara.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
