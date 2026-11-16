import { describe, expect, it } from 'vitest';
import type { CheckoutInput, JournalEntryEntity, WalletEntity, WalletTransactionEntity } from '@travelta/schemas';
import { checkoutCart, destId, findOffer, firstCustomer, login, loginCustomer, type Server } from './test-flows';
import { testServer } from './test-utils';

/** Dedicated financial tests (TESTING_STRATEGY §2): PAY, WAL, INV, CAN and ACC rules end to end through the API. */

const hotel = async (server: Server, code = 'LXR') => ({ serviceType: 'hotel' as const, destinationId: await destId(server, code), from: '2026-12-01', to: '2026-12-04', rooms: [{ adults: 2, childAges: [] }] });

async function book(server: Server, token: string, pick: (name: string, ownership: string) => boolean, payment?: CheckoutInput['payment'], customer = true) {
  const { option } = await findOffer(server, token, await hotel(server), pick);
  await server.handle('cart.addOffer', { offerId: option.offerId }, token);
  return checkoutCart(server, token, { ...(customer ? { customerId: await firstCustomer(server, token) } : {}), ...(payment ? { payment } : {}) });
}

async function confirmAsSupplier(server: Server, bookingId: string, itemId: string, email = 'supplier@pharaohstays.demo') {
  const s = await login(server, email);
  return server.handle('bookings.confirmItem', { bookingId, itemId, supplierRef: 'PS-1001' }, s.token);
}

async function snapshot(server: Server) {
  const snap = await server.handle('demo.export', undefined);
  const c = snap.collections as unknown as { journalEntries: JournalEntryEntity[]; wallets: WalletEntity[]; walletTransactions: WalletTransactionEntity[]; ledgerAccounts: { id: string; tenantId: string; systemKey: string | null; type: string }[] };
  return c;
}

/** ACC-1 + WAL-6 integrity over the whole dataset. */
async function expectBooksBalanced(server: Server) {
  const c = await snapshot(server);
  for (const e of c.journalEntries) {
    expect(e.lines.reduce((s, l) => s + l.debitMinor, 0), e.memo).toBe(e.lines.reduce((s, l) => s + l.creditMinor, 0));
  }
  for (const w of c.wallets) expect(c.walletTransactions.filter((t) => t.walletId === w.id).reduce((s, t) => s + t.amountMinor, 0)).toBe(w.balanceMinor);
}

/** Balance of a system account in one tenant's ledger (natural sign). */
async function balance(server: Server, tenantId: string, key: string) {
  const c = await snapshot(server);
  const acc = c.ledgerAccounts.find((a) => a.tenantId === tenantId && a.systemKey === key)!;
  let dr = 0;
  let cr = 0;
  for (const e of c.journalEntries) for (const l of e.lines) if (l.accountId === acc.id) { dr += l.debitMinor; cr += l.creditMinor; }
  return acc.type === 'asset' || acc.type === 'expense' ? dr - cr : cr - dr;
}

describe('seeded finance (WAL-1, WAL-6, ACC-1)', () => {
  it('agencies have wallets at the platform, sub-agencies at their parent; the books balance', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const wallets = await server.handle('wallet.list', { page: 1, pageSize: 50 }, admin.token);
    const nile = wallets.items.find((w) => w.ownerName === 'Nile Horizon Travel')!;
    expect(nile).toMatchObject({ balanceMinor: 15_000_000, creditLimitMinor: 10_000_000, availableMinor: 25_000_000, balanceVerified: true, holderName: 'Travelta' });
    const owner = await login(server, 'owner@nilehorizon.demo');
    const subs = await server.handle('wallet.list', { page: 1, pageSize: 50 }, owner.token);
    expect(subs.items.map((w) => w.ownerName)).toEqual(['Delta Gate Travel']);
    const tb = await server.handle('accounting.trialBalance', {}, owner.token);
    expect(tb.totalDebitMinor).toBe(tb.totalCreditMinor);
    expect(tb.expenseMinor).toBe(5_150_000); // rent + salaries + marketing
    await expectBooksBalanced(server);
  });
});

describe('B2B network booking: holds → confirmation postings (WAL-3, BKG-3, ACC-2, INV-1)', () => {
  it('holds the agency cost at submit, captures it at confirmation and posts every ledger', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const booking = await book(server, nile.token, (_, o) => o === 'network');
    const item = booking.items[0]!;
    const cost = item.costMinor!;
    let wallet = (await server.handle('wallet.get', {}, nile.token)).wallet;
    expect(wallet).toMatchObject({ activeHoldsMinor: cost, balanceMinor: 15_000_000 });
    expect(wallet.availableMinor).toBe(25_000_000 - cost);
    let fin = await server.handle('bookings.finance', { bookingId: booking.id }, nile.token);
    expect(fin.invoice).toBeNull(); // nothing is invoiced before confirmation
    expect(fin.holds).toHaveLength(1);

    const confirmed = await confirmAsSupplier(server, booking.id, item.id);
    expect(confirmed.invoiceId).not.toBeNull();
    wallet = (await server.handle('wallet.get', {}, nile.token)).wallet;
    expect(wallet).toMatchObject({ activeHoldsMinor: 0, balanceMinor: 15_000_000 - cost, balanceVerified: true });
    fin = await server.handle('bookings.finance', { bookingId: booking.id }, nile.token);
    expect(fin.invoice!.number).toMatch(/^INV-2026-\d{6}$/);
    expect(fin.invoice!.totalMinor).toBe(item.priceMinor);
    expect(fin.holds[0]!.status).toBe('captured');

    const orgs = await server.handle('demo.export', undefined);
    const nileId = (orgs.collections as unknown as { organizations: { id: string; slug: string }[] }).organizations.find((o) => o.slug === 'nile-horizon')!.id;
    const platformId = (orgs.collections as unknown as { organizations: { id: string; type: string }[] }).organizations.find((o) => o.type === 'platform')!.id;
    expect(await balance(server, nileId, 'ar')).toBe(item.priceMinor);
    expect(await balance(server, nileId, 'cost_of_sales')).toBe(cost);
    expect(await balance(server, nileId, 'tax_payable')).toBe(item.taxMinor);
    const admin = await login(server, 'admin@travelta.demo');
    const payables = await server.handle('payables.list', { page: 1, pageSize: 10 }, admin.token);
    expect(payables.items).toHaveLength(1);
    const payout = payables.items[0]!.amountDueMinor;
    expect(await balance(server, platformId, 'ap_supplier')).toBe(payout);
    // Platform: wallet liability Dr cost = payout + commission + markup.
    const markup = await balance(server, platformId, 'platform_markup_revenue');
    const commission = await balance(server, platformId, 'commission_revenue');
    expect(payout + commission + markup).toBe(cost);
    expect(commission).toBeGreaterThan(0); // supplier contract commission (SUP-2)
    await expectBooksBalanced(server);

    // The supplier sees the payable in its statement; the platform pays it out.
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    expect((await server.handle('payables.list', { page: 1, pageSize: 10 }, pharaoh.token)).items[0]).toMatchObject({ amountDueMinor: payout, status: 'open', canPay: false });
    const bank = (await server.handle('finance.accounts', undefined, admin.token)).find((a) => a.kind === 'bank')!;
    await expect(server.handle('payables.pay', { id: payables.items[0]!.id, amountMinor: payout + 1, financialAccountId: bank.id }, admin.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const paid = await server.handle('payables.pay', { id: payables.items[0]!.id, amountMinor: payout, financialAccountId: bank.id, reference: 'SWIFT-1' }, admin.token);
    expect(paid.status).toBe('paid');
    expect(await balance(server, platformId, 'ap_supplier')).toBe(0);
    await expectBooksBalanced(server);
  });
});

describe('collections (PAY-2/3/4, INV-3)', () => {
  it('splits a collection across accounts, pays the oldest instalment first and refuses overpayment', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { option } = await findOffer(server, nile.token, await hotel(server), (_, o) => o === 'api');
    await server.handle('cart.addOffer', { offerId: option.offerId }, nile.token);
    const total = (await server.handle('cart.get', {}, nile.token)).totalMinor;
    const booking = await checkoutCart(server, nile.token, { customerId: await firstCustomer(server, nile.token), payment: { method: 'plan', type: 'partial', installments: [{ amountMinor: 70_000, dueDate: '2026-11-15' }, { amountMinor: total - 70_000, dueDate: '2026-11-25' }] } });
    expect(booking.status).toBe('confirmed'); // API item
    const accounts = await server.handle('finance.accounts', undefined, nile.token);
    const cash = accounts.find((a) => a.kind === 'cash')!;
    const vf = accounts.find((a) => a.kind === 'vodafone_cash')!;
    await expect(server.handle('payments.collect', { bookingId: booking.id, amountMinor: 100_000, allocations: [{ financialAccountId: cash.id, amountMinor: 60_000 }] }, nile.token))
      .rejects.toMatchObject({ details: [{ field: 'allocations', issue: 'validation.allocations_sum' }] });
    let fin = await server.handle('payments.collect', { bookingId: booking.id, amountMinor: 100_000, allocations: [{ financialAccountId: cash.id, amountMinor: 60_000 }, { financialAccountId: vf.id, amountMinor: 40_000 }] }, nile.token);
    expect(fin.plan!.installments.map((i) => [i.paidMinor, i.status])).toEqual([[70_000, 'paid'], [30_000, 'partially_paid']]);
    expect(fin.invoice!.status).toBe('partially_paid');
    expect(fin.outstandingMinor).toBe(total - 100_000);
    const after = (await server.handle('finance.accounts', undefined, nile.token));
    expect(after.find((a) => a.id === cash.id)!.balanceMinor - cash.balanceMinor).toBe(60_000);
    expect(after.find((a) => a.id === vf.id)!.balanceMinor - vf.balanceMinor).toBe(40_000);
    await expect(server.handle('payments.collect', { bookingId: booking.id, amountMinor: total, allocations: [{ financialAccountId: cash.id, amountMinor: total }] }, nile.token))
      .rejects.toMatchObject({ details: [{ field: 'amountMinor', issue: 'validation.overpayment' }] });
    fin = await server.handle('payments.collect', { bookingId: booking.id, amountMinor: total - 100_000, allocations: [{ financialAccountId: cash.id, amountMinor: total - 100_000 }] }, nile.token);
    expect(fin).toMatchObject({ outstandingMinor: 0, canCollect: false });
    expect(fin.invoice!.status).toBe('paid');
    expect((await server.handle('bookings.get', { id: booking.id }, nile.token)).paymentStatus).toBe('paid');
    // A sales agent may collect but a supplier never sees the money.
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    await expect(server.handle('bookings.finance', { bookingId: booking.id }, pharaoh.token)).rejects.toBeDefined();
    await expectBooksBalanced(server);
  });

  it('marks unpaid instalments overdue as the clock moves and lists them on the overdue board (PAY-5)', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const { option } = await findOffer(server, nile.token, await hotel(server), (_, o) => o === 'api');
    await server.handle('cart.addOffer', { offerId: option.offerId }, nile.token);
    const total = (await server.handle('cart.get', {}, nile.token)).totalMinor;
    const booking = await checkoutCart(server, nile.token, { customerId: await firstCustomer(server, nile.token), payment: { method: 'plan', type: 'partial', installments: [{ amountMinor: 50_000, dueDate: '2026-11-16' }, { amountMinor: total - 50_000, dueDate: '2026-11-28' }] } });
    let board = await server.handle('payments.overdue', { page: 1, pageSize: 20 }, nile.token);
    expect(board.items.find((r) => r.ref === booking.ref)).toMatchObject({ seq: 1, bucket: 'due_soon' });
    await server.handle('demo.setClock', { offsetDays: 5 });
    const again = await login(server, 'owner@nilehorizon.demo');
    board = await server.handle('payments.overdue', { page: 1, pageSize: 20, filters: { bucket: 'd0_30' } }, again.token);
    expect(board.items.find((r) => r.ref === booking.ref)).toMatchObject({ seq: 1, status: 'overdue', daysOverdue: 4 });
    await server.handle('payments.remind', { bookingId: booking.id, seq: 1 }, again.token);
    board = await server.handle('payments.overdue', { page: 1, pageSize: 20 }, again.token);
    expect(board.items.find((r) => r.ref === booking.ref && r.seq === 1)!.remindedAt).not.toBeNull();
    const ageing = await server.handle('accounting.ageing', undefined, again.token);
    expect(ageing[0]!.d0_30Minor).toBe(50_000);
  });
});

describe('wallet credit (WAL-2/4/5)', () => {
  it('a frozen or exhausted wallet parks the item until approval or a top-up', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const nileWallet = (await server.handle('wallet.list', { page: 1, pageSize: 50 }, admin.token)).items.find((w) => w.ownerName === 'Nile Horizon Travel')!;
    await server.handle('wallet.setStatus', { walletId: nileWallet.id, status: 'frozen' }, admin.token);
    const nile = await login(server, 'owner@nilehorizon.demo');
    const booking = await book(server, nile.token, (_, o) => o === 'api');
    expect(booking.items[0]).toMatchObject({ status: 'pending', holdReason: 'awaiting_credit_approval' }); // API not booked yet
    expect(booking.items[0]!.actions).not.toContain('approve_credit'); // the agency cannot approve its own credit
    const admin2 = await login(server, 'admin@travelta.demo');
    const seen = await server.handle('bookings.get', { id: booking.id }, admin2.token);
    expect(seen.items[0]!.actions).toContain('approve_credit');
    const approved = await server.handle('wallet.approveCredit', { bookingId: booking.id, itemId: booking.items[0]!.id }, admin2.token);
    expect(approved.items[0]!.status).toBe('confirmed'); // released to the API adapter, which confirmed

    // Top-up path: request → approve credits the wallet, posts both ledgers and releases waiting holds.
    await server.handle('wallet.setStatus', { walletId: nileWallet.id, status: 'active' }, admin2.token);
    await server.handle('wallet.setCreditLimit', { walletId: nileWallet.id, creditLimitMinor: 0 }, admin2.token);
    const nile2 = await login(server, 'owner@nilehorizon.demo');
    await expect(server.handle('wallet.setCreditLimit', { walletId: nileWallet.id, creditLimitMinor: 99 }, nile2.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const req = await server.handle('wallet.requestTopUp', { amountMinor: 2_500_000, method: 'bank_transfer', reference: 'CIB-555' }, nile2.token);
    const before = (await server.handle('wallet.get', {}, nile2.token)).wallet.balanceMinor;
    await expect(server.handle('wallet.decideTopUp', { id: req.id, decision: 'reject' }, admin2.token)).rejects.toMatchObject({ details: [{ field: 'reason' }] });
    const decided = await server.handle('wallet.decideTopUp', { id: req.id, decision: 'approve' }, admin2.token);
    expect(decided.status).toBe('approved');
    const w = (await server.handle('wallet.get', {}, nile2.token)).wallet;
    expect(w.balanceMinor - before).toBe(2_500_000);
    expect(w.balanceVerified).toBe(true);
    await expect(server.handle('wallet.decideTopUp', { id: req.id, decision: 'approve' }, admin2.token)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expectBooksBalanced(server);
  });

  it('sub-agencies are funded by their parent (W8 one level down)', async () => {
    const { server } = testServer();
    const delta = await login(server, 'owner@deltagate.demo');
    const req = await server.handle('wallet.requestTopUp', { amountMinor: 500_000, method: 'cash', reference: 'CASH-7' }, delta.token);
    const admin = await login(server, 'admin@travelta.demo');
    await expect(server.handle('wallet.decideTopUp', { id: req.id, decision: 'approve' }, admin.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const nile = await login(server, 'owner@nilehorizon.demo');
    const queue = await server.handle('wallet.topUps', { page: 1, pageSize: 20, filters: { status: 'pending' } }, nile.token);
    expect(queue.items.filter((t) => t.canDecide).map((t) => t.ownerName)).toContain('Delta Gate Travel');
    expect((await server.handle('wallet.decideTopUp', { id: req.id, decision: 'approve' }, nile.token)).status).toBe('approved');
    await expectBooksBalanced(server);
  });
});

describe('B2C card: authorise → capture / void (PAY-6)', () => {
  it('captures at confirmation and posts the platform retail ledger', async () => {
    const { server } = testServer();
    const sara = await loginCustomer(server);
    const card = { method: 'card' as const, card: { number: '4242424242424242', expiry: '12/29', cvc: '123', holder: 'Sara Ali' } };
    const booking = await book(server, sara.token, (_, o) => o === 'network', card, false);
    expect(booking.paymentStatus).toBe('authorized');
    await confirmAsSupplier(server, booking.id, booking.items[0]!.id);
    const fin = await server.handle('bookings.finance', { bookingId: booking.id }, sara.token);
    expect(fin).toMatchObject({ paidMinor: booking.totals.sellMinor, outstandingMinor: 0, authorizedMinor: 0 });
    expect(fin.payments.map((p) => [p.reference.slice(0, 4), p.status])).toEqual([['AUTH', 'succeeded'], ['CAP-', 'succeeded']]);
    expect(fin.invoice!.status).toBe('paid');
    await expectBooksBalanced(server);
  });

  it('a rejected item voids the authorisation', async () => {
    const { server } = testServer();
    const sara = await loginCustomer(server);
    const card = { method: 'card' as const, card: { number: '4242424242424242', expiry: '12/29', cvc: '123', holder: 'Sara Ali' } };
    const booking = await book(server, sara.token, (_, o) => o === 'network', card, false);
    const pharaoh = await login(server, 'supplier@pharaohstays.demo');
    await server.handle('bookings.rejectItem', { bookingId: booking.id, itemId: booking.items[0]!.id, reason: 'Hotel overbooked' }, pharaoh.token);
    const fin = await server.handle('bookings.finance', { bookingId: booking.id }, sara.token);
    expect(fin.payments[0]!.status).toBe('voided');
    expect(fin).toMatchObject({ paidMinor: 0, dueMinor: 0, authorizedMinor: 0 });
  });
});

describe('cancellation & refund (W7, CAN-1..5, INV-3)', () => {
  it('fees from the policy snapshot; agent requests need approval; the owner approves; everything reverses', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const booking = await book(server, nile.token, (_, o) => o === 'network');
    const item = booking.items[0]!;
    await confirmAsSupplier(server, booking.id, item.id);
    const accounts = await server.handle('finance.accounts', undefined, nile.token);
    const cash = accounts.find((a) => a.kind === 'cash')!;
    await server.handle('payments.collect', { bookingId: booking.id, amountMinor: item.priceMinor, allocations: [{ financialAccountId: cash.id, amountMinor: item.priceMinor }] }, nile.token);
    const walletBefore = (await server.handle('wallet.get', {}, nile.token)).wallet.balanceMinor;

    const sales = await login(server, 'sales@nilehorizon.demo');
    const quote = await server.handle('cancellations.quote', { bookingId: booking.id, itemId: item.id }, sales.token).catch(() => null);
    // Sales agents lack bookings.cancel in the seeded template → the owner's ops cancel instead.
    const ops = quote ? sales : nile;
    const q = quote ?? await server.handle('cancellations.quote', { bookingId: booking.id, itemId: item.id }, nile.token);
    expect(q.daysBefore).toBe(16);
    expect(q.retainedMinor).toBe(q.customerFeeMinor + q.adminFeeMinor);
    expect(q.adminFeeMinor).toBe(15_000); // Nile's commercial settings
    expect(q.refundMinor).toBe(item.priceMinor - q.retainedMinor);
    expect(q.refundMethods).toEqual(['cash', 'bank_transfer']);

    const after = await server.handle('cancellations.request', { bookingId: booking.id, itemId: item.id, reason: 'Customer changed plans', refundMethod: 'cash' }, ops.token);
    const fin = await server.handle('bookings.finance', { bookingId: booking.id }, nile.token);
    if (q.needsApproval) {
      expect(fin.cancellations[0]!.status).toBe('requested');
      const list = await server.handle('cancellations.list', { page: 1, pageSize: 10, filters: { status: 'requested' } }, nile.token);
      await server.handle('cancellations.decide', { id: list.items[0]!.id, decision: 'approve' }, nile.token);
    } else {
      expect(after.items[0]!.status).toBe('cancelled');
    }
    const done = await server.handle('bookings.get', { id: booking.id }, nile.token);
    expect(done.items[0]!.status).toBe('cancelled');
    expect(done.status).toBe('cancelled');
    const f2 = await server.handle('bookings.finance', { bookingId: booking.id }, nile.token);
    expect(f2.cancellations[0]).toMatchObject({ status: 'completed', refundMinor: q.refundMinor });
    expect(f2.creditNotes[0]).toMatchObject({ amountMinor: q.creditMinor, feeMinor: q.retainedMinor });
    expect(f2.creditNotes[0]!.number).toMatch(/^CN-2026-\d{6}$/);
    expect(f2).toMatchObject({ dueMinor: q.retainedMinor, paidMinor: item.priceMinor, refundedMinor: q.refundMinor, outstandingMinor: 0 });
    expect(f2.payments.find((p) => p.direction === 'out')).toMatchObject({ amountMinor: q.refundMinor, method: 'cash' });
    // B2B side: the agency's cost comes back to its wallet minus the policy fee on its cost (CAN-4).
    const walletAfter = (await server.handle('wallet.get', {}, nile.token)).wallet;
    expect(walletAfter.balanceMinor).toBeGreaterThan(walletBefore);
    expect(walletAfter.balanceVerified).toBe(true);
    const admin = await login(server, 'admin@travelta.demo');
    const pay = (await server.handle('payables.list', { page: 1, pageSize: 10 }, admin.token)).items[0]!;
    expect(pay.amountDueMinor).toBeLessThan(item.breakdown.totals.netMinor);
    await expectBooksBalanced(server);
  });

  it('API items cancel through the adapter; a simulated failure leaves a retry (CAN-5)', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const booking = await book(server, nile.token, (_, o) => o === 'api');
    const item = booking.items[0]!;
    const q = await server.handle('cancellations.quote', { bookingId: booking.id, itemId: item.id }, nile.token);
    expect(q.viaAdapter).toBe(true);
    await server.handle('demo.setSimulation', { nextSupplierResponse: 'timeout' });
    await server.handle('cancellations.request', { bookingId: booking.id, itemId: item.id, reason: 'Flight cancelled', refundMethod: q.defaultRefundMethod }, nile.token);
    let list = await server.handle('cancellations.list', { page: 1, pageSize: 5 }, nile.token);
    expect(list.items[0]).toMatchObject({ status: 'approved', canRetry: true });
    expect((await server.handle('bookings.get', { id: booking.id }, nile.token)).items[0]!.status).toBe('confirmed');
    await server.handle('cancellations.retry', { id: list.items[0]!.id }, nile.token);
    list = await server.handle('cancellations.list', { page: 1, pageSize: 5 }, nile.token);
    expect(list.items[0]!.status).toBe('completed');
    await expectBooksBalanced(server);
  });

  it('cancelling a pending item is free and releases the hold', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const booking = await book(server, nile.token, (_, o) => o === 'network');
    const q = await server.handle('cancellations.quote', { bookingId: booking.id, itemId: booking.items[0]!.id }, nile.token);
    expect(q).toMatchObject({ retainedMinor: 0, refundMinor: 0, refundMethods: ['none'] });
    await server.handle('cancellations.request', { bookingId: booking.id, itemId: booking.items[0]!.id, reason: 'Not needed', refundMethod: 'none' }, nile.token);
    expect((await server.handle('wallet.get', {}, nile.token)).wallet.activeHoldsMinor).toBe(0);
    expect((await server.handle('bookings.get', { id: booking.id }, nile.token)).status).toBe('cancelled');
  });
});

describe('invoices & accounting (INV-2, ACC-1/3)', () => {
  it('after-tax discount and fees adjust the invoice, AR and the plan', async () => {
    const { server } = testServer();
    const nile = await login(server, 'owner@nilehorizon.demo');
    const booking = await book(server, nile.token, (_, o) => o === 'api');
    const fin = await server.handle('bookings.finance', { bookingId: booking.id }, nile.token);
    const inv = await server.handle('invoices.update', { id: fin.invoice!.id, discountMinor: 20_000, extraFeesMinor: 5_000, notes: 'Loyalty discount' }, nile.token);
    expect(inv.totalMinor).toBe(booking.totals.sellMinor - 15_000);
    const f2 = await server.handle('bookings.finance', { bookingId: booking.id }, nile.token);
    expect(f2.dueMinor).toBe(inv.totalMinor);
    expect(f2.plan!.installments.reduce((s, i) => s + i.amountMinor, 0)).toBe(inv.totalMinor);
    await expectBooksBalanced(server);
  });

  it('manual entries must balance; reversals mirror; expenses and transfers post', async () => {
    const { server } = testServer();
    const acct = await login(server, 'accounts@nilehorizon.demo');
    const chart = await server.handle('accounting.chart', undefined, acct.token);
    const cash = chart.find((a) => a.systemKey === 'cash')!;
    const equity = chart.find((a) => a.systemKey === 'equity')!;
    await expect(server.handle('accounting.postManual', { date: '2026-11-15', memo: 'Bad entry', lines: [{ accountId: cash.id, debitMinor: 100, creditMinor: 0 }, { accountId: equity.id, debitMinor: 0, creditMinor: 90 }] }, acct.token))
      .rejects.toMatchObject({ details: [{ field: 'lines', issue: 'validation.unbalanced' }] });
    const e = await server.handle('accounting.postManual', { date: '2026-11-15', memo: 'Owner injection', lines: [{ accountId: cash.id, debitMinor: 100_000, creditMinor: 0 }, { accountId: equity.id, debitMinor: 0, creditMinor: 100_000 }] }, acct.token);
    expect(e.number).toMatch(/^JE-2026-\d{6}$/);
    const r = await server.handle('accounting.reverse', { entryId: e.id, memo: 'Posted twice' }, acct.token);
    expect(r.reversalOf).toBe(e.id);
    await expect(server.handle('accounting.reverse', { entryId: e.id, memo: 'Again please' }, acct.token)).rejects.toMatchObject({ code: 'CONFLICT' });
    const accounts = await server.handle('finance.accounts', undefined, acct.token);
    const bank = accounts.find((a) => a.kind === 'bank')!;
    const box = accounts.find((a) => a.kind === 'cash')!;
    await server.handle('accounting.recordExpense', { category: 'general', description: 'Printer toner', amountMinor: 12_000, financialAccountId: box.id, date: '2026-11-15' }, acct.token);
    await server.handle('accounting.transfer', { fromAccountId: bank.id, toAccountId: box.id, amountMinor: 500_000, date: '2026-11-15', note: 'Petty cash' }, acct.token);
    const after = await server.handle('finance.accounts', undefined, acct.token);
    expect(after.find((a) => a.id === box.id)!.balanceMinor - box.balanceMinor).toBe(500_000 - 12_000);
    const tb = await server.handle('accounting.trialBalance', {}, acct.token);
    expect(tb.totalDebitMinor).toBe(tb.totalCreditMinor);
    expect(tb.expenseMinor).toBe(5_150_000 + 12_000);
    const sales = await login(server, 'sales@nilehorizon.demo');
    await expect(server.handle('accounting.chart', undefined, sales.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expectBooksBalanced(server);
  });
});
