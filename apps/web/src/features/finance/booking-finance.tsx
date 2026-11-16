'use client';

import { useQuery } from '@tanstack/react-query';
import type { BookingDto, BookingFinance, CancellationQuoteDto } from '@travelta/schemas';
import { ApiClientError } from '@travelta/api-client';
import { Ban, BellRing, CalendarClock, CircleDollarSign, CreditCard, FileText, ShieldCheck, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useApi } from '@/components/api-provider';
import { StatusBadge } from '@/components/data/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PaymentPlanEditor, planInstallments, type PlanDraft } from '@/features/checkout/payment-step';
import { useDemoToday } from '@/features/demo/hooks';
import { useDateFormat } from '@/features/bookings/bookings-page';
import type { ActionRenderers, ActionTarget } from '@/features/bookings/item-actions';
import { priceOf } from '@/features/search/format';
import { Link } from '@/i18n/navigation';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { CollectDialog, FINANCE_KEYS, fromMinor } from './collect-dialog';

export function useBookingFinance(bookingId: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: ['finance', 'booking', bookingId], queryFn: () => api.call('bookings.finance', { bookingId }), enabled });
}

const INVOICE_BASE: Record<string, string> = { platform: '/admin/accounting/invoices', agency: '/agency/invoices' };

function Row({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return <div className="flex items-baseline justify-between gap-4 text-sm"><span className="text-fg-muted">{label}</span><span className={strong ? 'tabular font-semibold text-fg' : 'tabular text-fg'}>{children}</span></div>;
}

/** Booking money (W6/W7): summary, plan, payments, invoice, credit notes, cancellations and wallet holds. */
export function BookingFinancePanel({ booking }: { booking: BookingDto }) {
  const t = useTranslations('finance');
  const te = useTranslations('enums');
  const locale = useLocale() as 'en' | 'ar';
  const date = useDateFormat();
  const api = useApi();
  const orgType = useSession((s) => s.session?.organization.type) ?? 'agency';
  const fin = useBookingFinance(booking.id, booking.audience !== 'supplier');
  const [collect, setCollect] = useState(false);
  const [plan, setPlan] = useState(false);
  const [payNow, setPayNow] = useState(false);
  const remind = useAction((seq: number) => api.call('payments.remind', { bookingId: booking.id, seq }), { success: t('reminderSent'), invalidate: [['payments']] });
  if (booking.audience === 'supplier') return null;
  if (!fin.data) return <Skeleton className="h-64 w-full" />;
  const f = fin.data;
  const money = (m: number) => priceOf(m, f.currency, locale);
  const staff = booking.audience !== 'customer';
  return (
    <Card data-testid="booking-finance">
      <CardHeader title={t('moneyTitle')} description={t('moneyDescription')} actions={
        <div className="flex flex-wrap gap-2">
          {f.canEditPlan && <Button size="sm" variant="outline" onClick={() => setPlan(true)} data-testid="edit-plan"><CalendarClock aria-hidden />{t('editPlan')}</Button>}
          {f.canCollect && <Button size="sm" onClick={() => setCollect(true)} data-testid="collect-payment"><CircleDollarSign aria-hidden />{t('collect')}</Button>}
          {booking.audience === 'customer' && booking.status !== 'cancelled' && f.outstandingMinor > 0 && <Button size="sm" onClick={() => setPayNow(true)} data-testid="pay-now"><CreditCard aria-hidden />{t('payNow')}</Button>}
        </div>
      } />
      <CardBody className="flex flex-col gap-5">
        <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          <Row label={t('due')} strong>{money(f.dueMinor)}</Row>
          <Row label={t('paid')}>{money(f.paidMinor)}</Row>
          {f.refundedMinor > 0 && <Row label={t('refunded')}>{money(f.refundedMinor)}</Row>}
          {f.authorizedMinor > 0 && <Row label={t('authorized')}>{money(f.authorizedMinor)}</Row>}
          <Row label={t('outstanding')} strong><span data-testid="outstanding">{money(Math.max(0, f.outstandingMinor))}</span></Row>
          {f.outstandingMinor < 0 && <Row label={t('customerCredit')}>{money(-f.outstandingMinor)}</Row>}
        </div>

        {f.plan && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">{t('plan')}<Badge tone="neutral">{te(`paymentType.${f.plan.type}`)}</Badge></h3>
            <ul className="divide-y divide-border rounded-lg border border-border" data-testid="plan-rows">
              {f.plan.installments.map((i) => (
                <li key={i.seq} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-installment={i.seq} data-status={i.status}>
                  <span className="font-medium text-fg">{t('installmentN', { n: i.seq })} · <span className="text-fg-muted">{date(i.dueDate)}</span></span>
                  <span className="flex items-center gap-2">
                    <span className="tabular">{money(i.paidMinor)} / {money(i.amountMinor)}</span>
                    <StatusBadge kind="installmentStatus" value={i.status} />
                    {staff && f.canCollect && (i.status === 'overdue' || i.status === 'pending' || i.status === 'partially_paid') && (
                      <Button size="sm" variant="ghost" onClick={() => remind.mutate(i.seq)} aria-label={t('remind')} title={t('remind')}><BellRing aria-hidden /></Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg">{t('payments')}</h3>
          {f.payments.length === 0 ? <p className="text-sm text-fg-muted">{t('noPayments')}</p> : (
            <ul className="divide-y divide-border rounded-lg border border-border" data-testid="payment-rows">
              {f.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-fg-muted" dir="ltr">{p.reference}</span>
                    <span className="block text-fg">{te(`paymentMethod.${p.method}`)}{p.cardLast4 && ` ·••${p.cardLast4}`}{p.accountNames.length > 0 && staff && ` · ${p.accountNames.join(' + ')}`}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={p.direction === 'out' ? 'tabular font-medium text-danger' : 'tabular font-medium text-fg'}>{p.direction === 'out' ? '−' : ''}{money(p.amountMinor)}</span>
                    <StatusBadge kind="paymentStatus" value={p.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {(f.invoice || f.creditNotes.length > 0) && (
          <section className="flex flex-wrap items-center gap-3 rounded-lg bg-subtle px-3 py-2 text-sm">
            {f.invoice && (
              <>
                <FileText className="size-4 text-fg-muted" aria-hidden />
                <span className="font-mono" dir="ltr">{f.invoice.number}</span>
                <StatusBadge kind="invoiceStatus" value={f.invoice.status} />
                {staff && INVOICE_BASE[orgType] && <Link href={`${INVOICE_BASE[orgType]}/${f.invoice.id}`} className="font-medium text-primary hover:underline" data-testid="invoice-link">{t('viewInvoice')}</Link>}
              </>
            )}
            {f.creditNotes.map((c) => <Badge key={c.id} tone="neutral"><span dir="ltr">{c.number}</span> · {money(c.amountMinor)}</Badge>)}
          </section>
        )}

        {f.cancellations.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">{t('cancellations')}</h3>
            <ul className="flex flex-col gap-2" data-testid="cancellation-rows">
              {f.cancellations.map((c) => (
                <li key={c.id} className="rounded-lg border border-border px-3 py-2 text-sm" data-status={c.status}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-fg">{c.itemTitle[locale]}</span>
                    <Badge tone={c.status === 'completed' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning'}>{t(`cancel_${c.status}`)}</Badge>
                  </div>
                  <p className="text-fg-muted">{c.reason} · {c.requestedByName}</p>
                  <p className="tabular text-fg-muted">{t('feeRefund', { fee: money(c.customerFeeMinor + c.adminFeeMinor), refund: money(c.refundMinor) })}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {f.holds.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg"><Wallet className="size-4" aria-hidden />{t('walletHolds')}</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {f.holds.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>{h.walletOwnerName}</span>
                  <span className="flex items-center gap-2"><span className="tabular">{money(h.amountMinor)}</span><Badge tone={h.awaitingApproval ? 'warning' : h.status === 'captured' ? 'success' : h.status === 'released' ? 'neutral' : 'info'}>{h.awaitingApproval ? t('awaitingApproval') : t(`hold_${h.status}`)}</Badge></span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardBody>
      {collect && <CollectDialog open={collect} onClose={() => setCollect(false)} finance={f} />}
      {plan && <EditPlanDialog booking={booking} finance={f} onClose={() => setPlan(false)} />}
      {payNow && <PayNowDialog bookingId={booking.id} amount={money(f.outstandingMinor)} onClose={() => setPayNow(false)} />}
    </Card>
  );
}

function EditPlanDialog({ booking, finance, onClose }: { booking: BookingDto; finance: BookingFinance; onClose: () => void }) {
  const t = useTranslations('finance');
  const api = useApi();
  const today = useDemoToday();
  const [draft, setDraft] = useState<PlanDraft>({ type: finance.plan?.type ?? 'full', installments: (finance.plan?.type === 'partial' ? finance.plan.installments : []).map((i) => ({ amount: fromMinor(i.amountMinor), dueDate: i.dueDate })) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => api.call('payments.updatePlan', { bookingId: booking.id, type: draft.type, installments: draft.type === 'partial' ? planInstallments(draft) : [] }), { success: t('planSaved'), invalidate: FINANCE_KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('editPlan')} description={t('editPlanBody')} size="md"
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? Object.fromEntries(Object.entries(e.fieldErrors()).map(([k, v]) => [`payment.${k}`, v])) : {}) })} loading={save.isPending} data-testid="plan-save">{t('save')}</Button></>}>
      <PaymentPlanEditor value={draft} onChange={setDraft} totalMinor={finance.dueMinor} currency={finance.currency} today={today} serviceStart={booking.travelStart} errors={errors} />
    </Dialog>
  );
}

/** PAY-6: storefront customers settle a pay-later (or partly paid) booking online by card. */
function PayNowDialog({ bookingId, amount, onClose }: { bookingId: string; amount: string; onClose: () => void }) {
  const t = useTranslations('finance');
  const api = useApi();
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '', holder: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pay = useAction(() => api.call('account.payByCard', { bookingId, card }), { success: t('paidOnline'), invalidate: FINANCE_KEYS, onSuccess: onClose });
  const err = (f: string) => errors[`card.${f}`];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('payNowTitle', { amount })} description={t('payNowBody')}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => pay.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={pay.isPending} data-testid="pay-now-submit"><CreditCard aria-hidden />{t('payAmount', { amount })}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3" data-testid="pay-now-form">
        <Field label={t('cardNumber')} className="sm:col-span-3" error={err('number') ?? errors['payment.card.number']}><Input name="cardNumber" dir="ltr" inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} /></Field>
        <Field label={t('expiry')} error={err('expiry')}><Input name="expiry" dir="ltr" placeholder="MM/YY" autoComplete="cc-exp" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} /></Field>
        <Field label={t('cvc')} error={err('cvc')}><Input name="cvc" dir="ltr" autoComplete="cc-csc" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} /></Field>
        <Field label={t('holder')} error={err('holder')}><Input name="holder" autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} /></Field>
      </div>
      <p className="text-xs text-fg-muted">{t('testCardHint')}</p>
    </Dialog>
  );
}

/** W7 cancel action: fee preview (CAN-1/2), refund (CAN-3), reason and method; approval when required (CAN-4). */
function CancelAction({ target }: { target: ActionTarget }) {
  const t = useTranslations('finance');
  const tb = useTranslations('bookings');
  const locale = useLocale();
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<CancellationQuoteDto['refundMethods'][number] | ''>('');
  const quote = useQuery({ queryKey: ['cancellations', 'quote', target.itemId], queryFn: () => api.call('cancellations.quote', { bookingId: target.bookingId, itemId: target.itemId }), enabled: open });
  const q = quote.data;
  const chosen = method || q?.defaultRefundMethod || 'none';
  const close = () => { setOpen(false); setReason(''); setMethod(''); };
  const submit = useAction(() => api.call('cancellations.request', { bookingId: target.bookingId, itemId: target.itemId, reason, refundMethod: chosen }), {
    success: () => (q?.needsApproval ? t('cancelRequested') : t('cancelDone')), invalidate: FINANCE_KEYS, onSuccess: close,
  });
  const money = (m: number) => priceOf(m, q?.currency ?? 'EGP', locale);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-action="cancel"><Ban aria-hidden />{t('cancelItem')}</Button>
      <Dialog open={open} onOpenChange={(o) => !o && close()} title={t('cancelTitle', { title: target.title })} description={t('cancelBody')}
        footer={<><Button variant="outline" onClick={close}>{t('keepItem')}</Button><Button variant="danger" onClick={() => submit.mutate()} loading={submit.isPending} disabled={!q || reason.trim().length < 3} data-testid="cancel-submit">{q?.needsApproval ? t('requestCancel') : t('confirmCancel')}</Button></>}>
        {!q ? <Skeleton className="h-40 w-full" /> : (
          <div className="flex flex-col gap-4" data-testid="cancel-quote">
            <div className="flex flex-col gap-1.5 rounded-lg bg-subtle px-4 py-3">
              <Row label={t('cancelledValue')}>{money(q.sellMinor)}</Row>
              <Row label={t('policyFee', { days: q.daysBefore })}>{money(q.customerFeeMinor)}</Row>
              {q.adminFeeMinor > 0 && <Row label={t('adminFee')}>{money(q.adminFeeMinor)}</Row>}
              <Row label={t('creditNote')}>{money(q.creditMinor)}</Row>
              <Row label={t('refundToCustomer')} strong><span data-testid="refund-amount">{money(q.refundMinor)}</span></Row>
            </div>
            {q.status === 'pending' && <p className="text-sm text-fg-muted">{t('pendingFree')}</p>}
            {q.viaAdapter && <p className="text-sm text-info">{t('viaAdapter')}</p>}
            {q.needsApproval && <p className="flex items-center gap-1.5 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning"><ShieldCheck className="size-4" aria-hidden />{t('needsApproval')}</p>}
            {q.refundMinor > 0 && (
              <Field label={t('refundMethod')}>
                <Select name="refundMethod" value={chosen} onChange={(e) => setMethod(e.target.value as typeof chosen)}>
                  {q.refundMethods.map((m) => <option key={m} value={m}>{t(`refund_${m}`)}</option>)}
                </Select>
              </Field>
            )}
            <Field label={tb('reason')} required><Textarea name="cancelReason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </div>
        )}
      </Dialog>
    </>
  );
}

/** WAL-4 over-limit approval by platform ops or the parent agency. */
function ApproveCreditAction({ target }: { target: ActionTarget }) {
  const t = useTranslations('finance');
  const api = useApi();
  const approve = useAction(() => api.call('wallet.approveCredit', { bookingId: target.bookingId, itemId: target.itemId }), { success: t('creditApproved'), invalidate: FINANCE_KEYS });
  return <Button size="sm" onClick={() => approve.mutate()} loading={approve.isPending} data-action="approve_credit"><ShieldCheck aria-hidden />{t('approveCredit')}</Button>;
}

export const FINANCE_ACTIONS: ActionRenderers = {
  cancel: (target) => <CancelAction target={target} />,
  approve_credit: (target) => <ApproveCreditAction target={target} />,
};
