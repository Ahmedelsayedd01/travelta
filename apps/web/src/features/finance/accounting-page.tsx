'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ExpenseListItem, FinancialAccountDto, JournalEntryDto, LedgerAccountDto, PayableListItem, TransferListItem } from '@travelta/schemas';
import { ApiClientError } from '@travelta/api-client';
import { ArrowLeftRight, BookOpenText, Landmark, PencilLine, Plus, Receipt, Scale, Trash2, Truck, Undo2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';
import { useApi } from '@/components/api-provider';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-picker';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tab, Tabs, TabsList, TabsPanel } from '@/components/ui/tabs';
import { useDemoToday } from '@/features/demo/hooks';
import { useDateFormat } from '@/features/bookings/bookings-page';
import { priceOf } from '@/features/search/format';
import { useRouter } from '@/i18n/navigation';
import { useAction } from '@/lib/mutations';
import { useCan, useSession } from '@/lib/session';
import { FINANCE_KEYS, fromMinor, toMinor, useFinancialAccounts } from './collect-dialog';
import { InvoicesTable, InvoiceView } from './invoices-page';

const useMoney = () => { const locale = useLocale(); return (m: number, c = 'EGP') => priceOf(m, c, locale); };
const KINDS = ['cash', 'bank', 'vodafone_cash', 'instapay', 'card_gateway'] as const;
const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

function useChart() {
  const api = useApi();
  return useQuery({ queryKey: ['accounting', 'chart'], queryFn: () => api.call('accounting.chart', undefined) });
}

/** ACC-3: trial balance with P&L for a date range — computed from posted entries only. */
function Overview() {
  const t = useTranslations('finance');
  const locale = useLocale() as 'en' | 'ar';
  const money = useMoney();
  const api = useApi();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const tb = useQuery({ queryKey: ['accounting', 'tb', from, to], queryFn: () => api.call('accounting.trialBalance', { from: from || undefined, to: to || undefined }), placeholderData: keepPreviousData });
  if (tb.isError) return <ErrorState onRetry={() => void tb.refetch()} />;
  if (!tb.data) return <Skeleton className="h-96 w-full" />;
  const d = tb.data;
  const balanced = d.totalDebitMinor === d.totalCreditMinor;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('from')}><DateInput name="from" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('to')}><DateInput name="to" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {(from || to) && <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>{t('allTime')}</Button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-3" data-testid="pnl">
        <StatCard label={t('revenue')} value={money(d.revenueMinor, d.currency)} icon={<Landmark />} />
        <StatCard label={t('expenses')} value={money(d.expenseMinor, d.currency)} icon={<Receipt />} />
        <StatCard label={t('profit')} value={<span className={d.profitMinor < 0 ? 'text-danger' : 'text-success'} data-testid="profit">{money(d.profitMinor, d.currency)}</span>} icon={<Scale />} />
      </div>
      <Card>
        <CardHeader title={t('trialBalance')} description={t('trialBalanceBody')} actions={<Badge tone={balanced ? 'success' : 'danger'} data-testid="tb-status">{balanced ? t('balanced') : t('unbalanced')}</Badge>} />
        <CardBody className="overflow-x-auto p-0" tabIndex={0} role="region" aria-label={t('tableScrollRegion')}>
          <table className="w-full min-w-[36rem] text-sm" data-testid="trial-balance">
            <thead><tr className="border-b border-border text-xs text-fg-muted uppercase"><th className="px-5 py-2 text-start font-medium">{t('account')}</th><th className="px-5 py-2 text-end font-medium">{t('debit')}</th><th className="px-5 py-2 text-end font-medium">{t('credit')}</th><th className="px-5 py-2 text-end font-medium">{t('balance')}</th></tr></thead>
            <tbody className="divide-y divide-border">
              {TYPES.map((type) => {
                const rows = d.rows.filter((r) => r.type === type && (r.debitMinor || r.creditMinor));
                if (rows.length === 0) return null;
                return (
                  <Fragment key={type}>
                    <tr className="bg-subtle/60"><td colSpan={4} className="px-5 py-1.5 text-xs font-semibold text-fg-muted uppercase">{t(`type_${type}`)}</td></tr>
                    {rows.map((r) => (
                      <tr key={r.id}><td className="px-5 py-2"><span className="font-mono text-xs text-fg-muted" dir="ltr">{r.code}</span> {r.name[locale]}</td>
                        <td className="tabular px-5 py-2 text-end">{r.debitMinor ? money(r.debitMinor, d.currency) : ''}</td><td className="tabular px-5 py-2 text-end">{r.creditMinor ? money(r.creditMinor, d.currency) : ''}</td>
                        <td className="tabular px-5 py-2 text-end font-medium">{money(r.balanceMinor, d.currency)}</td></tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot><tr className="border-t-2 border-border font-semibold"><td className="px-5 py-2">{t('totals')}</td><td className="tabular px-5 py-2 text-end">{money(d.totalDebitMinor, d.currency)}</td><td className="tabular px-5 py-2 text-end">{money(d.totalCreditMinor, d.currency)}</td><td /></tr></tfoot>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function Journal() {
  const t = useTranslations('finance');
  const locale = useLocale() as 'en' | 'ar';
  const money = useMoney();
  const api = useApi();
  const date = useDateFormat();
  const canPost = useCan('accounting.post_manual_entry');
  const state = useListState({ pageSize: 15, sort: 'date:desc' });
  const result = useQuery({ queryKey: ['accounting', 'journal', state.query], queryFn: () => api.call('accounting.journal', state.query), placeholderData: keepPreviousData });
  const [open, setOpen] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [reversing, setReversing] = useState<JournalEntryDto | null>(null);
  const columns: Column<JournalEntryDto>[] = [
    { key: 'date', header: t('date'), sortKey: 'date', cell: (e) => <div><p className="tabular whitespace-nowrap text-sm">{date(e.date)}</p><p className="font-mono text-xs text-fg-muted" dir="ltr">{e.number}</p></div> },
    { key: 'memo', header: t('memo'), cell: (e) => (
      <div className="min-w-0">
        <p className="truncate text-sm">{e.memo}</p>
        <div className="mt-0.5 flex flex-wrap gap-1"><Badge tone="neutral">{t(`source_${e.source}`)}</Badge>{e.reversalOf && <Badge tone="warning">{t('reversal')}</Badge>}{e.reversedBy && <Badge tone="neutral">{t('reversedBy', { n: e.reversedBy })}</Badge>}</div>
        {open === e.id && (
          <table className="mt-2 w-full text-xs" data-testid="journal-lines">
            <tbody className="divide-y divide-border">{e.lines.map((l, k) => <tr key={k}><td className="py-1"><span className="font-mono" dir="ltr">{l.accountCode}</span> {l.accountName[locale]}{l.party && <span className="text-fg-muted"> · {l.party.name}</span>}</td><td className="tabular py-1 text-end">{l.debitMinor ? money(l.debitMinor, e.currency) : ''}</td><td className="tabular py-1 text-end">{l.creditMinor ? money(l.creditMinor, e.currency) : ''}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    ) },
    { key: 'total', header: t('amount'), sortKey: 'total', numeric: true, cell: (e) => <span className="tabular font-medium">{money(e.totalMinor, e.currency)}</span> },
  ];
  return (
    <>
      <DataTable state={state} result={result} columns={columns} rowKey={(e) => e.id} label={t('journal')} testId="journal-table" onRowClick={(e) => setOpen(open === e.id ? null : e.id)}
        toolbar={canPost && <Button onClick={() => setManual(true)} data-testid="manual-entry"><Plus aria-hidden />{t('manualEntry')}</Button>}
        filters={[{ key: 'source', label: t('source'), options: (['booking', 'payment', 'refund', 'cancellation', 'top_up', 'payout', 'expense', 'transfer', 'adjustment'] as const).map((s) => ({ value: s, label: t(`source_${s}`) })) }]}
        rowActions={(e) => canPost && !e.reversalOf && !e.reversedBy ? <Button size="sm" variant="ghost" onClick={() => setReversing(e)} data-action="reverse"><Undo2 aria-hidden />{t('reverse')}</Button> : null}
        empty={<EmptyState icon={<BookOpenText aria-hidden />} title={t('noEntries')} />} />
      {manual && <ManualEntryDialog onClose={() => setManual(false)} />}
      {reversing && <ReverseDialog entry={reversing} onClose={() => setReversing(null)} />}
    </>
  );
}

function ReverseDialog({ entry, onClose }: { entry: JournalEntryDto; onClose: () => void }) {
  const t = useTranslations('finance');
  const api = useApi();
  const [memo, setMemo] = useState('');
  const go = useAction(() => api.call('accounting.reverse', { entryId: entry.id, memo }), { success: t('reversed'), invalidate: FINANCE_KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('reverseTitle', { n: entry.number })} description={t('reverseBody')}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button variant="danger" onClick={() => go.mutate()} loading={go.isPending} disabled={memo.trim().length < 3} data-testid="reverse-submit">{t('reverse')}</Button></>}>
      <Field label={t('reason')} required><Input name="memo" value={memo} onChange={(e) => setMemo(e.target.value)} autoFocus /></Field>
    </Dialog>
  );
}

function ManualEntryDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('finance');
  const locale = useLocale() as 'en' | 'ar';
  const money = useMoney();
  const api = useApi();
  const today = useDemoToday();
  const chart = useChart();
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState([{ accountId: '', debit: '', credit: '' }, { accountId: '', debit: '', credit: '' }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dr = lines.reduce((s, l) => s + toMinor(l.debit), 0);
  const cr = lines.reduce((s, l) => s + toMinor(l.credit), 0);
  const set = (i: number, patch: Partial<(typeof lines)[number]>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const post = useAction(() => api.call('accounting.postManual', { date, memo, lines: lines.map((l) => ({ accountId: l.accountId, debitMinor: toMinor(l.debit), creditMinor: toMinor(l.credit) })) }), { success: t('posted'), invalidate: FINANCE_KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('manualEntry')} description={t('manualEntryBody')} size="lg"
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => post.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={post.isPending} disabled={dr === 0 || dr !== cr || memo.trim().length < 3} data-testid="manual-submit">{t('post')}</Button></>}>
      <div className="flex flex-col gap-3" data-testid="manual-form">
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Field label={t('date')}><DateInput name="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={t('memo')} required error={errors.memo}><Input name="memo" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_8rem_8rem_auto]" data-line={i}>
            <Field label={t('account')} className="col-span-2 sm:col-span-1" error={errors[`lines.${i}.accountId`]}>
              <Select name={`acc${i}`} value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })}>
                <option value="">{t('chooseAccount')}</option>
                {(chart.data ?? []).filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name[locale]}</option>)}
              </Select>
            </Field>
            <Field label={t('debit')}><Input type="number" min={0} step="0.01" name={`dr${i}`} value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} /></Field>
            <Field label={t('credit')}><Input type="number" min={0} step="0.01" name={`cr${i}`} value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} /></Field>
            <Button variant="ghost" size="icon" aria-label={t('removeLine')} disabled={lines.length <= 2} onClick={() => setLines(lines.filter((_, k) => k !== i))}><Trash2 aria-hidden /></Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={lines.length >= 10} onClick={() => setLines([...lines, { accountId: '', debit: '', credit: '' }])}><Plus aria-hidden />{t('addLine')}</Button>
          <p className={dr === cr && dr > 0 ? 'text-sm text-success' : 'text-sm text-warning'} role="status" data-testid="manual-balance">{t('drCr', { dr: money(dr), cr: money(cr) })}</p>
        </div>
        {errors.lines && <p role="alert" className="text-sm text-danger">{t('mustBalance')}</p>}
      </div>
    </Dialog>
  );
}

function Accounts() {
  const t = useTranslations('finance');
  const locale = useLocale() as 'en' | 'ar';
  const money = useMoney();
  const canManage = useCan('accounting.manage_accounts');
  const chart = useChart();
  const fin = useFinancialAccounts();
  const [editLedger, setEditLedger] = useState<LedgerAccountDto | 'new' | null>(null);
  const [editFin, setEditFin] = useState<FinancialAccountDto | 'new' | null>(null);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card>
        <CardHeader title={t('chartOfAccounts')} description={t('chartBody')} actions={canManage && <Button size="sm" onClick={() => setEditLedger('new')} data-testid="add-ledger-account"><Plus aria-hidden />{t('addAccount')}</Button>} />
        <CardBody className="p-0">
          {!chart.data ? <Skeleton className="m-5 h-64" /> : (
            <ul className="divide-y divide-border" data-testid="chart">
              {chart.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                  <span className="min-w-0"><span className="font-mono text-xs text-fg-muted" dir="ltr">{a.code}</span> <span className="font-medium">{a.name[locale]}</span> <Badge tone="neutral">{t(`type_${a.type}`)}</Badge>{a.systemKey && <Badge tone="info" className="ms-1">{t('system')}</Badge>}{!a.active && <Badge tone="warning" className="ms-1">{t('inactive')}</Badge>}</span>
                  <span className="flex items-center gap-2"><span className="tabular">{money(a.balanceMinor)}</span>{canManage && <Button size="sm" variant="ghost" aria-label={t('edit')} onClick={() => setEditLedger(a)}><PencilLine aria-hidden /></Button>}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('financialAccounts')} description={t('financialAccountsBody')} actions={canManage && <Button size="sm" variant="outline" onClick={() => setEditFin('new')} data-testid="add-fin-account"><Plus aria-hidden />{t('add')}</Button>} />
        <CardBody className="p-0">
          {!fin.data ? <Skeleton className="m-5 h-40" /> : (
            <ul className="divide-y divide-border" data-testid="financial-accounts">
              {fin.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                  <span className="min-w-0"><span className="block font-medium">{a.name}</span><span className="text-xs text-fg-muted">{t(`kind_${a.kind}`)} · <span dir="ltr">{a.ledgerCode}</span>{!a.active && ` · ${t('inactive')}`}</span></span>
                  <span className="flex items-center gap-2"><span className="tabular font-medium">{money(a.balanceMinor, a.currency)}</span>{canManage && <Button size="sm" variant="ghost" aria-label={t('edit')} onClick={() => setEditFin(a)}><PencilLine aria-hidden /></Button>}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      {editLedger && <LedgerAccountDialog account={editLedger === 'new' ? null : editLedger} onClose={() => setEditLedger(null)} />}
      {editFin && <FinancialAccountDialog account={editFin === 'new' ? null : editFin} onClose={() => setEditFin(null)} />}
    </div>
  );
}

function LedgerAccountDialog({ account, onClose }: { account: LedgerAccountDto | null; onClose: () => void }) {
  const t = useTranslations('finance');
  const api = useApi();
  const [v, setV] = useState({ code: account?.code ?? '', en: account?.name.en ?? '', ar: account?.name.ar ?? '', type: account?.type ?? 'expense', active: account?.active ?? true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const locked = Boolean(account?.systemKey);
  const save = useAction(() => api.call('accounting.saveAccount', { id: account?.id, code: v.code, name: { en: v.en, ar: v.ar }, type: v.type, active: v.active }), { success: t('saved'), invalidate: FINANCE_KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={account ? t('editAccount') : t('addAccount')} description={locked ? t('systemLocked') : undefined}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={save.isPending} data-testid="ledger-save">{t('save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('code')} required error={errors.code}><Input name="code" dir="ltr" value={v.code} disabled={locked} onChange={(e) => setV({ ...v, code: e.target.value })} /></Field>
        <Field label={t('type')}><Select name="type" value={v.type} disabled={locked} onChange={(e) => setV({ ...v, type: e.target.value as typeof v.type })}>{TYPES.map((x) => <option key={x} value={x}>{t(`type_${x}`)}</option>)}</Select></Field>
        <Field label={t('nameEn')} required error={errors['name.en']}><Input name="nameEn" value={v.en} onChange={(e) => setV({ ...v, en: e.target.value })} /></Field>
        <Field label={t('nameAr')} required error={errors['name.ar']}><Input name="nameAr" dir="rtl" value={v.ar} onChange={(e) => setV({ ...v, ar: e.target.value })} /></Field>
      </div>
      {!locked && <Checkbox checked={v.active} onCheckedChange={(c) => setV({ ...v, active: c })} label={t('active')} />}
    </Dialog>
  );
}

function FinancialAccountDialog({ account, onClose }: { account: FinancialAccountDto | null; onClose: () => void }) {
  const t = useTranslations('finance');
  const api = useApi();
  const [v, setV] = useState({ kind: account?.kind ?? 'bank', name: account?.name ?? '', active: account?.active ?? true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => api.call('finance.saveAccount', { id: account?.id, ...v }), { success: t('saved'), invalidate: FINANCE_KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={account ? t('editFinAccount') : t('addFinAccount')}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={save.isPending} data-testid="fin-save">{t('save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('kind')}><Select name="kind" value={v.kind} disabled={Boolean(account)} onChange={(e) => setV({ ...v, kind: e.target.value as typeof v.kind })}>{KINDS.map((k) => <option key={k} value={k}>{t(`kind_${k}`)}</option>)}</Select></Field>
        <Field label={t('name')} required error={errors.name}><Input name="finName" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      </div>
      <Checkbox checked={v.active} onCheckedChange={(c) => setV({ ...v, active: c })} label={t('active')} />
    </Dialog>
  );
}

function Expenses() {
  const t = useTranslations('finance');
  const money = useMoney();
  const api = useApi();
  const date = useDateFormat();
  const canPost = useCan('accounting.post_manual_entry');
  const state = useListState({ pageSize: 10, sort: 'date:desc' });
  const result = useQuery({ queryKey: ['accounting', 'expenses', state.query], queryFn: () => api.call('accounting.expenses', state.query), placeholderData: keepPreviousData });
  const [open, setOpen] = useState(false);
  const columns: Column<ExpenseListItem>[] = [
    { key: 'date', header: t('date'), sortKey: 'date', cell: (x) => <span className="tabular whitespace-nowrap text-sm">{date(x.date)}</span> },
    { key: 'description', header: t('description'), cell: (x) => <div><p className="text-sm font-medium">{x.description}</p><p className="text-xs text-fg-muted">{x.accountName} · {x.recordedByName}</p></div> },
    { key: 'category', header: t('category'), cell: (x) => <Badge tone="neutral">{t(`exp_${x.category}`)}</Badge> },
    { key: 'amount', header: t('amount'), sortKey: 'amount', numeric: true, cell: (x) => <span className="tabular font-medium">{money(x.amountMinor, x.currency)}</span> },
  ];
  return (
    <>
      <DataTable state={state} result={result} columns={columns} rowKey={(x) => x.id} label={t('expenses')} testId="expenses-table"
        toolbar={canPost && <Button onClick={() => setOpen(true)} data-testid="record-expense"><Plus aria-hidden />{t('recordExpense')}</Button>}
        filters={[{ key: 'category', label: t('category'), options: (['general', 'rent', 'salaries', 'marketing'] as const).map((c) => ({ value: c, label: t(`exp_${c}`) })) }]}
        empty={<EmptyState icon={<Receipt aria-hidden />} title={t('noExpenses')} />} />
      {open && <ExpenseDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ExpenseDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('finance');
  const api = useApi();
  const today = useDemoToday();
  const fin = useFinancialAccounts();
  const [v, setV] = useState({ category: 'general' as const as 'general' | 'rent' | 'salaries' | 'marketing', description: '', amount: '', financialAccountId: '', date: today });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => api.call('accounting.recordExpense', { category: v.category, description: v.description, amountMinor: toMinor(v.amount), financialAccountId: v.financialAccountId, date: v.date }), { success: t('expenseRecorded'), invalidate: FINANCE_KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('recordExpense')}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={save.isPending} data-testid="expense-save">{t('save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2" data-testid="expense-form">
        <Field label={t('category')}><Select name="category" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as typeof v.category })}>{(['general', 'rent', 'salaries', 'marketing'] as const).map((c) => <option key={c} value={c}>{t(`exp_${c}`)}</option>)}</Select></Field>
        <Field label={t('date')} error={errors.date}><DateInput name="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        <Field label={t('description')} required className="sm:col-span-2" error={errors.description}><Input name="description" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <Field label={t('amount')} required error={errors.amountMinor}><Input type="number" min={0} step="0.01" name="amount" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
        <Field label={t('paidFrom')} required error={errors.financialAccountId}><Select name="account" value={v.financialAccountId} onChange={(e) => setV({ ...v, financialAccountId: e.target.value })}><option value="">{t('chooseAccount')}</option>{(fin.data ?? []).filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
      </div>
    </Dialog>
  );
}

function Transfers() {
  const t = useTranslations('finance');
  const money = useMoney();
  const api = useApi();
  const date = useDateFormat();
  const canPost = useCan('accounting.post_manual_entry');
  const state = useListState({ pageSize: 10, sort: 'date:desc' });
  const result = useQuery({ queryKey: ['accounting', 'transfers', state.query], queryFn: () => api.call('accounting.transfers', state.query), placeholderData: keepPreviousData });
  const [open, setOpen] = useState(false);
  const columns: Column<TransferListItem>[] = [
    { key: 'date', header: t('date'), sortKey: 'date', cell: (x) => <span className="tabular whitespace-nowrap text-sm">{date(x.date)}</span> },
    { key: 'route', header: t('fromTo'), cell: (x) => <span className="text-sm">{x.fromName} <ArrowLeftRight className="inline size-3.5 text-fg-muted" aria-hidden /> {x.toName}</span> },
    { key: 'note', header: t('note'), hideOnCard: true, cell: (x) => <span className="text-sm text-fg-muted">{x.note || '—'}</span> },
    { key: 'amount', header: t('amount'), sortKey: 'amount', numeric: true, cell: (x) => <span className="tabular font-medium">{money(x.amountMinor, x.currency)}</span> },
  ];
  return (
    <>
      <DataTable state={state} result={result} columns={columns} rowKey={(x) => x.id} label={t('transfers')} testId="transfers-table"
        toolbar={canPost && <Button onClick={() => setOpen(true)} data-testid="new-transfer"><Plus aria-hidden />{t('newTransfer')}</Button>}
        empty={<EmptyState icon={<ArrowLeftRight aria-hidden />} title={t('noTransfers')} />} />
      {open && <TransferDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function TransferDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('finance');
  const api = useApi();
  const today = useDemoToday();
  const fin = useFinancialAccounts();
  const [v, setV] = useState({ fromAccountId: '', toAccountId: '', amount: '', date: today, note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => api.call('accounting.transfer', { fromAccountId: v.fromAccountId, toAccountId: v.toAccountId, amountMinor: toMinor(v.amount), date: v.date, note: v.note }), { success: t('transferDone'), invalidate: FINANCE_KEYS, onSuccess: onClose });
  const options = (fin.data ?? []).filter((a) => a.active);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('newTransfer')}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={save.isPending} data-testid="transfer-save">{t('save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('fromAccount')} required error={errors.fromAccountId}><Select name="from" value={v.fromAccountId} onChange={(e) => setV({ ...v, fromAccountId: e.target.value })}><option value="">{t('chooseAccount')}</option>{options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label={t('toAccount')} required error={errors.toAccountId}><Select name="to" value={v.toAccountId} onChange={(e) => setV({ ...v, toAccountId: e.target.value })}><option value="">{t('chooseAccount')}</option>{options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label={t('amount')} required error={errors.amountMinor}><Input type="number" min={0} step="0.01" name="amount" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
        <Field label={t('date')}><DateInput name="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        <Field label={t('note')} optional className="sm:col-span-2"><Input name="note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

/** SUP-3 supplier payables: payout = net − commission, due 7 days after service; overdue highlighted; pay → ledger. */
export function PayablesTable({ supplierView = false }: { supplierView?: boolean }) {
  const t = useTranslations('finance');
  const locale = useLocale() as 'en' | 'ar';
  const money = useMoney();
  const api = useApi();
  const date = useDateFormat();
  const state = useListState({ pageSize: 10, sort: 'dueDate:asc' });
  const result = useQuery({ queryKey: ['payables', state.query], queryFn: () => api.call('payables.list', state.query), placeholderData: keepPreviousData });
  const [paying, setPaying] = useState<PayableListItem | null>(null);
  const columns: Column<PayableListItem>[] = [
    { key: 'item', header: t('item'), cell: (x) => <div className="min-w-0"><p className="font-mono text-xs" dir="ltr">{x.bookingRef}</p><p className="truncate text-sm font-medium">{x.itemTitle[locale]}</p></div> },
    { key: 'party', header: supplierView ? t('payer') : t('supplier'), cell: (x) => <div><p className="text-sm">{supplierView ? x.payerName : x.supplierName}</p>{!supplierView && <p className="text-xs text-fg-muted">{t(`supplierKind_${x.supplierKind}`)}</p>}</div> },
    { key: 'dueDate', header: t('dueDate'), sortKey: 'dueDate', cell: (x) => <div className="flex flex-col"><span className="tabular whitespace-nowrap text-sm">{date(x.dueDate)}</span>{x.overdue && <Badge tone="danger">{t('overdueBadge')}</Badge>}</div> },
    { key: 'due', header: t('payout'), numeric: true, cell: (x) => <span className="tabular">{money(x.amountDueMinor, x.currency)}</span> },
    { key: 'open', header: t('open'), sortKey: 'amount', numeric: true, cell: (x) => <span className="tabular font-medium">{money(x.amountDueMinor - x.amountPaidMinor, x.currency)}</span> },
    { key: 'status', header: t('status'), cell: (x) => <Badge tone={x.status === 'paid' ? 'success' : x.status === 'cancelled' ? 'neutral' : x.status === 'partially_paid' ? 'warning' : 'info'}>{t(`payable_${x.status}`)}</Badge> },
  ];
  return (
    <>
      <DataTable state={state} result={result} columns={columns} rowKey={(x) => x.id} label={t('payables')} testId="payables-table"
        filters={[
          { key: 'status', label: t('status'), options: (['open', 'partially_paid', 'paid', 'cancelled'] as const).map((s) => ({ value: s, label: t(`payable_${s}`) })) },
          { key: 'overdue', label: t('overdueBadge'), options: [{ value: 'true', label: t('overdueBadge') }] },
        ]}
        rowActions={(x) => x.canPay ? <Button size="sm" onClick={() => setPaying(x)} data-action="pay-supplier"><Truck aria-hidden />{t('pay')}</Button> : null}
        empty={<EmptyState icon={<Truck aria-hidden />} title={t('noPayables')} />} />
      {paying && <PayDialog payable={paying} onClose={() => setPaying(null)} />}
    </>
  );
}

function PayDialog({ payable, onClose }: { payable: PayableListItem; onClose: () => void }) {
  const t = useTranslations('finance');
  const money = useMoney();
  const api = useApi();
  const fin = useFinancialAccounts();
  const remaining = payable.amountDueMinor - payable.amountPaidMinor;
  const [amount, setAmount] = useState(fromMinor(remaining));
  const [accountId, setAccountId] = useState('');
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pay = useAction(() => api.call('payables.pay', { id: payable.id, amountMinor: toMinor(amount), financialAccountId: accountId, reference }), { success: t('payoutDone'), invalidate: FINANCE_KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('paySupplier', { name: payable.supplierName })} description={t('payBody', { amount: money(remaining, payable.currency) })}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => pay.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={pay.isPending} disabled={!accountId || toMinor(amount) <= 0} data-testid="pay-submit">{t('pay')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('amount')} required error={errors.amountMinor}><Input type="number" min={0} step="0.01" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={t('paidFrom')} required error={errors.financialAccountId}><Select name="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">{t('chooseAccount')}</option>{(fin.data ?? []).filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label={t('reference')} optional className="sm:col-span-2"><Input name="reference" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

/** ACC-3 receivables ageing per customer. */
function Ageing() {
  const t = useTranslations('finance');
  const money = useMoney();
  const api = useApi();
  const q = useQuery({ queryKey: ['accounting', 'ageing'], queryFn: () => api.call('accounting.ageing', undefined) });
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-64 w-full" />;
  if (q.data.length === 0) return <EmptyState icon={<Scale aria-hidden />} title={t('noReceivables')} />;
  const cols = ['currentMinor', 'd0_30Minor', 'd31_60Minor', 'd61_90Minor', 'd90PlusMinor', 'totalMinor'] as const;
  const sum = (k: (typeof cols)[number]) => q.data.reduce((s, r) => s + r[k], 0);
  return (
    <Card><CardBody className="overflow-x-auto p-0" tabIndex={0} role="region" aria-label={t('tableScrollRegion')}>
      <table className="w-full min-w-[40rem] text-sm" data-testid="ageing-table">
        <thead><tr className="border-b border-border text-xs text-fg-muted uppercase"><th className="px-5 py-2 text-start font-medium">{t('customer')}</th>{cols.map((c) => <th key={c} className="px-3 py-2 text-end font-medium">{t(`age_${c}`)}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{q.data.map((r) => <tr key={r.customerId ?? r.customerName}><td className="px-5 py-2 font-medium">{r.customerName}</td>{cols.map((c) => <td key={c} className={c === 'totalMinor' ? 'tabular px-3 py-2 text-end font-semibold' : 'tabular px-3 py-2 text-end'}>{r[c] ? money(r[c]) : '—'}</td>)}</tr>)}</tbody>
        <tfoot><tr className="border-t-2 border-border font-semibold"><td className="px-5 py-2">{t('totals')}</td>{cols.map((c) => <td key={c} className="tabular px-3 py-2 text-end">{money(sum(c))}</td>)}</tr></tfoot>
      </table>
    </CardBody></Card>
  );
}

const TABS = ['overview', 'journal', 'accounts', 'expenses', 'transfers', 'payables', 'receivables', 'invoices'] as const;

/** Accounting (ACC): per-tenant double-entry ledger. Same screen for the platform and agencies. */
export function AccountingPage({ segments }: { segments: string[] }) {
  const t = useTranslations('finance');
  const router = useRouter();
  const platform = useSession((s) => s.session?.organization.type === 'platform');
  const base = platform ? '/admin/accounting' : '/agency/accounting';
  const tabs = TABS.filter((x) => x !== 'invoices' || platform);
  if (segments[0] === 'invoices' && segments[1]) return <InvoiceView id={segments[1]} back={`${base}/invoices`} />;
  const current = (tabs as readonly string[]).includes(segments[0] ?? '') ? segments[0]! : 'overview';
  return (
    <>
      <PageHeader title={t('accountingTitle')} description={platform ? t('accountingDescriptionPlatform') : t('accountingDescription')} />
      <Tabs value={current} onValueChange={(v) => router.replace(v === 'overview' ? base : `${base}/${String(v)}`)}>
        <TabsList className="overflow-x-auto">{tabs.map((x) => <Tab key={x} value={x} data-testid={`acc-tab-${x}`}>{t(`tab_${x}`)}</Tab>)}</TabsList>
        <TabsPanel value="overview"><Overview /></TabsPanel>
        <TabsPanel value="journal"><Journal /></TabsPanel>
        <TabsPanel value="accounts"><Accounts /></TabsPanel>
        <TabsPanel value="expenses"><Expenses /></TabsPanel>
        <TabsPanel value="transfers"><Transfers /></TabsPanel>
        <TabsPanel value="payables"><PayablesTable /></TabsPanel>
        <TabsPanel value="receivables"><Ageing /></TabsPanel>
        {platform && <TabsPanel value="invoices"><InvoicesTable base={`${base}/invoices`} /></TabsPanel>}
      </Tabs>
    </>
  );
}

/** Supplier statement (W9): payables owed to the supplier and their payout status. */
export function StatementPage() {
  const t = useTranslations('finance');
  return (
    <>
      <PageHeader title={t('statementTitle')} description={t('statementDescription')} />
      <PayablesTable supplierView />
    </>
  );
}
