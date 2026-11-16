import { refreshStatuses } from '@travelta/domain';
import type { DemoClock } from '../../clock';
import type { Database } from '../../db/database';
import { registerFinanceEffects } from '../booking/effects';
import { isApi } from '../booking/actions';
import { logEvent } from '../booking';
import { bookWithAdapter, cancelConfirmedItem, cancelPendingItem } from '../booking/lifecycle';
import { bindLifecycle } from './cancellation';
import { captureCard, refreshBookingMoney } from './money';
import { invoiceItem, postConfirmation } from './posting';
import { captureHolds, releaseHolds, setUnblockHandler } from './wallet';

/**
 * Finance side of the booking lifecycle (BKG-3): confirmation captures wallet holds, posts the ledger, issues the
 * invoice, creates the supplier payable and captures the card; releases free holds and void card authorisations.
 */
registerFinanceEffects({
  onConfirmed: (ctx, booking, item) => {
    captureHolds(ctx, booking, item);
    postConfirmation(ctx, booking, item);
    invoiceItem(ctx, ctx.db.get('bookings', booking.id)!, item);
    captureCard(ctx, ctx.db.get('bookings', booking.id)!, item.id, item.breakdown.totals.customerTotalMinor);
    refreshBookingMoney(ctx, booking.id);
  },
  onReleased: (ctx, booking, item) => {
    releaseHolds(ctx, item);
    refreshBookingMoney(ctx, booking.id);
  },
});

// WAL-4: once every hold of an item fits (top-up, higher limit or approval) it goes to its supplier; API items book now.
setUnblockHandler((ctx, b, item, reason) => {
  const next = { ...item, holdReason: 'awaiting_supplier' as const, updatedAt: ctx.clock.nowIso(), version: item.version + 1 };
  ctx.db.replace('bookingItems', next);
  logEvent(ctx, b, item.id, 'pending', 'pending', reason);
  if (isApi(next)) bookWithAdapter(ctx, ctx.db.get('bookings', b.id)!, next);
});

bindLifecycle({ cancelPending: cancelPendingItem, cancelConfirmed: cancelConfirmedItem });

/** PAY-5 clock job: instalments past their due date become `overdue` (and back when the clock moves back). */
export function runInstallmentJob(db: Database, clock: DemoClock): boolean {
  const today = clock.today();
  let changed = false;
  for (const plan of db.all('paymentPlans')) {
    const installments = refreshStatuses(plan.installments, today);
    if (installments.some((r, i) => r.status !== plan.installments[i]!.status)) {
      db.replace('paymentPlans', { ...plan, installments, updatedAt: clock.nowIso(), version: plan.version + 1 });
      changed = true;
    }
  }
  return changed;
}

export const financeReady = true;
