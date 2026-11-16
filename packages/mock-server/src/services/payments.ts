import { buildSchedule, validateInstallments } from '@travelta/domain';
import type { BookingEntity, CheckoutPayment, PaymentEntity, PaymentPlanEntity } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../context';
import { ApiException, invalid } from '../errors';

/** PAY-7: Paymob for EGP, Stripe otherwise (simulated — no external calls). */
export const gatewayFor = (currency: string): PaymentEntity['gateway'] => (currency === 'EGP' ? 'paymob' : 'stripe');

/** MOCK_DATA_ARCHITECTURE §6 test cards. */
export function authorizeCard(card: { number: string; threeDsCode?: string }): { last4: string } {
  const n = card.number.replace(/\s/g, '');
  if (n === '4000000000000002') throw new ApiException('PAYMENT_DECLINED', 'The card was declined', [{ field: 'payment.card.number', issue: 'validation.card_declined' }]);
  if (n === '4000000000009995') throw new ApiException('PAYMENT_DECLINED', 'Insufficient funds on the card', [{ field: 'payment.card.number', issue: 'validation.card_insufficient' }]);
  if (n === '4000000000003220' && card.threeDsCode !== '123456') {
    throw new ApiException('PAYMENT_DECLINED', '3-D Secure verification failed', [{ field: 'payment.card.threeDsCode', issue: 'validation.three_ds' }]);
  }
  if (!luhn(n)) throw invalid([{ field: 'payment.card.number', issue: 'validation.card_number' }]);
  return { last4: n.slice(-4) };
}

function luhn(n: string): boolean {
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Creates the customer payment plan at checkout (PAY-1/2). Staff only — storefront card/pay-later map to full/later. */
export function createPlan(ctx: RequestContext, booking: BookingEntity, payment: CheckoutPayment): PaymentPlanEntity {
  const today = ctx.clock.today();
  const type = payment.method === 'plan' ? payment.type : payment.method === 'card' ? 'full' : 'later';
  const drafts = payment.method === 'plan' ? payment.installments ?? [] : [];
  if (type === 'partial') {
    const issues = validateInstallments(drafts, booking.totals.sellMinor, today, booking.travelStart);
    if (issues.length) {
      throw invalid(issues.map((i) => ({ field: i.index === null ? 'payment.installments' : `payment.installments.${i.index}.${i.field}`, issue: i.issue })), 'Instalments do not match the booking total');
    }
  }
  const now = ctx.clock.nowIso();
  return ctx.db.insert('paymentPlans', {
    id: createId('plan', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: booking.tenantId,
    bookingId: booking.id, type, currency: booking.currency,
    installments: buildSchedule(type, drafts, booking.totals.sellMinor, today, booking.travelStart),
  });
}

/** Storefront card checkout: authorise the full amount now; captured per item at confirmation (PAY-6). */
export function recordAuthorization(ctx: RequestContext, booking: BookingEntity, last4: string): PaymentEntity {
  const now = ctx.clock.nowIso();
  return ctx.db.insert('payments', {
    id: createId('pay', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: booking.tenantId,
    bookingId: booking.id, invoiceId: null, customerId: booking.customerId, direction: 'in', method: 'card', gateway: gatewayFor(booking.currency),
    amountMinor: booking.totals.sellMinor, currency: booking.currency, status: 'authorized', allocations: [],
    reference: `AUTH-${booking.ref}`, cardLast4: last4, receivedAt: now, recordedByUserId: null, journalEntryId: null, note: '',
  });
}
