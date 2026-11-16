import { documentNumber, invoiceTotal, signed } from '@travelta/domain';
import type { BookingEntity, BookingItemEntity, InvoiceEntity, SupplierPayableEntity } from '@travelta/schemas';
import { addDays, createId } from '@travelta/shared';
import type { RequestContext } from '../../context';
import type { Database } from '../../db/database';
import { isApi } from '../booking/actions';
import { customerParty } from './money';
import { ledgerTenant, post, type Party, type PostLine } from './ledger';
import { legsFor, type Leg } from './wallet';

const platformId = (db: Database) => db.find('organizations', (o) => o.type === 'platform')!.id;
const orgParty = (db: Database, id: string): Party => ({ kind: 'agency', id, name: db.get('organizations', id)?.name.en ?? id });
export const supplierParty = (item: BookingItemEntity): Party => ({ kind: 'supplier', id: item.supplierOrgId ?? item.agencySupplierId ?? item.source, name: item.supplierName });

/** Settlement split used by the platform side of a leg: payout to the supplier, commission, and the platform markup (plug). */
function holderCredits(db: Database, leg: Leg, item: BookingItemEntity, sign: 1 | -1): PostLine[] {
  const s = item.breakdown.settlement;
  if (leg.holderOrgId !== platformId(db)) return [signed({ key: 'sales_revenue' as const }, -sign * leg.amountMinor)];
  const commission = s.commissionBeneficiary === 'platform' ? s.commissionMinor : 0;
  return [
    signed({ key: 'ap_supplier' as const, party: supplierParty(item) }, -sign * s.supplierPayoutMinor),
    signed({ key: 'commission_revenue' as const }, -sign * commission),
    signed({ key: 'platform_markup_revenue' as const }, -sign * (leg.amountMinor - s.supplierPayoutMinor - commission)),
  ];
}

/**
 * ACC-2 at confirmation (BKG-3): every ledger involved posts from the item's finalized breakdown.
 * - Each wallet leg: payer Cost of sales ← Prepaid wallet; holder Wallet liability → payable/commission/markup (platform) or sales (parent agency).
 * - No legs (own supplier, platform retail): seller Cost of sales (net) → Supplier payable (payout) + Commission revenue.
 * - Customer side: seller AR (sell) → Sales revenue (pre-tax) + Tax payable.
 */
export function postConfirmation(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity): void {
  const db = ctx.db;
  const s = item.breakdown.settlement;
  const sell = item.breakdown.totals.customerTotalMinor;
  const tax = item.breakdown.totals.taxMinor;
  const seller = ledgerTenant(db, b.tenantId);
  const memo = `${b.ref} · ${item.title.en}`;
  const base = { source: 'booking' as const, sourceId: item.id, bookingId: b.id, currency: b.currency };
  const legs = legsFor(db, b, item);
  for (const leg of legs) {
    post(ctx, { ...base, tenantId: leg.payerOrgId, memo: `Cost · ${memo}`, lines: [
      { key: 'cost_of_sales', debitMinor: leg.amountMinor, creditMinor: 0 },
      { key: 'prepaid_wallet', debitMinor: 0, creditMinor: leg.amountMinor },
    ] });
    post(ctx, { ...base, tenantId: leg.holderOrgId, memo: `B2B sale · ${memo}`, lines: [
      { key: 'agency_wallet_liability', debitMinor: leg.amountMinor, creditMinor: 0, party: orgParty(db, leg.payerOrgId) },
      ...holderCredits(db, leg, item, 1),
    ] });
  }
  if (legs.length === 0) {
    post(ctx, { ...base, tenantId: seller, memo: `Cost · ${memo}`, lines: [
      { key: 'cost_of_sales', debitMinor: item.breakdown.totals.netMinor, creditMinor: 0 },
      { key: 'ap_supplier', debitMinor: 0, creditMinor: s.supplierPayoutMinor, party: supplierParty(item) },
      signed({ key: 'commission_revenue' as const }, -(item.breakdown.totals.netMinor - s.supplierPayoutMinor)),
    ] });
  }
  post(ctx, { ...base, tenantId: seller, memo: `Sale · ${memo}`, lines: [
    { key: 'ar', debitMinor: sell, creditMinor: 0, party: customerParty(db, b) },
    { key: 'sales_revenue', debitMinor: 0, creditMinor: sell - tax },
    { key: 'tax_payable', debitMinor: 0, creditMinor: tax },
  ] });
  createPayable(ctx, b, item, legs.length > 0 ? platformId(db) : seller);
}

/** SUP-3: the payable (payout = net − commission) is owed by whoever posted it; due 7 days after the service ends. */
function createPayable(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity, payerTenantId: string): void {
  const amount = item.breakdown.settlement.supplierPayoutMinor;
  if (amount <= 0) return;
  const now = ctx.clock.nowIso();
  const row: SupplierPayableEntity = {
    id: createId('pyb', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: payerTenantId, bookingId: b.id, itemId: item.id,
    supplierKind: isApi(item) ? 'api' : item.ownership === 'agency_own' ? 'own' : 'network',
    supplierRefId: item.supplierOrgId ?? item.agencySupplierId ?? item.source, supplierName: item.supplierName, currency: b.currency,
    amountDueMinor: amount, amountPaidMinor: 0, dueDate: addDays(item.to ?? item.from, 7), status: 'open',
  };
  ctx.db.insert('supplierPayables', row);
}

// ---- Invoices (INV-1..3) -------------------------------------------------------------------------------------------
export function recomputeInvoice(inv: InvoiceEntity): InvoiceEntity {
  const taxMinor = inv.lines.reduce((s, l) => s + l.taxMinor, 0);
  const gross = inv.lines.reduce((s, l) => s + l.amountMinor, 0);
  return { ...inv, subtotalMinor: gross - taxMinor, taxMinor, totalMinor: invoiceTotal(inv.lines, inv.discountMinor, inv.extraFeesMinor) };
}

/** INV-1: the invoice is issued at the first confirmation and gains a line per confirmed item; numbered per tenant. */
export function invoiceItem(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity): InvoiceEntity {
  const db = ctx.db;
  const now = ctx.clock.nowIso();
  const line = { itemId: item.id, description: `${item.title.en} — ${item.subtitle.en}`, amountMinor: item.breakdown.totals.customerTotalMinor, taxMinor: item.breakdown.totals.taxMinor };
  const existing = b.invoiceId ? db.get('invoices', b.invoiceId) : undefined;
  if (existing) {
    if (existing.lines.some((l) => l.itemId === item.id)) return existing;
    const next = recomputeInvoice({ ...existing, lines: [...existing.lines, line], updatedAt: now, version: existing.version + 1 });
    db.replace('invoices', next);
    return next;
  }
  const customer = b.customerId ? db.get('customers', b.customerId) : undefined;
  const today = ctx.clock.today();
  const inv = recomputeInvoice({
    id: createId('inv', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: b.tenantId,
    number: documentNumber('INV', today, db.nextSequence(`invoice:${b.tenantId}:${today.slice(0, 4)}`)),
    bookingId: b.id, customerId: b.customerId, billTo: { name: customer?.name ?? b.leadTraveller, email: customer?.email ?? '', phone: customer?.phone ?? '' },
    currency: b.currency, lines: [line], subtotalMinor: 0, taxMinor: 0, discountMinor: 0, extraFeesMinor: 0, totalMinor: 0, paidMinor: 0, creditedMinor: 0,
    status: 'issued', notes: '', issuedAt: now,
  });
  db.insert('invoices', inv);
  db.replace('bookings', { ...db.get('bookings', b.id)!, invoiceId: inv.id, updatedAt: now });
  for (const p of db.filter('payments', (x) => x.bookingId === b.id && x.invoiceId === null)) db.replace('payments', { ...p, invoiceId: inv.id });
  return inv;
}

/** INV-2 adjustments after tax: discount lowers AR against sales; extra fees raise AR against fee revenue. */
export function postInvoiceAdjustment(ctx: RequestContext, inv: InvoiceEntity, discountDelta: number, feesDelta: number): void {
  const b = ctx.db.get('bookings', inv.bookingId)!;
  const tenantId = ledgerTenant(ctx.db, inv.tenantId);
  const party = customerParty(ctx.db, b);
  const base = { tenantId, source: 'adjustment' as const, sourceId: inv.id, bookingId: b.id, currency: inv.currency };
  if (discountDelta !== 0) post(ctx, { ...base, memo: `Invoice ${inv.number} discount`, lines: [signed({ key: 'sales_revenue' as const }, discountDelta), signed({ key: 'ar' as const, party }, -discountDelta)] });
  if (feesDelta !== 0) post(ctx, { ...base, memo: `Invoice ${inv.number} extra fees`, lines: [signed({ key: 'ar' as const, party }, feesDelta), signed({ key: 'fee_revenue' as const }, -feesDelta)] });
}
