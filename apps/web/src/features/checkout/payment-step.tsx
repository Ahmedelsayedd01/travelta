'use client';

import type { PaymentType } from '@travelta/contracts';
import { validateInstallments } from '@travelta/domain';
import { CheckCircle2, CircleAlert, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { priceOf } from '@/features/search/format';
import { cn } from '@/lib/cn';

export interface PlanDraft { type: PaymentType; installments: { amount: string; dueDate: string }[] }
const TYPES: PaymentType[] = ['full', 'partial', 'later'];
const toMinor = (v: string) => Math.round(Number(v || '0') * 100);

export function planInstallments(p: PlanDraft) {
  return p.installments.map((i) => ({ amountMinor: toMinor(i.amount), dueDate: i.dueDate }));
}

/** PAY-1/2 editor: full / partial (instalments validated live with the same domain rule as the server) / later. */
export function PaymentPlanEditor({ value, onChange, totalMinor, currency, today, serviceStart, errors }: {
  value: PlanDraft; onChange: (v: PlanDraft) => void; totalMinor: number; currency: string; today: string; serviceStart: string; errors: Record<string, string>;
}) {
  const t = useTranslations('checkout');
  const te = useTranslations('enums.paymentType');
  const tv = useTranslations();
  const locale = useLocale();
  const drafts = planInstallments(value);
  const issues = value.type === 'partial' ? validateInstallments(drafts, totalMinor, today, serviceStart) : [];
  const scheduled = drafts.reduce((a, d) => a + d.amountMinor, 0);
  // Live hints only for rows the user has started filling; server errors always show.
  const rowIssue = (i: number, f: string) => errors[`payment.installments.${i}.${f}`] ?? (value.installments[i]?.amount === '' ? undefined : issues.find((x) => x.index === i && x.field === f)?.issue);

  const splitEven = () => {
    const n = Math.max(2, value.installments.length);
    const base = Math.floor(totalMinor / n);
    const dates = Array.from({ length: n }, (_, i) => {
      const start = Date.parse(`${today}T00:00:00Z`);
      const end = Date.parse(`${serviceStart}T00:00:00Z`);
      return new Date(start + Math.floor(((end - start) * i) / n)).toISOString().slice(0, 10);
    });
    onChange({ ...value, installments: dates.map((d, i) => ({ amount: ((i === n - 1 ? totalMinor - base * (n - 1) : base) / 100).toFixed(2), dueDate: d })) });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="payment-plan">
      <div role="radiogroup" aria-label={t('paymentPlan')} className="grid gap-2 sm:grid-cols-3">
        {TYPES.map((type) => (
          <button key={type} type="button" role="radio" aria-checked={value.type === type} data-plan={type}
            onClick={() => onChange({ type, installments: type === 'partial' && value.installments.length === 0 ? [{ amount: '', dueDate: today }, { amount: '', dueDate: serviceStart }] : value.installments })}
            className={cn('rounded-lg border px-4 py-3 text-start text-sm font-medium', value.type === type ? 'border-primary bg-primary-soft/40 text-fg ring-1 ring-primary' : 'border-border text-fg-muted hover:bg-subtle')}>
            {te(type)}
          </button>
        ))}
      </div>
      {value.type === 'partial' && (
        <div className="flex flex-col gap-3">
          {value.installments.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2" data-installment={i}>
              <Field label={`${t('amount')} (${currency})`} error={rowIssue(i, 'amountMinor')}>
                <Input type="number" step="0.01" min={0} name={`inst${i}amount`} value={row.amount} onChange={(e) => onChange({ ...value, installments: value.installments.map((r, k) => (k === i ? { ...r, amount: e.target.value } : r)) })} />
              </Field>
              <Field label={t('dueDate')} error={rowIssue(i, 'dueDate')}>
                <Input type="date" name={`inst${i}due`} min={today} max={serviceStart} value={row.dueDate} onChange={(e) => onChange({ ...value, installments: value.installments.map((r, k) => (k === i ? { ...r, dueDate: e.target.value } : r)) })} />
              </Field>
              <Button variant="ghost" size="icon" aria-label={`${t('installments')} ${i + 1} ×`} disabled={value.installments.length <= 1}
                onClick={() => onChange({ ...value, installments: value.installments.filter((_, k) => k !== i) })}><Trash2 aria-hidden /></Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={value.installments.length >= 12} onClick={() => onChange({ ...value, installments: [...value.installments, { amount: '', dueDate: serviceStart }] })}><Plus aria-hidden />{t('addInstallment')}</Button>
            <Button variant="ghost" size="sm" onClick={splitEven}>{t('splitEven')}</Button>
          </div>
          {issues.some((i) => i.index === null) || scheduled !== totalMinor ? (
            <p className="flex items-center gap-1.5 text-sm text-warning" role="status" data-testid="plan-remaining"><CircleAlert className="size-4" aria-hidden />{t('remaining', { amount: priceOf(totalMinor - scheduled, currency, locale) })}</p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-success" role="status" data-testid="plan-balanced"><CheckCircle2 className="size-4" aria-hidden />{t('balanced')}</p>
          )}
          {errors['payment.installments'] && <p role="alert" className="text-sm text-danger">{tv(errors['payment.installments'] as never)}</p>}
        </div>
      )}
    </div>
  );
}
