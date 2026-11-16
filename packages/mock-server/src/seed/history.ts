import type { Permission, ServiceType } from '@travelta/contracts';
import type { ManualItemInput, Traveller } from '@travelta/schemas';
import { addDays, createRng } from '@travelta/shared';
import { DemoClock } from '../clock';
import type { DemoAdmin, RequestContext } from '../context';
import type { Database } from '../db/database';
import { EventBus } from '../events';
import { runClockJobs } from '../jobs';
import type { Principal } from '../security';
import { submitCheckout } from '../services/booking';
import { submitHooks } from '../services/booking/hooks';
import { confirmItem, rejectItem, voucherItem } from '../services/booking/lifecycle';
import { addManualItem, cartViewer, loadCart } from '../services/cart';
import { requestCancellation, quoteCancellation } from '../services/finance/cancellation';
import { collectPayment } from '../services/finance/money';
import { approveCredit, decideTopUp, ensureWallet, requestTopUp, walletDto } from '../services/finance/wallet';

const DAY = 86_400_000;

/**
 * Seeded booking history (MOCK_DATA_ARCHITECTURE §4): ~6 months of bookings created by running the REAL services
 * (manual items → checkout → supplier confirmation → collections → vouchers → cancellations), so every report, the
 * ledger and the wallets start consistent. Deterministic: a seeded random source replaces Math.random while it runs
 * (ids are the only randomness), and a moving seed clock dates each step.
 */
export function seedHistory(db: Database, anchor: number, seed: number, withHistory = true): void {
  const rng = createRng(seed ^ 0x5eed);
  const realRandom = Math.random;
  Math.random = rng.next;
  let t = anchor;
  const clock = new DemoClock(0, () => t);
  const admin: DemoAdmin = {
    status: () => { throw new Error('n/a'); }, reset: async () => undefined, exportSnapshot: () => { throw new Error('n/a'); }, importSnapshot: async () => undefined,
    setClockOffsetDays: () => undefined, setSimulation: () => undefined, takeSupplierResponse: () => 'auto',
  };
  const as = (email: string, orgId: string): RequestContext => {
    const user = db.find('users', (u) => u.email === email)!;
    const m = db.find('memberships', (x) => x.userId === user.id && x.tenantId === orgId)!;
    const role = db.get('roles', m.roleId)!;
    const principal: Principal = {
      session: { id: 'ses_seed', createdAt: clock.nowIso(), updatedAt: clock.nowIso(), version: 1, token: 'seed-token-not-a-real-session-0000000', userId: user.id, tenantId: orgId, expiresAt: clock.nowIso(), revokedAt: null } as unknown as Principal['session'],
      user, org: db.get('organizations', orgId)!, role, permissions: new Set(role.permissions as Permission[]),
    };
    return { requestId: 'req_seed', db, clock, events: new EventBus(), principal, admin };
  };
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)]!;
  const between = (a: number, b: number) => a + Math.floor(rng.next() * (b - a + 1));
  const orgBySlug = (slug: string) => db.find('organizations', (o) => o.slug === slug)!;
  const supplierOrg = (slug: string) => orgBySlug(slug).id;
  /** History never passes the seed instant (an hour before the anchor at most). */
  const advance = (ms: number) => { t = Math.min(t + ms, anchor - 3_600_000); };

  try {
    if (withHistory) generate();
    // Settle time-based state at the seed instant (auto-travelled, overdue instalments, reminders).
    t = anchor;
    runClockJobs(db, clock);
  } finally {
    Math.random = realRandom;
  }

  function generate() {
    const nile = orgBySlug('nile-horizon');
    const alnoor = orgBySlug('al-noor-umrah');
    const delta = orgBySlug('delta-gate');
    const direct = orgBySlug('travelta-direct');
    const own = (svc: ServiceType) => db.find('agencySuppliers', (a) => a.tenantId === nile.id && a.serviceTypes.includes(svc) && a.status === 'active');
    const catalogue: Record<ServiceType, { titles: string[]; net: [number, number]; nights: [number, number]; network: string }> = {
      hotel: { titles: ['Steigenberger Nile Palace — 3 nights', 'Old Cataract Aswan — 2 nights', 'Movenpick Soma Bay — 4 nights', 'Marriott Mena House — 2 nights'], net: [9_000, 28_000], nights: [2, 5], network: 'pharaoh-stays' },
      tour: { titles: ['Luxor West Bank full-day tour', 'Abu Simbel sunrise tour', 'Siwa oasis 3-day tour'], net: [2_500, 9_000], nights: [0, 0], network: 'desert-pulse' },
      activity: { titles: ['Hurghada snorkeling trip', 'Giza quad bike at sunset', 'Hot-air balloon over Luxor'], net: [1_200, 4_500], nights: [0, 0], network: 'desert-pulse' },
      transfer: { titles: ['Cairo airport private transfer', 'Hurghada ↔ El Gouna transfer', 'Luxor ↔ Aswan private car'], net: [600, 2_200], nights: [0, 0], network: 'blue-line-transfers' },
      umrah: { titles: ['Umrah 10 nights — Makkah & Madinah', 'Ramadan Umrah 7 nights'], net: [38_000, 62_000], nights: [7, 10], network: 'makkah-gateway' },
      flight: { titles: ['CAI → JED return (economy)', 'CAI → DXB return (economy)', 'CAI → IST return'], net: [9_500, 21_000], nights: [0, 0], network: 'skybridge-ticketing' },
      visa: { titles: ['Schengen visa service'], net: [3_500, 3_500], nights: [0, 0], network: 'cairo-visa-desk' },
    };
    const traveller = (i: number, lead: boolean): Traveller => ({
      type: 'adult', title: i % 2 ? 'mrs' : 'mr', firstName: pick(['Ahmed', 'Mohamed', 'Sara', 'Nour', 'Omar', 'Mona', 'Youssef', 'Hana']), lastName: pick(['Hassan', 'Ali', 'Kamal', 'Fawzy', 'Saeed', 'Adel']),
      dateOfBirth: null, nationalityIso2: 'EG', passportNo: `A${between(1_000_000, 9_999_999)}`, passportExpiry: '2031-06-30', mahram: i % 2 ? 'Husband' : null, lead,
    });

    const SELLERS = [
      { org: nile, users: ['owner@nilehorizon.demo', 'sales@nilehorizon.demo', 'sales@nilehorizon.demo'], weight: 22, services: ['hotel', 'hotel', 'tour', 'activity', 'transfer', 'flight', 'umrah'] as ServiceType[] },
      { org: alnoor, users: ['owner@alnoor.demo'], weight: 8, services: ['umrah', 'umrah', 'hotel', 'transfer'] as ServiceType[] },
      { org: delta, users: ['owner@deltagate.demo'], weight: 4, services: ['activity', 'transfer', 'tour'] as ServiceType[] },
      { org: direct, users: ['admin@travelta.demo'], weight: 8, services: ['hotel', 'activity', 'tour', 'transfer'] as ServiceType[] },
    ];
    const plan: { seller: (typeof SELLERS)[number]; daysAgo: number }[] = [];
    for (const s of SELLERS) for (let k = 0; k < s.weight; k++) plan.push({ seller: s, daysAgo: between(4, 175) });
    plan.sort((a, b) => b.daysAgo - a.daysAgo);

    let n = 0;
    for (const { seller, daysAgo } of plan) {
      n++;
      t = anchor - daysAgo * DAY + between(8, 17) * 3_600_000;
      const today = clock.today();
      const ctx = as(pick(seller.users), seller.org.id);
      // Agencies keep their wallet funded: below 80k available they top up (requested by the owner, approved by the holder).
      if (!seller.org.isPlatformRetail) {
        const w = ensureWallet(ctx, seller.org.id);
        if (walletDto(db, w).availableMinor < 8_000_000) {
          const owner = as(seller.users[0]!, seller.org.id);
          const req = requestTopUp(owner, owner.principal!, { amountMinor: pick([150_000, 200_000, 250_000]) * 100 / (seller.org.parentId ? 5 : 1), method: pick(['bank_transfer', 'instapay'] as const), reference: `TRF-${clock.today().replaceAll('-', '')}-${n}`, proof: null });
          const holder = w.heldAtOrgId === nile.id ? as('owner@nilehorizon.demo', nile.id) : as('admin@travelta.demo', db.find('organizations', (o) => o.type === 'platform')!.id);
          advance(between(1, 5) * 3_600_000);
          decideTopUp(holder, holder.principal!, db.get('topUpRequests', req.id)!, 'approve');
        }
      }
      const viewer = cartViewer(ctx);
      const customers = db.filter('customers', (c) => c.tenantId === seller.org.id);
      if (customers.length === 0) continue;
      const customer = pick(customers);
      const count = rng.next() < 0.25 ? 2 : 1;
      let cart = loadCart(ctx, viewer);
      const from = addDays(today, between(6, 45));
      const adults = between(1, 3);
      for (let k = 0; k < count; k++) {
        const svc = pick(seller.services);
        const c = catalogue[svc];
        const ownSupplier = seller.org.id === nile.id ? own(svc) : undefined;
        const useOwn = ownSupplier && rng.next() < 0.45;
        const item: ManualItemInput = {
          serviceType: svc, supplier: useOwn ? { kind: 'own', id: ownSupplier!.id } : { kind: 'network', id: supplierOrg(c.network) }, title: pick(c.titles), destinationId: null,
          from: addDays(from, k), to: c.nights[1] > 0 ? addDays(from, k + between(c.nights[0], c.nights[1])) : null,
          occupancy: { adults, children: 0, infants: 0, rooms: [] }, netMinor: between(c.net[0], c.net[1]) * 100 * (svc === 'hotel' || svc === 'umrah' || svc === 'flight' ? 1 : adults), netCurrency: 'EGP',
          markup: { mode: 'percent', value: pick([10, 12, 15, 18, 20]) }, taxProfileId: null,
          policy: { nonRefundable: false, rules: [{ daysBefore: 14, feeType: 'percent', value: 10 }, { daysBefore: 3, feeType: 'percent', value: 50 }] },
          details: {}, customerType: customer.customerType === 'vip' ? 'vip' : customer.customerType === 'corporate' ? 'corporate' : 'individual', channel: 'b2c',
        };
        cart = addManualItem(ctx, cart, viewer, item);
      }
      const partial = rng.next() < 0.4;
      const total = cart.items.reduce((s, i) => s + i.breakdown.totals.customerTotalMinor, 0);
      const first = Math.round(total * 0.3);
      const booking = submitCheckout(ctx, cart, viewer, {
        idempotencyKey: `seed-history-${n}`, customerId: customer.id, newCustomer: null,
        items: cart.items.map((i) => ({ itemId: i.id, travellers: Array.from({ length: i.occupancy.adults }, (_, j) => traveller(j, j === 0)), details: {}, acceptedPriceMinor: i.breakdown.totals.customerTotalMinor })),
        payment: partial ? { method: 'plan', type: 'partial', installments: [{ amountMinor: first, dueDate: today }, { amountMinor: total - first, dueDate: addDays(from, -2) }] } : { method: 'plan', type: 'full', installments: [] },
        notes: '',
      }, submitHooks);

      // Over-limit items: the wallet holder approves (WAL-4).
      for (const item of db.filter('bookingItems', (i) => i.bookingId === booking.id && i.holdReason === 'awaiting_credit_approval')) {
        const holder = db.get('wallets', db.find('walletHolds', (h) => h.itemId === item.id && h.awaitingApproval)!.walletId)!.heldAtOrgId;
        const approverCtx = holder === nile.id ? as('owner@nilehorizon.demo', nile.id) : as('admin@travelta.demo', db.find('organizations', (o) => o.type === 'platform')!.id);
        approveCredit(approverCtx, approverCtx.principal!, db.get('bookings', booking.id)!, item);
      }
      // Suppliers answer within a day or two.
      advance(between(2, 36) * 3_600_000);
      for (const item of db.filter('bookingItems', (i) => i.bookingId === booking.id && i.status === 'pending' && i.holdReason === 'awaiting_supplier')) {
        const supplierUser = item.supplierOrgId ? db.find('memberships', (m) => m.tenantId === item.supplierOrgId)?.userId : undefined;
        const supplierEmail = supplierUser ? db.get('users', supplierUser)!.email : null;
        const actorCtx = supplierEmail ? as(supplierEmail, item.supplierOrgId!) : ctx;
        const b = db.get('bookings', booking.id)!;
        if (rng.next() < 0.08) rejectItem(actorCtx, b, item, pick(['Fully booked on these dates', 'Rate no longer available']));
        else confirmItem(actorCtx, b, item, `${item.supplierName.slice(0, 3).toUpperCase()}-${between(10_000, 99_999)}`);
      }
      // Collections: most customers pay the first instalment (or everything) within days.
      const fin = db.filter('financialAccounts', (f) => f.tenantId === (seller.org.isPlatformRetail ? db.find('organizations', (o) => o.type === 'platform')!.id : seller.org.id) && f.active);
      const collect = (amount: number) => {
        const fresh = db.get('bookings', booking.id)!;
        if (amount <= 0 || fresh.status === 'cancelled') return;
        const a = pick(fin.filter((f) => f.kind !== 'card_gateway'));
        try { collectPayment(ctx, ctx.principal!, { bookingId: booking.id, amountMinor: amount, allocations: [{ financialAccountId: a.id, amountMinor: amount }], reference: '', note: '' }, fresh); } catch { /* nothing due */ }
      };
      advance(between(0, 3) * DAY);
      const due = () => { const b = db.get('bookings', booking.id)!; return Math.max(0, db.filter('paymentPlans', (x) => x.bookingId === b.id)[0]?.installments.reduce((s, i) => s + (i.status === 'cancelled' ? 0 : i.amountMinor - i.paidMinor), 0) ?? 0); };
      if (rng.next() < 0.9) collect(partial ? Math.min(first, due()) : due());
      if (partial && t + 12 * DAY < anchor && rng.next() < 0.7) { advance(between(5, 12) * DAY); collect(due()); }
      // Vouchers for confirmed items once paid or on a plan.
      for (const item of db.filter('bookingItems', (i) => i.bookingId === booking.id && i.status === 'confirmed')) {
        if (rng.next() < 0.75) voucherItem(ctx, db.get('bookings', booking.id)!, item);
      }
      // A few cancellations (W7) before travel.
      const cancellable = db.filter('bookingItems', (i) => i.bookingId === booking.id && (i.status === 'confirmed' || i.status === 'vouchered'));
      if (cancellable.length && rng.next() < 0.1 && t + DAY < anchor) {
        advance(DAY);
        const owner = seller.org.id === direct.id ? as('admin@travelta.demo', direct.id) : as(seller.users[0]!, seller.org.id);
        const item = cancellable[0]!;
        const b = db.get('bookings', booking.id)!;
        const q = quoteCancellation(owner, owner.principal!, b, item);
        requestCancellation(owner, owner.principal!, b, item, pick(['Customer changed travel dates', 'Medical reasons', 'Visa not issued in time']), q.defaultRefundMethod);
      }
    }
  }
}
