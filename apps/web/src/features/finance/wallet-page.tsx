'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { KycFile, TopUpListItem, WalletDto, WalletTransactionEntity } from '@travelta/schemas';
import { ApiClientError } from '@travelta/api-client';
import { ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle2, CreditCard, Gauge, Lock, PiggyBank, Plus, Snowflake, Wallet, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tab, Tabs, TabsList, TabsPanel } from '@/components/ui/tabs';
import { useDateFormat } from '@/features/bookings/bookings-page';
import { priceOf } from '@/features/search/format';
import { toStoredFile } from '@/lib/files';
import { useAction } from '@/lib/mutations';
import { useCan, useSession } from '@/lib/session';
import { FINANCE_KEYS, fromMinor, toMinor, useFinancialAccounts } from './collect-dialog';

const TOPUP_METHODS = ['bank_transfer', 'instapay', 'vodafone_cash', 'cash', 'card'] as const;

function useMoney() {
  const locale = useLocale();
  return (m: number, currency = 'EGP') => priceOf(m, currency, locale);
}

/** WAL-2 figures for one wallet. */
export function WalletSummary({ wallet }: { wallet: WalletDto }) {
  const t = useTranslations('finance');
  const money = useMoney();
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="wallet-summary">
      <StatCard label={t('available')} value={<span data-testid="wallet-available">{money(wallet.availableMinor, wallet.currency)}</span>} icon={<Wallet />} />
      <StatCard label={t('balance')} value={<span className={wallet.balanceMinor < 0 ? 'text-danger' : undefined}>{money(wallet.balanceMinor, wallet.currency)}</span>} icon={<PiggyBank />} />
      <StatCard label={t('creditLimit')} value={money(wallet.creditLimitMinor, wallet.currency)} icon={<CreditCard />} deltaLabel={wallet.creditUsedMinor > 0 ? t('creditUsed', { amount: money(wallet.creditUsedMinor, wallet.currency) }) : undefined} />
      <StatCard label={t('onHold')} value={money(wallet.activeHoldsMinor, wallet.currency)} icon={<Lock />} deltaLabel={wallet.awaitingMinor > 0 ? t('awaitingAmount', { amount: money(wallet.awaitingMinor, wallet.currency) }) : undefined} />
    </div>
  );
}

function TransactionsTable({ walletId }: { walletId?: string }) {
  const t = useTranslations('finance');
  const api = useApi();
  const money = useMoney();
  const date = useDateFormat();
  const state = useListState({ pageSize: 10, sort: 'at:desc' });
  const result = useQuery({ queryKey: ['wallet', 'tx', walletId ?? 'mine', state.query], queryFn: () => api.call('wallet.transactions', { ...state.query, walletId }), placeholderData: keepPreviousData });
  const columns: Column<WalletTransactionEntity>[] = [
    { key: 'at', header: t('date'), sortKey: 'at', cell: (x) => <span className="tabular whitespace-nowrap text-sm">{date(x.at)}</span> },
    { key: 'type', header: t('type'), cell: (x) => <Badge tone={x.amountMinor >= 0 ? 'success' : 'neutral'}>{x.amountMinor >= 0 ? <ArrowDownLeft className="size-3" aria-hidden /> : <ArrowUpRight className="size-3" aria-hidden />}{t(`tx_${x.type}`)}</Badge> },
    { key: 'note', header: t('description'), cell: (x) => <span className="text-sm">{x.note}</span> },
    { key: 'amount', header: t('amount'), sortKey: 'amount', numeric: true, cell: (x) => <span className={x.amountMinor < 0 ? 'tabular font-medium text-fg' : 'tabular font-medium text-success'}>{x.amountMinor > 0 ? '+' : ''}{money(x.amountMinor)}</span> },
    { key: 'after', header: t('balanceAfter'), numeric: true, hideOnCard: true, cell: (x) => <span className="tabular text-sm text-fg-muted">{money(x.balanceAfterMinor)}</span> },
  ];
  return (
    <DataTable state={state} result={result} columns={columns} rowKey={(x) => x.id} label={t('transactions')} testId="wallet-transactions"
      filters={[{ key: 'type', label: t('type'), options: (['top_up', 'booking_debit', 'refund_credit', 'adjustment'] as const).map((v) => ({ value: v, label: t(`tx_${v}`) })) }]}
      empty={<EmptyState icon={<Banknote aria-hidden />} title={t('noTransactions')} />} />
  );
}

/** Top-up queue: the owner sees its requests; the holder (platform / parent agency) decides them (WAL-5). */
export function TopUpsTable({ scope }: { scope: 'mine' | 'incoming' | 'all' }) {
  const t = useTranslations('finance');
  const api = useApi();
  const money = useMoney();
  const date = useDateFormat();
  const state = useListState({ pageSize: 10, sort: 'createdAt:desc' });
  const query = { ...state.query, filters: { ...(state.query.filters ?? {}), ...(scope === 'all' ? {} : { mine: String(scope === 'mine') }) } };
  const result = useQuery({ queryKey: ['wallet', 'topups', scope, state.query], queryFn: () => api.call('wallet.topUps', query), placeholderData: keepPreviousData });
  const [deciding, setDeciding] = useState<{ row: TopUpListItem; decision: 'approve' | 'reject' } | null>(null);
  const columns: Column<TopUpListItem>[] = [
    { key: 'createdAt', header: t('date'), sortKey: 'createdAt', cell: (x) => <span className="tabular whitespace-nowrap text-sm">{date(x.createdAt)}</span> },
    ...(scope !== 'mine' ? [{ key: 'owner', header: t('agency'), cell: (x: TopUpListItem) => <span className="font-medium">{x.ownerName}</span> }] : []),
    { key: 'method', header: t('method'), cell: (x) => <span className="text-sm">{t(`topup_${x.method}`)} · <span className="font-mono text-xs" dir="ltr">{x.reference}</span>{x.proof && <Badge tone="neutral" className="ms-1">{t('proof')}</Badge>}</span> },
    { key: 'amount', header: t('amount'), sortKey: 'amount', numeric: true, cell: (x) => <span className="tabular font-medium">{money(x.amountMinor, x.currency)}</span> },
    { key: 'status', header: t('status'), cell: (x) => <Badge tone={x.status === 'approved' ? 'success' : x.status === 'rejected' ? 'danger' : 'warning'} title={x.reason ?? undefined}>{t(`topupStatus_${x.status}`)}</Badge> },
  ];
  return (
    <>
      <DataTable state={state} result={result} columns={columns} rowKey={(x) => x.id} label={t('topUps')} testId={`topups-${scope}`}
        filters={[{ key: 'status', label: t('status'), options: (['pending', 'approved', 'rejected'] as const).map((v) => ({ value: v, label: t(`topupStatus_${v}`) })) }]}
        rowActions={(x) => x.canDecide ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" onClick={() => setDeciding({ row: x, decision: 'approve' })} data-action="approve-topup"><CheckCircle2 aria-hidden />{t('approve')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setDeciding({ row: x, decision: 'reject' })} data-action="reject-topup"><XCircle aria-hidden />{t('reject')}</Button>
          </div>
        ) : null}
        empty={<EmptyState icon={<Banknote aria-hidden />} title={t('noTopUps')} />} />
      {deciding && <DecideTopUpDialog {...deciding} onClose={() => setDeciding(null)} />}
    </>
  );
}

function DecideTopUpDialog({ row, decision, onClose }: { row: TopUpListItem; decision: 'approve' | 'reject'; onClose: () => void }) {
  const t = useTranslations('finance');
  const api = useApi();
  const money = useMoney();
  const accounts = useFinancialAccounts(decision === 'approve');
  const [accountId, setAccountId] = useState('');
  const [reason, setReason] = useState('');
  const act = useAction(() => api.call('wallet.decideTopUp', { id: row.id, decision, reason: reason || undefined, financialAccountId: accountId || undefined }), {
    success: decision === 'approve' ? t('topUpApproved') : t('topUpRejected'), invalidate: FINANCE_KEYS, onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={decision === 'approve' ? t('approveTopUpTitle') : t('rejectTopUpTitle')} description={t('topUpLine', { owner: row.ownerName, amount: money(row.amountMinor, row.currency) })}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button variant={decision === 'reject' ? 'danger' : 'primary'} onClick={() => act.mutate()} loading={act.isPending} disabled={decision === 'reject' && reason.trim().length < 3} data-testid="topup-decide">{decision === 'approve' ? t('approve') : t('reject')}</Button></>}>
      {decision === 'approve' ? (
        <Field label={t('receivedInto')} help={t('receivedIntoHelp')}>
          <Select name="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t('defaultAccount')}</option>
            {(accounts.data ?? []).filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      ) : <Field label={t('reason')} required><Textarea name="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
      {row.proof?.dataUrl && <a href={row.proof.dataUrl} download={row.proof.name} className="text-sm font-medium text-primary hover:underline">{t('downloadProof', { name: row.proof.name })}</a>}
    </Dialog>
  );
}

function RequestTopUpDialog({ open, onClose, currency }: { open: boolean; onClose: () => void; currency: string }) {
  const t = useTranslations('finance');
  const tv = useTranslations();
  const api = useApi();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof TOPUP_METHODS)[number]>('bank_transfer');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<KycFile | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const close = () => { setAmount(''); setReference(''); setProof(null); setErrors({}); onClose(); };
  const send = useAction(() => api.call('wallet.requestTopUp', { amountMinor: toMinor(amount), method, reference, proof }), { success: t('topUpSent'), invalidate: FINANCE_KEYS, onSuccess: close });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={t('requestTopUp')} description={t('requestTopUpBody')}
      footer={<><Button variant="outline" onClick={close}>{t('cancel')}</Button><Button onClick={() => send.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={send.isPending} disabled={toMinor(amount) <= 0 || reference.trim().length < 2} data-testid="topup-submit">{t('send')}</Button></>}>
      <div className="flex flex-col gap-3" data-testid="topup-form">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`${t('amount')} (${currency})`} required error={errors.amountMinor}><Input type="number" min={0} step="0.01" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={t('method')}><Select name="method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>{TOPUP_METHODS.map((m) => <option key={m} value={m}>{t(`topup_${m}`)}</option>)}</Select></Field>
        </div>
        <Field label={t('transferReference')} required error={errors.reference}><Input name="reference" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label={t('proof')} optional error={errors.proof} help={proof ? proof.name : t('proofHelp')}>
          <Input type="file" accept="application/pdf,image/jpeg,image/png" name="proof" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const stored = await toStoredFile(file);
            if ('error' in stored) setErrors({ proof: tv(stored.error as never) }); else { setProof(stored.file); setErrors({}); }
          }} />
        </Field>
      </div>
    </Dialog>
  );
}

function CreditLimitDialog({ wallet, onClose }: { wallet: WalletDto; onClose: () => void }) {
  const t = useTranslations('finance');
  const api = useApi();
  const [limit, setLimit] = useState(fromMinor(wallet.creditLimitMinor));
  const save = useAction(() => api.call('wallet.setCreditLimit', { walletId: wallet.id, creditLimitMinor: toMinor(limit) }), { success: t('limitSaved'), invalidate: FINANCE_KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('setCreditLimit')} description={t('setCreditLimitBody', { owner: wallet.ownerName })}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate()} loading={save.isPending} data-testid="limit-save">{t('save')}</Button></>}>
      <Field label={`${t('creditLimit')} (${wallet.currency})`}><Input type="number" min={0} step="100" name="creditLimit" value={limit} onChange={(e) => setLimit(e.target.value)} autoFocus /></Field>
    </Dialog>
  );
}

/** Wallets held with this organization (platform: agencies; parent agency: its sub-agencies). */
export function HeldWalletsTable() {
  const t = useTranslations('finance');
  const api = useApi();
  const money = useMoney();
  const canManage = useCan('wallet.credit_manage');
  const state = useListState({ pageSize: 10, sort: 'ownerName:asc' });
  const result = useQuery({ queryKey: ['wallet', 'list', state.query], queryFn: () => api.call('wallet.list', state.query), placeholderData: keepPreviousData });
  const [limitFor, setLimitFor] = useState<WalletDto | null>(null);
  const [detail, setDetail] = useState<WalletDto | null>(null);
  const toggle = useAction((w: WalletDto) => api.call('wallet.setStatus', { walletId: w.id, status: w.status === 'active' ? 'frozen' : 'active' }), { success: t('statusSaved'), invalidate: FINANCE_KEYS });
  const columns: Column<WalletDto>[] = [
    { key: 'ownerName', header: t('agency'), sortKey: 'ownerName', cell: (w) => (
      <div className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{w.ownerName}</span>{w.status === 'frozen' && <Badge tone="info"><Snowflake className="size-3" aria-hidden />{t('frozen')}</Badge>}{w.pendingTopUps > 0 && <Badge tone="warning">{t('pendingTopUps', { n: w.pendingTopUps })}</Badge>}</div>
    ) },
    { key: 'balance', header: t('balance'), sortKey: 'balance', numeric: true, cell: (w) => <span className={w.balanceMinor < 0 ? 'tabular text-danger' : 'tabular'}>{money(w.balanceMinor, w.currency)}</span> },
    { key: 'credit', header: t('creditLimit'), numeric: true, hideOnCard: true, cell: (w) => <span className="tabular">{money(w.creditLimitMinor, w.currency)}</span> },
    { key: 'creditUsed', header: t('creditUsedCol'), sortKey: 'creditUsed', numeric: true, cell: (w) => <span className="tabular">{money(w.creditUsedMinor, w.currency)}</span> },
    { key: 'available', header: t('available'), sortKey: 'available', numeric: true, cell: (w) => <span className="tabular font-medium">{money(w.availableMinor, w.currency)}</span> },
    { key: 'awaiting', header: t('awaitingCol'), numeric: true, hideOnCard: true, cell: (w) => w.awaitingMinor > 0 ? <Badge tone="warning">{money(w.awaitingMinor, w.currency)}</Badge> : <span className="text-fg-subtle">—</span> },
  ];
  return (
    <>
      <DataTable state={state} result={result} columns={columns} rowKey={(w) => w.id} label={t('wallets')} testId="held-wallets" onRowClick={setDetail}
        filters={[{ key: 'attention', label: t('attention'), options: [{ value: 'true', label: t('needsAttention') }] }, { key: 'status', label: t('status'), options: [{ value: 'active', label: t('active') }, { value: 'frozen', label: t('frozen') }] }]}
        rowActions={(w) => canManage ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" onClick={() => setLimitFor(w)} data-action="set-limit"><Gauge aria-hidden />{t('limit')}</Button>
            <Button size="sm" variant="ghost" onClick={() => toggle.mutate(w)} aria-label={w.status === 'active' ? t('freeze') : t('unfreeze')} title={w.status === 'active' ? t('freeze') : t('unfreeze')}><Snowflake aria-hidden /></Button>
          </div>
        ) : null}
        empty={<EmptyState icon={<Wallet aria-hidden />} title={t('noWallets')} />} />
      {limitFor && <CreditLimitDialog wallet={limitFor} onClose={() => setLimitFor(null)} />}
      {detail && (
        <Dialog open onOpenChange={(o) => !o && setDetail(null)} title={detail.ownerName} description={t('heldAt', { holder: detail.holderName })} size="lg">
          <WalletSummary wallet={detail} />
          <TransactionsTable walletId={detail.id} />
        </Dialog>
      )}
    </>
  );
}

function HoldsCard() {
  const t = useTranslations('finance');
  const api = useApi();
  const money = useMoney();
  const locale = useLocale() as 'en' | 'ar';
  const w = useQuery({ queryKey: ['wallet', 'mine'], queryFn: () => api.call('wallet.get', {}) });
  if (!w.data || w.data.holds.length === 0) return null;
  return (
    <Card>
      <CardHeader title={t('activeHolds')} description={t('activeHoldsBody')} />
      <CardBody>
        <ul className="divide-y divide-border">
          {w.data.holds.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span><span className="font-mono text-xs text-fg-muted" dir="ltr">{h.bookingRef}</span> · {h.itemTitle[locale]}</span>
              <span className="flex items-center gap-2"><span className="tabular font-medium">{money(h.amountMinor, w.data.wallet.currency)}</span>{h.awaitingApproval && <Badge tone="warning">{t('awaitingApproval')}</Badge>}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/** Agency wallet (W8): balance and credit, holds, statement, top-ups — and the sub-agency wallets it holds. */
export function AgencyWalletPage() {
  const t = useTranslations('finance');
  const api = useApi();
  const isSub = useSession((s) => Boolean(s.session?.organization.parentId));
  const canApprove = useCan('wallet.top_up_approve');
  const [topUp, setTopUp] = useState(false);
  const w = useQuery({ queryKey: ['wallet', 'mine'], queryFn: () => api.call('wallet.get', {}) });
  return (
    <>
      <PageHeader title={t('walletTitle')} description={isSub ? t('walletDescriptionSub') : t('walletDescription')}
        actions={w.data?.canRequestTopUp && <Button onClick={() => setTopUp(true)} data-testid="request-topup"><Plus aria-hidden />{t('requestTopUp')}</Button>} />
      <Tabs defaultValue="wallet">
        <TabsList>
          <Tab value="wallet">{t('myWallet')}</Tab>
          <Tab value="topups">{t('topUps')}</Tab>
          {canApprove && !isSub && <Tab value="subs" data-testid="tab-subs">{t('subWallets')}</Tab>}
        </TabsList>
        <TabsPanel value="wallet" className="flex flex-col gap-6">
          {!w.data ? <Skeleton className="h-28 w-full" /> : (
            <>
              <WalletSummary wallet={w.data.wallet} />
              {!w.data.wallet.balanceVerified && <p className="text-sm text-danger">{t('integrityWarning')}</p>}
              {w.data.wallet.status === 'frozen' && <p className="flex items-center gap-1.5 rounded-md bg-info-bg px-3 py-2 text-sm text-info"><Snowflake className="size-4" aria-hidden />{t('frozenBody')}</p>}
              <p className="text-sm text-fg-muted">{t('heldAt', { holder: w.data.wallet.holderName })}</p>
            </>
          )}
          <HoldsCard />
          <section className="flex flex-col gap-2"><h2 className="text-base font-semibold text-fg">{t('statement')}</h2><TransactionsTable /></section>
        </TabsPanel>
        <TabsPanel value="topups"><TopUpsTable scope="mine" /></TabsPanel>
        {canApprove && !isSub && (
          <TabsPanel value="subs" className="flex flex-col gap-6">
            <HeldWalletsTable />
            <section className="flex flex-col gap-2"><h2 className="text-base font-semibold text-fg">{t('incomingTopUps')}</h2><TopUpsTable scope="incoming" /></section>
          </TabsPanel>
        )}
      </Tabs>
      {w.data && <RequestTopUpDialog open={topUp} onClose={() => setTopUp(false)} currency={w.data.wallet.currency} />}
    </>
  );
}

/** Platform finance (W8): every agency wallet, credit limits, freezes and the top-up approval queue. */
export function AdminWalletsPage() {
  const t = useTranslations('finance');
  return (
    <>
      <PageHeader title={t('adminWalletsTitle')} description={t('adminWalletsDescription')} />
      <Tabs defaultValue="wallets">
        <TabsList>
          <Tab value="wallets">{t('wallets')}</Tab>
          <Tab value="topups" data-testid="tab-topups">{t('topUpApprovals')}</Tab>
        </TabsList>
        <TabsPanel value="wallets"><HeldWalletsTable /></TabsPanel>
        <TabsPanel value="topups"><TopUpsTable scope="incoming" /></TabsPanel>
      </Tabs>
    </>
  );
}
