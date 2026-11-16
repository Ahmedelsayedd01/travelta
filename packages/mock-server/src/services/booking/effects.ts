import { checkDate } from '@travelta/domain';
import type { BookingEntity, BookingItemEntity, CalendarOverrideEntity } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../../context';
import type { Database } from '../../db/database';

/**
 * Stock (BKG-3): consumed only at confirmation, released on cancellation. Extranet/agency-own products only —
 * live APIs hold their own inventory, manual items have none. Returns false when the dates no longer have room.
 */
export function consumeStock(ctx: RequestContext, item: BookingItemEntity): boolean {
  if (!item.productId || !item.unitId || item.consume.length === 0 || item.stockConsumed) return true;
  const product = ctx.db.get('products', item.productId);
  const unit = product?.units.find((u) => u.id === item.unitId);
  if (!product || !unit) return false;
  const rows = ctx.db.filter('calendarOverrides', (o) => o.productId === product.id && o.unitId === unit.id);
  const lookup = (_unitId: string, date: string) => rows.find((r) => r.date === date);
  if (!item.consume.every((c) => checkDate(product, unit, c.date, c.quantity, lookup).ok)) return false;
  for (const c of item.consume) adjustSold(ctx.db, ctx.clock.nowIso(), product.id, unit.id, c.date, c.quantity, rows.find((r) => r.date === c.date));
  return true;
}

export function releaseStock(db: Database, now: string, item: BookingItemEntity): void {
  if (!item.productId || !item.unitId || !item.stockConsumed) return;
  for (const c of item.consume) {
    const row = db.find('calendarOverrides', (o) => o.productId === item.productId && o.unitId === item.unitId && o.date === c.date);
    adjustSold(db, now, item.productId, item.unitId, c.date, -c.quantity, row);
  }
}

function adjustSold(db: Database, now: string, productId: string, unitId: string, date: string, delta: number, row: CalendarOverrideEntity | undefined) {
  if (row) {
    db.replace('calendarOverrides', { ...row, sold: Math.max(0, row.sold + delta), updatedAt: now, version: row.version + 1 });
  } else if (delta > 0) {
    db.insert('calendarOverrides', {
      id: createId('cal', Date.parse(now)), createdAt: now, updatedAt: now, version: 1, productId, unitId, date, allotment: null, sold: delta, stopSell: false, netMinor: null,
    });
  }
}

/**
 * Money side effects of a confirmation / release. Filled by the finance modules (payments, wallet, invoices, ledger,
 * payables) and called by the lifecycle — the lifecycle never touches money directly.
 */
export interface FinanceEffects {
  onConfirmed: (ctx: RequestContext, booking: BookingEntity, item: BookingItemEntity) => void;
  onReleased: (ctx: RequestContext, booking: BookingEntity, item: BookingItemEntity) => void;
}

const registry: FinanceEffects[] = [];
export function registerFinanceEffects(effects: FinanceEffects): void {
  registry.push(effects);
}
export const financeEffects: FinanceEffects = {
  onConfirmed: (ctx, booking, item) => registry.forEach((r) => r.onConfirmed(ctx, booking, item)),
  onReleased: (ctx, booking, item) => registry.forEach((r) => r.onReleased(ctx, booking, item)),
};
