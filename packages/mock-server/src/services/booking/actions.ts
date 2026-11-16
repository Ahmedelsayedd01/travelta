import type { BoardItem, BookingEntity, BookingItemEntity } from '@travelta/schemas';
import type { RequestContext } from '../../context';
import type { Principal } from '../../security';

type Action = BoardItem['actions'][number];

export const isApi = (i: BookingItemEntity) => i.source === 'tbo' || i.source === 'hotelbeds';
const sellerSide = (ctx: RequestContext, p: Principal, b: BookingEntity) =>
  b.tenantId === p.org.id || ctx.db.get('organizations', b.tenantId)?.parentId === p.org.id;

/** Who may do what with an item right now (W5, W9). The same rules guard the mutations below. */
export function itemActions(ctx: RequestContext, p: Principal, b: BookingEntity, item: BookingItemEntity): Action[] {
  if (p.user.userType === 'customer') {
    // W12: storefront customers cancel their own items before travel (fees per the policy snapshot, refund to card).
    const own = ctx.db.get('customers', b.customerId ?? '')?.userId === p.user.id;
    return own && ['pending', 'confirmed', 'vouchered'].includes(item.status) && item.from > ctx.clock.today() ? ['cancel'] : [];
  }
  if (p.user.userType !== 'staff') return [];
  const has = (perm: Parameters<Principal['permissions']['has']>[0]) => p.permissions.has(perm);
  const platform = p.org.type === 'platform';
  const out: Action[] = [];
  const awaitingCredit = item.status === 'pending' && item.holdReason === 'awaiting_credit_approval';
  // Confirm / reject: the party that owns the supply relationship (or platform ops on its behalf).
  const owner = p.org.type === 'supplier' ? item.supplierOrgId === p.org.id
    : platform ? item.ownership !== 'agency_own' && !isApi(item)
      : sellerSide(ctx, p, b) && item.ownership === 'agency_own';
  if (item.status === 'pending' && !awaitingCredit && item.holdReason !== 'awaiting_payment' && owner && has('bookings.confirm')) out.push('confirm', 'reject');
  if (awaitingCredit && (platform || (p.org.type === 'agency' && b.tenantId !== p.org.id && sellerSide(ctx, p, b))) && has('wallet.credit_manage')) out.push('approve_credit');
  const seller = platform || (p.org.type === 'agency' && sellerSide(ctx, p, b));
  if (seller && item.status === 'pending' && isApi(item) && item.holdReason === 'awaiting_supplier' && has('bookings.create')) out.push('retry');
  if (seller && has('bookings.voucher') && item.status === 'confirmed' && voucherAllowed(ctx, b, item)) out.push('voucher');
  if (seller && has('bookings.voucher') && item.status === 'vouchered' && item.from <= ctx.clock.today()) out.push('no_show');
  if (seller && has('bookings.cancel') && ['pending', 'confirmed', 'vouchered'].includes(item.status) && (item.to ?? item.from) >= ctx.clock.today()) out.push('cancel');
  return out;
}

/** BKG-6: confirmed, has a supplier reference, and the booking is fully paid or on an agreed payment plan. */
export function voucherAllowed(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity): boolean {
  if (item.status !== 'confirmed' || !item.supplierRef) return false;
  if (b.paymentStatus === 'paid') return true;
  const plan = ctx.db.find('paymentPlans', (x) => x.bookingId === b.id);
  return plan !== undefined && plan.type !== 'full';
}

