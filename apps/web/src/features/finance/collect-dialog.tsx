'use client';

import { useQuery } from '@tanstack/react-query';
import type { BookingFinance } from '@travelta/schemas';
import { ApiClientError } from '@travelta/api-client';
import { Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { priceOf } from '@/features/search/format';
import { useAction } from '@/lib/mutations';

export const FINANCE_KEYS = [['bookings'], ['finance'], ['wallet'], ['payments'], ['invoices'], ['accounting'], ['payables'], ['cancellations']] as const;
export const toMinor = (v: string) => Math.round(Number(v || '0') * 100);
export const fromMinor = (m: number) => (m / 100).toFixed(2);

export function useFinancialAccounts(enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: ['finance', 'accounts'], queryFn: () => api.call('finance.accounts', undefined), enabled });
}

/** W6 collect payment: amount split across financial accounts (PAY-3), optionally aimed at one instalment (PAY-4). */
export function CollectDialog({ open, onClose, finance }: { open: boolean; onClose: () => void; finance: BookingFinance }) {
  const t = useTranslations('finance');
  const locale = useLocale();
  const api = useApi();
  const accounts = useFinancialAccounts(open);
  const active = (accounts.data ?? []).filter((a) => a.active);
  const [amount, setAmount] = useState(fromMinor(finance.outstandingMinor));
  const [rows, setRows] = useState<{ accountId: string; amount: string }[]>([{ accountId: '', amount: '' }]);
  const [seq, setSeq] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const total = toMinor(amount);
  const split = rows.length > 1;
  const allocations = split ? rows.map((r) => ({ financialAccountId: r.accountId, amountMinor: toMinor(r.amount) })) : [{ financialAccountId: rows[0]!.accountId, amountMinor: total }];
  const allocated = allocations.reduce((s, a) => s + a.amountMinor, 0);
  const reset = () => { setRows([{ accountId: '', amount: '' }]); setSeq(''); setReference(''); setNote(''); setErrors({}); setAmount(fromMinor(finance.outstandingMinor)); };
  const collect = useAction(() => api.call('payments.collect', { bookingId: finance.bookingId, amountMinor: total, allocations, installmentSeq: seq ? Number(seq) : undefined, reference, note }), {
    success: t('collected'), invalidate: FINANCE_KEYS, onSuccess: () => { reset(); onClose(); },
  });
  const submit = () => collect.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) });
  const open_ = (finance.plan?.installments ?? []).filter((i) => i.status !== 'paid' && i.status !== 'cancelled');
  const valid = total > 0 && total <= finance.outstandingMinor && allocations.every((a) => a.financialAccountId && a.amountMinor > 0) && allocated === total;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }} title={t('collectTitle')} description={t('collectBody', { amount: priceOf(finance.outstandingMinor, finance.currency, locale) })} size="md"
      footer={<><Button variant="outline" onClick={() => { reset(); onClose(); }}>{t('cancel')}</Button><Button onClick={submit} loading={collect.isPending} disabled={!valid} data-testid="collect-submit">{t('collect')}</Button></>}>
      <div className="flex flex-col gap-4" data-testid="collect-dialog">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`${t('amount')} (${finance.currency})`} required error={errors.amountMinor}>
            <Input type="number" step="0.01" min={0} name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          {open_.length > 1 && (
            <Field label={t('applyTo')} optional help={t('applyToHelp')}>
              <Select name="installment" value={seq} onChange={(e) => setSeq(e.target.value)}>
                <option value="">{t('oldestFirst')}</option>
                {open_.map((i) => <option key={i.seq} value={i.seq}>{t('installmentN', { n: i.seq })} · {priceOf(i.amountMinor - i.paidMinor, finance.currency, locale)}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">{split ? t('splitAcross') : t('receivedInto')}</legend>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_10rem_auto]" data-allocation={i}>
              <Field label={t('account')} error={errors[`allocations.${i}.financialAccountId`]}>
                <Select name={`account${i}`} value={r.accountId} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, accountId: e.target.value } : x)))}>
                  <option value="">{t('chooseAccount')}</option>
                  {active.map((a) => <option key={a.id} value={a.id}>{a.name} · {t(`kind_${a.kind}`)}</option>)}
                </Select>
              </Field>
              {split && (
                <Field label={t('amount')} className="max-sm:col-span-1">
                  <Input type="number" step="0.01" min={0} name={`alloc${i}`} value={r.amount} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} />
                </Field>
              )}
              <Button variant="ghost" size="icon" aria-label={t('removeSplit')} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, k) => k !== i))}><Trash2 aria-hidden /></Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="sm" disabled={rows.length >= 5} onClick={() => setRows([...rows, { accountId: '', amount: '' }])} data-testid="add-split"><Plus aria-hidden />{t('addSplit')}</Button>
            {split && <p className={allocated === total ? 'text-sm text-success' : 'text-sm text-warning'} role="status" data-testid="split-status">{t('allocated', { done: priceOf(allocated, finance.currency, locale), total: priceOf(total, finance.currency, locale) })}</p>}
          </div>
          {errors.allocations && <p role="alert" className="text-sm text-danger">{t('allocationsSum')}</p>}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('reference')} optional><Input name="reference" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          <Field label={t('note')} optional><Input name="note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </div>
    </Dialog>
  );
}
