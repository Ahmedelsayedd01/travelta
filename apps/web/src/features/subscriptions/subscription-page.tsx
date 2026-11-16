'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SubscriptionDto, SubscriptionPlanEntity } from '@travelta/schemas';
import { ApiClientError } from '@travelta/api-client';
import { BadgeCheck, Check, CreditCard, Lock, PencilLine, Plus, Receipt, Sparkles, Store, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tab, Tabs, TabsList, TabsPanel } from '@/components/ui/tabs';
import { useDateFormat } from '@/features/bookings/bookings-page';
import { priceOf } from '@/features/search/format';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { useAction } from '@/lib/mutations';
import { useErrorDetails } from '@/lib/errors';
import { useCan } from '@/lib/session';

const KEYS = [['subscriptions']] as const;
const STATUS_TONE = { trialing: 'info', active: 'success', past_due: 'warning', suspended: 'danger', cancelled: 'neutral' } as const;
const useMoney = () => { const locale = useLocale(); return (m: number) => priceOf(m, 'EGP', locale); };

/** Shown instead of a screen whose module the plan does not include (SUB-3). */
export function UpgradePrompt({ feature }: { feature: string }) {
  const t = useTranslations('subscriptions');
  const canManage = useCan('subscriptions.manage');
  return (
    <EmptyState icon={<Lock aria-hidden />} title={t('upgradeTitle', { feature })} body={t('upgradeBody')}
      action={canManage ? <Link href="/agency/subscription" className="font-semibold text-primary hover:underline" data-testid="upgrade-link">{t('seePlans')}</Link> : undefined} />
  );
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const t = useTranslations('subscriptions');
  const pct = limit === null ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm"><span className="text-fg-muted">{label}</span><span className="tabular font-medium">{limit === null ? t('usedUnlimited', { used }) : t('usedOf', { used, limit })}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-subtle" role="meter" aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit ?? used} aria-label={label}>
        <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-primary')} style={{ width: `${limit === null ? 8 : pct}%` }} />
      </div>
    </div>
  );
}

function PlanCard({ plan, current, pending, onChoose, busy }: { plan: SubscriptionPlanEntity; current: SubscriptionDto | null; pending: boolean; onChoose?: () => void; busy?: boolean }) {
  const t = useTranslations('subscriptions');
  const locale = useLocale() as 'en' | 'ar';
  const money = useMoney();
  const cycle = current?.cycle ?? 'monthly';
  const isCurrent = plan.id === current?.planId;
  const price = cycle === 'monthly' ? plan.monthlyMinor : plan.yearlyMinor;
  const lim = (n: number | null) => (n === null ? t('unlimited') : String(n));
  return (
    <Card className={cn('flex flex-col', isCurrent && 'ring-2 ring-primary')} data-testid="plan-card" data-plan={plan.key}>
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{plan.name[locale]}</h3>
          {isCurrent ? <Badge tone="primary">{t('currentPlan')}</Badge> : pending ? <Badge tone="warning">{t('fromNextPeriod')}</Badge> : null}
        </div>
        <p className="text-sm text-fg-muted">{plan.description[locale]}</p>
        <p><span className="tabular text-2xl font-bold">{money(price)}</span> <span className="text-sm text-fg-muted">/ {t(cycle === 'monthly' ? 'perMonth' : 'perYear')}</span></p>
        <ul className="flex flex-col gap-1.5 text-sm">
          <li className="flex gap-2"><Check className="size-4 text-success" aria-hidden />{t('limitUsers', { n: lim(plan.limits.users) })}</li>
          <li className="flex gap-2"><Check className="size-4 text-success" aria-hidden />{t('limitSubAgencies', { n: lim(plan.limits.subAgencies) })}</li>
          <li className="flex gap-2"><Check className="size-4 text-success" aria-hidden />{t('limitBookings', { n: lim(plan.limits.bookingsPerMonth) })}</li>
          {(['crm', 'accounting', 'sub_agencies'] as const).map((m) => (
            <li key={m} className={cn('flex gap-2', !plan.modules.includes(m) && 'text-fg-subtle line-through')}>{plan.modules.includes(m) ? <Check className="size-4 text-success" aria-hidden /> : <Lock className="size-4" aria-hidden />}{t(`module_${m}`)}</li>
          ))}
          <li className="flex gap-2"><Store className="size-4 text-primary" aria-hidden />{plan.storefrontIncluded ? t('storefrontIncluded') : t('storefrontAddon', { price: money(plan.storefrontAddonMonthlyMinor) })}</li>
        </ul>
        {plan.isDemoValue && <p className="text-xs text-fg-subtle">{t('demoValues')}</p>}
        {onChoose && !isCurrent && <Button className="mt-auto" onClick={onChoose} loading={busy} data-action="choose-plan">{t('choose')}</Button>}
      </CardBody>
    </Card>
  );
}

function CardDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('subscriptions');
  const api = useApi();
  const [v, setV] = useState({ number: '', expiry: '', cvc: '', holder: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => api.call('subscriptions.updateCard', v), { success: t('cardSaved'), invalidate: KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('updateCard')} description={t('testCards')}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={save.isPending} data-testid="card-save">{t('save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3" data-testid="card-form">
        <Field label={t('cardNumber')} className="sm:col-span-3" error={errors.number ?? errors['payment.card.number']}><Input name="cardNumber" dir="ltr" inputMode="numeric" value={v.number} onChange={(e) => setV({ ...v, number: e.target.value })} /></Field>
        <Field label={t('expiry')} error={errors.expiry}><Input name="expiry" dir="ltr" placeholder="MM/YY" value={v.expiry} onChange={(e) => setV({ ...v, expiry: e.target.value })} /></Field>
        <Field label={t('cvc')} error={errors.cvc}><Input name="cvc" dir="ltr" value={v.cvc} onChange={(e) => setV({ ...v, cvc: e.target.value })} /></Field>
        <Field label={t('holder')} error={errors.holder}><Input name="holder" value={v.holder} onChange={(e) => setV({ ...v, holder: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

/** Agency subscription (W10): plan, usage vs limits, plan changes with proration, add-on, card, invoices. */
export function AgencySubscriptionPage() {
  const t = useTranslations('subscriptions');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const money = useMoney();
  const date = useDateFormat();
  const mine = useQuery({ queryKey: ['subscriptions', 'mine'], queryFn: () => api.call('subscriptions.mine', undefined) });
  const plans = useQuery({ queryKey: ['subscriptions', 'plans'], queryFn: () => api.call('subscriptions.plans', undefined) });
  const [confirm, setConfirm] = useState<SubscriptionPlanEntity | null>(null);
  const [card, setCard] = useState(false);
  const change = useAction((planId: string) => api.call('subscriptions.changePlan', { planId }), {
    success: (out) => (out.effective === 'now' ? t('changedNow', { amount: money(out.chargedMinor) }) : t('changedLater')), invalidate: KEYS, onSuccess: () => setConfirm(null),
  });
  const addon = useAction((on: boolean) => api.call('subscriptions.setAddon', { storefront: on }), { success: t('addonSaved'), invalidate: KEYS });
  const cancel = useAction((on: boolean) => api.call('subscriptions.setCancel', { cancelAtPeriodEnd: on }), { success: t('cancelSaved'), invalidate: KEYS });
  const pay = useAction(() => api.call('subscriptions.payNow', undefined), { success: t('paid'), invalidate: KEYS });
  const reasons = useErrorDetails();
  if (mine.isError) return <ErrorState onRetry={() => void mine.refetch()} />;
  if (!mine.data || !plans.data) return <Skeleton className="h-96 w-full" />;
  const s = mine.data.subscription;
  if (!s) return <EmptyState icon={<BadgeCheck aria-hidden />} title={t('noSubscription')} />;
  const manage = mine.data.canManage;
  const upgrade = confirm && (confirm.monthlyMinor > s.plan.monthlyMinor);
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <div className="flex flex-col gap-6" data-testid="subscription-page">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2">{s.plan.name[locale]}<Badge tone={STATUS_TONE[s.status]} data-testid="sub-status">{t(`status_${s.status}`)}</Badge></span>}
              description={s.status === 'trialing' ? t('trialEnds', { date: date(s.trialEndsAt!), days: s.daysLeftInTrial ?? 0 }) : t('renews', { date: date(s.currentPeriodEnd) })}
              actions={manage && (s.status === 'past_due' || s.status === 'suspended') && <Button onClick={() => pay.mutate()} loading={pay.isPending} data-testid="pay-now">{t('payNow')}</Button>} />
            <CardBody className="flex flex-col gap-4">
              <Meter label={t('users')} used={s.usage.users} limit={s.plan.limits.users} />
              <Meter label={t('subAgencies')} used={s.usage.subAgencies} limit={s.plan.limits.subAgencies} />
              <Meter label={t('bookingsMonth')} used={s.usage.bookingsThisMonth} limit={s.plan.limits.bookingsPerMonth} />
              {s.pendingPlan && <p className="rounded-md bg-info-bg px-3 py-2 text-sm text-info" data-testid="pending-plan">{t('pendingChange', { plan: s.pendingPlan.name[locale], date: date(s.currentPeriodEnd) })}</p>}
              {s.status === 'past_due' && <p className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">{t('pastDueBody', { date: date(s.graceEndsAt!) })}</p>}
              {s.status === 'suspended' && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{t('suspendedBody')}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t('billing')} />
            <CardBody className="flex flex-col gap-4 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><CreditCard className="size-4 text-fg-muted" aria-hidden />{s.card ? `${s.card.brand} ••${s.card.last4}` : t('noCard')}</span>
                {manage && <Button size="sm" variant="outline" onClick={() => setCard(true)} data-testid="update-card">{s.card ? t('change') : t('addCard')}</Button>}</div>
              {s.card?.failing && <p className="text-warning">{t('cardFailing')}</p>}
              <Switch checked={s.storefrontAddon || s.plan.storefrontIncluded} disabled={!manage || s.plan.storefrontIncluded || addon.isPending} onCheckedChange={(on) => addon.mutate(on)}
                label={<span>{t('storefrontAddonLabel')} <span className="text-fg-muted">{s.plan.storefrontIncluded ? t('included') : `${money(s.plan.storefrontAddonMonthlyMinor)}/${t('perMonth')}`}</span></span>} />
              {manage && s.status !== 'cancelled' && (
                <Checkbox checked={s.cancelAtPeriodEnd} onCheckedChange={(on) => cancel.mutate(on)} label={t('cancelAtEnd')} />
              )}
              <p className="text-xs text-fg-muted">{t('cycleLine', { cycle: t(s.cycle === 'monthly' ? 'monthly' : 'yearly'), mrr: money(s.mrrMinor) })}</p>
            </CardBody>
          </Card>
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t('plans')}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.data.map((p) => <PlanCard key={p.id} plan={p} current={s} pending={s.pendingPlanId === p.id} onChoose={manage && s.status !== 'suspended' && s.status !== 'cancelled' ? () => setConfirm(p) : undefined} />)}
          </div>
        </section>
        <Card>
          <CardHeader title={t('invoices')} />
          <CardBody className="p-0">
            {mine.data.invoices.length === 0 ? <p className="px-5 py-4 text-sm text-fg-muted">{t('noInvoices')}</p> : (
              <ul className="divide-y divide-border" data-testid="sub-invoices">
                {mine.data.invoices.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <span><span className="font-mono" dir="ltr">{i.number}</span> <span className="text-fg-muted">· {t(`kind_${i.kind}`)} · {date(i.periodStart)} → {date(i.periodEnd)}</span></span>
                    <span className="flex items-center gap-2"><span className="tabular font-medium">{money(i.totalMinor)}</span><Badge tone={i.status === 'paid' ? 'success' : 'danger'}>{t(`inv_${i.status}`)}</Badge></span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
      <Dialog open={confirm !== null} onOpenChange={(o) => { if (!o) { setConfirm(null); change.reset(); } }} title={confirm ? t('switchTo', { plan: confirm.name[locale] }) : ''}
        description={s.status === 'trialing' ? t('trialSwitch') : upgrade ? t('upgradeNow') : t('downgradeLater', { date: date(s.currentPeriodEnd) })}
        footer={<><Button variant="outline" onClick={() => { setConfirm(null); change.reset(); }}>{t('cancel')}</Button><Button onClick={() => change.mutate(confirm!.id)} loading={change.isPending} data-testid="confirm-plan"><Sparkles aria-hidden />{t('confirm')}</Button></>}>
        {change.isError && (
          <ul role="alert" className="flex flex-col gap-1 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" data-testid="plan-change-error">
            {reasons(change.error).map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
      </Dialog>
      {card && <CardDialog onClose={() => setCard(false)} />}
    </>
  );
}

function PlanDialog({ plan, onClose }: { plan: SubscriptionPlanEntity | null; onClose: () => void }) {
  const t = useTranslations('subscriptions');
  const api = useApi();
  const num = (m: number | null | undefined) => (m === null || m === undefined ? '' : String(m));
  const [v, setV] = useState({
    key: plan?.key ?? '', en: plan?.name.en ?? '', ar: plan?.name.ar ?? '', den: plan?.description.en ?? '', dar: plan?.description.ar ?? '',
    monthly: plan ? String(plan.monthlyMinor / 100) : '', yearly: plan ? String(plan.yearlyMinor / 100) : '', users: num(plan?.limits.users), subAgencies: num(plan?.limits.subAgencies), bookings: num(plan?.limits.bookingsPerMonth),
    modules: plan?.modules ?? [], storefrontIncluded: plan?.storefrontIncluded ?? false, addon: plan ? String(plan.storefrontAddonMonthlyMinor / 100) : '750', active: plan?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const lim = (x: string) => (x.trim() === '' ? null : Number(x));
  const save = useAction(() => api.call('subscriptions.savePlan', {
    id: plan?.id, key: v.key, name: { en: v.en, ar: v.ar }, description: { en: v.den, ar: v.dar }, monthlyMinor: Math.round(Number(v.monthly) * 100), yearlyMinor: Math.round(Number(v.yearly) * 100),
    limits: { users: lim(v.users), subAgencies: lim(v.subAgencies), bookingsPerMonth: lim(v.bookings) }, modules: v.modules, storefrontIncluded: v.storefrontIncluded,
    storefrontAddonMonthlyMinor: Math.round(Number(v.addon || 0) * 100), active: v.active,
  }), { success: t('planSaved'), invalidate: KEYS, onSuccess: onClose });
  const toggle = (m: 'crm' | 'accounting' | 'sub_agencies', on: boolean) => setV({ ...v, modules: on ? [...v.modules, m] : v.modules.filter((x) => x !== m) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={plan ? t('editPlan') : t('newPlan')} description={t('demoValues')} size="lg"
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={save.isPending} data-testid="plan-save">{t('save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2" data-testid="plan-form">
        <Field label={t('key')} error={errors.key}><Input name="key" dir="ltr" value={v.key} disabled={Boolean(plan)} onChange={(e) => setV({ ...v, key: e.target.value })} /></Field>
        <span />
        <Field label={t('nameEn')} error={errors['name.en']}><Input name="nameEn" value={v.en} onChange={(e) => setV({ ...v, en: e.target.value })} /></Field>
        <Field label={t('nameAr')} error={errors['name.ar']}><Input name="nameAr" dir="rtl" value={v.ar} onChange={(e) => setV({ ...v, ar: e.target.value })} /></Field>
        <Field label={t('descEn')} error={errors['description.en']}><Input name="descEn" value={v.den} onChange={(e) => setV({ ...v, den: e.target.value })} /></Field>
        <Field label={t('descAr')} error={errors['description.ar']}><Input name="descAr" dir="rtl" value={v.dar} onChange={(e) => setV({ ...v, dar: e.target.value })} /></Field>
        <Field label={t('monthlyPrice')}><Input type="number" min={0} name="monthly" value={v.monthly} onChange={(e) => setV({ ...v, monthly: e.target.value })} /></Field>
        <Field label={t('yearlyPrice')}><Input type="number" min={0} name="yearly" value={v.yearly} onChange={(e) => setV({ ...v, yearly: e.target.value })} /></Field>
        <Field label={t('users')} help={t('blankUnlimited')}><Input type="number" min={1} name="users" value={v.users} onChange={(e) => setV({ ...v, users: e.target.value })} /></Field>
        <Field label={t('subAgencies')} help={t('blankUnlimited')}><Input type="number" min={0} name="subAgencies" value={v.subAgencies} onChange={(e) => setV({ ...v, subAgencies: e.target.value })} /></Field>
        <Field label={t('bookingsMonth')} help={t('blankUnlimited')}><Input type="number" min={1} name="bookings" value={v.bookings} onChange={(e) => setV({ ...v, bookings: e.target.value })} /></Field>
        <Field label={t('addonPrice')}><Input type="number" min={0} name="addon" value={v.addon} onChange={(e) => setV({ ...v, addon: e.target.value })} /></Field>
        <div className="flex flex-col gap-2 sm:col-span-2">
          {(['crm', 'accounting', 'sub_agencies'] as const).map((m) => <Checkbox key={m} checked={v.modules.includes(m)} onCheckedChange={(on) => toggle(m, on)} label={t(`module_${m}`)} />)}
          <Checkbox checked={v.storefrontIncluded} onCheckedChange={(on) => setV({ ...v, storefrontIncluded: on })} label={t('storefrontIncludedLabel')} />
          <Checkbox checked={v.active} onCheckedChange={(on) => setV({ ...v, active: on })} label={t('activePlan')} />
          {errors.active && <p className="text-sm text-danger">{t('planInUse')}</p>}
        </div>
      </div>
    </Dialog>
  );
}

/** Platform SaaS admin (W10): subscribers with MRR, editable DEMO plans and the billing log. */
export function AdminSubscriptionsPage() {
  const t = useTranslations('subscriptions');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const money = useMoney();
  const date = useDateFormat();
  const canManage = useCan('subscriptions.manage');
  const state = useListState({ pageSize: 20, sort: 'orgName:asc' });
  const list = useQuery({ queryKey: ['subscriptions', 'list', state.query], queryFn: () => api.call('subscriptions.list', state.query), placeholderData: keepPreviousData });
  const plans = useQuery({ queryKey: ['subscriptions', 'plans'], queryFn: () => api.call('subscriptions.plans', undefined) });
  const invState = useListState({ pageSize: 10, sort: 'issuedAt:desc' });
  const invoices = useQuery({ queryKey: ['subscriptions', 'invoices', invState.query], queryFn: () => api.call('subscriptions.invoices', invState.query), placeholderData: keepPreviousData });
  const [edit, setEdit] = useState<SubscriptionPlanEntity | 'new' | null>(null);
  const act = useAction((x: { subscriptionId: string; action: 'extend_trial' | 'suspend' | 'reactivate' }) => api.call('subscriptions.adminAction', x), { success: t('updated'), invalidate: KEYS });
  const rows = list.data?.items ?? [];
  const mrr = rows.reduce((s, r) => s + r.mrrMinor, 0);
  const columns: Column<SubscriptionDto>[] = [
    { key: 'orgName', header: t('agency'), sortKey: 'orgName', cell: (s) => <div><p className="font-medium">{s.orgName}</p><p className="text-xs text-fg-muted">{s.plan.name[locale]} · {t(s.cycle)}{s.pendingPlan ? ` → ${s.pendingPlan.name[locale]}` : ''}</p></div> },
    { key: 'status', header: t('status'), cell: (s) => <Badge tone={STATUS_TONE[s.status]}>{t(`status_${s.status}`)}</Badge> },
    { key: 'usage', header: t('users'), hideOnCard: true, cell: (s) => <span className="tabular text-sm">{s.usage.users}/{s.plan.limits.users ?? '∞'}</span> },
    { key: 'period', header: t('periodEnd'), sortKey: 'periodEnd', cell: (s) => <span className="tabular text-sm">{date(s.currentPeriodEnd)}</span> },
    { key: 'mrr', header: t('mrr'), sortKey: 'mrr', numeric: true, cell: (s) => <span className="tabular font-medium">{money(s.mrrMinor)}</span> },
  ];
  return (
    <>
      <PageHeader title={t('adminTitle')} description={t('adminDescription')} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t('mrr')} value={<span data-testid="total-mrr">{money(mrr)}</span>} icon={<Sparkles />} />
        <StatCard label={t('activeSubs')} value={rows.filter((r) => r.status === 'active').length} icon={<Users />} />
        <StatCard label={t('atRisk')} value={rows.filter((r) => r.status === 'past_due' || r.status === 'suspended').length} icon={<Receipt />} />
      </div>
      <Tabs defaultValue="subscribers">
        <TabsList>
          <Tab value="subscribers">{t('subscribers')}</Tab>
          <Tab value="plans" data-testid="tab-plans">{t('plans')}</Tab>
          <Tab value="billing">{t('billingLog')}</Tab>
        </TabsList>
        <TabsPanel value="subscribers">
          <DataTable state={state} result={list} columns={columns} rowKey={(s) => s.id} label={t('subscribers')} testId="subscriptions-table"
            filters={[{ key: 'status', label: t('status'), options: (['trialing', 'active', 'past_due', 'suspended', 'cancelled'] as const).map((x) => ({ value: x, label: t(`status_${x}`) })) }]}
            rowActions={(s) => canManage ? (
              <div className="flex justify-end gap-1">
                {s.status === 'trialing' && <Button size="sm" variant="outline" onClick={() => act.mutate({ subscriptionId: s.id, action: 'extend_trial' })}>{t('extendTrial')}</Button>}
                {(s.status === 'past_due' || s.status === 'suspended' || s.status === 'cancelled') && <Button size="sm" variant="outline" onClick={() => act.mutate({ subscriptionId: s.id, action: 'reactivate' })} data-action="reactivate">{t('reactivate')}</Button>}
                {s.status !== 'suspended' && s.status !== 'cancelled' && <Button size="sm" variant="ghost" onClick={() => act.mutate({ subscriptionId: s.id, action: 'suspend' })} data-action="suspend">{t('suspend')}</Button>}
              </div>
            ) : null}
            empty={<EmptyState icon={<BadgeCheck aria-hidden />} title={t('noSubscribers')} />} />
        </TabsPanel>
        <TabsPanel value="plans">
          <div className="flex flex-col gap-4">
            {canManage && <Button className="self-end" onClick={() => setEdit('new')} data-testid="new-plan"><Plus aria-hidden />{t('newPlan')}</Button>}
            {!plans.data ? <Skeleton className="h-64 w-full" /> : (
              <div className="grid gap-4 md:grid-cols-3">
                {plans.data.map((p) => (
                  <div key={p.id} className="flex flex-col gap-2">
                    <PlanCard plan={p} current={null} pending={false} />
                    <div className="flex items-center justify-between gap-2 px-1 text-sm">
                      {!p.active ? <Badge tone="neutral">{t('inactive')}</Badge> : <span className="text-fg-muted">{t('subscribersCount', { n: rows.filter((r) => r.planId === p.id && r.status !== 'cancelled').length })}</span>}
                      {canManage && <Button size="sm" variant="outline" onClick={() => setEdit(p)} data-action="edit-plan"><PencilLine aria-hidden />{t('edit')}</Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsPanel>
        <TabsPanel value="billing">
          <DataTable state={invState} result={invoices} rowKey={(i) => i.id} label={t('billingLog')} testId="sub-invoices-table"
            columns={[
              { key: 'number', header: t('invoice'), cell: (i) => <div><p className="font-mono text-sm" dir="ltr">{i.number}</p><p className="text-xs text-fg-muted">{i.orgName}</p></div> },
              { key: 'kind', header: t('kind'), cell: (i) => <span className="text-sm">{t(`kind_${i.kind}`)}</span> },
              { key: 'issuedAt', header: t('date'), sortKey: 'issuedAt', cell: (i) => <span className="tabular text-sm">{date(i.issuedAt)}</span> },
              { key: 'total', header: t('amount'), sortKey: 'total', numeric: true, cell: (i) => <span className="tabular font-medium">{money(i.totalMinor)}</span> },
              { key: 'status', header: t('status'), cell: (i) => <Badge tone={i.status === 'paid' ? 'success' : 'danger'}>{t(`inv_${i.status}`)}</Badge> },
            ]}
            filters={[{ key: 'status', label: t('status'), options: [{ value: 'paid', label: t('inv_paid') }, { value: 'failed', label: t('inv_failed') }] }]}
            empty={<EmptyState icon={<Receipt aria-hidden />} title={t('noInvoices')} />} />
        </TabsPanel>
      </Tabs>
      {edit && <PlanDialog plan={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
