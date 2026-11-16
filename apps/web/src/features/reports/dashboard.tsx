'use client';

import { useQuery } from '@tanstack/react-query';
import type { Dashboard, Kpi } from '@travelta/schemas';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { BarList, ColumnChart } from '@/components/data/charts';
import { ErrorState } from '@/components/feedback/states';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDemoToday } from '@/features/demo/hooks';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { addDays } from '@travelta/shared';
import { useReportFormat } from './shared';

const RANGES = [7, 30, 90, 365] as const;

function KpiTile({ k, fmt }: { k: Kpi; fmt: ReturnType<typeof useReportFormat> }) {
  const t = useTranslations('reports');
  const value = k.kind === 'money' ? fmt.compact(k.value) : k.kind === 'percent' ? fmt.percent(k.value) : fmt.number(k.value);
  const up = (k.deltaPct ?? 0) >= 0;
  return (
    <Card className="flex flex-col gap-2 p-5" data-testid="kpi" data-kpi={k.key}>
      <span className="text-sm font-medium text-fg-muted">{t(`kpi_${k.key}` as never)}</span>
      <span title={k.kind === 'money' ? fmt.money(k.value) : undefined} className={cn('tabular truncate text-xl font-bold', k.tone === 'critical' ? 'text-danger' : k.tone === 'warning' ? 'text-warning' : 'text-fg')}>{value}</span>
      {k.deltaPct !== null && (
        <span className={cn('flex items-center gap-1 text-xs font-medium', up ? 'text-success' : 'text-danger')}>
          {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}{t('vsPrevious', { pct: fmt.percent(Math.abs(k.deltaPct)) })}
        </span>
      )}
    </Card>
  );
}

/** Portal dashboard (W11): KPIs with period comparison, 6-month trend, service mix, top parties and what needs attention. */
export function BusinessDashboard() {
  const t = useTranslations('reports');
  const te = useTranslations('enums');
  const api = useApi();
  const today = useDemoToday();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const range = { from: addDays(today, -(days - 1)), to: today };
  const q = useQuery({ queryKey: ['reports', 'dashboard', range.from, range.to], queryFn: () => api.call('reports.dashboard', range) });
  const fmt = useReportFormat(q.data?.currency ?? 'EGP');
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96 w-full" />;
  const d = q.data;
  const base = d.audience === 'platform' ? '/admin' : d.audience === 'supplier' ? '/supplier' : '/agency';
  return (
    <section className="flex flex-col gap-4" data-testid="dashboard" aria-label={t('dashboard')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('performance')}</h2>
        <div className="flex items-center gap-2">
          <Select aria-label={t('period')} className="w-40" value={days} onChange={(e) => setDays(Number(e.target.value) as typeof days)} data-testid="dashboard-range">
            {RANGES.map((r) => <option key={r} value={r}>{t('lastDays', { n: r })}</option>)}
          </Select>
          <Link href={`${base}/reports`} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"><BarChart3 className="size-4" aria-hidden />{t('allReports')}</Link>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{d.kpis.map((k) => <KpiTile key={k.key} k={k} fmt={fmt} />)}</div>
      {d.attention.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="attention">
          {d.attention.map((a) => (
            <Link key={a.key} href={a.link} className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-bg px-3 py-1 text-sm font-medium text-warning hover:underline">
              <AlertTriangle className="size-3.5" aria-hidden />{t(`attn_${a.key}` as "attn_kycQueue", { n: a.count })}
            </Link>
          ))}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={t(`trend_${d.trend.key}` as never)} description={t('lastSixMonths')} />
          <CardBody><ColumnChart points={d.trend.points} format={d.trend.kind === 'money' ? fmt.money : fmt.number} axisLabel={fmt.month} testId="trend-chart" /></CardBody>
        </Card>
        <Card>
          <CardHeader title={t('byService')} description={t('inPeriod')} />
          <CardBody>
            <BarList rows={[...d.byService.points].sort((a, b) => b.value - a.value).map((p) => ({ key: p.label, label: te(`serviceType.${p.label}` as never), value: p.value }))}
              format={d.byService.kind === 'money' ? fmt.money : fmt.number} empty={t('noData')} />
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title={t(`top_${d.top.key}` as never)} description={t('inPeriod')} />
        <CardBody><BarList rows={d.top.rows.map((r) => ({ key: r.id, label: r.name, value: r.value, hint: t('countHint', { n: r.count }) }))} format={fmt.money} empty={t('noData')} /></CardBody>
      </Card>
      {d.profitBreakdown && <ProfitBreakdownCard b={d.profitBreakdown} fmt={fmt} />}
    </section>
  );
}

/** How the profit KPI is calculated, straight from the ledger lines of the period (revenue − cost of sales − operating expenses). */
function ProfitBreakdownCard({ b, fmt }: { b: NonNullable<Dashboard['profitBreakdown']>; fmt: ReturnType<typeof useReportFormat> }) {
  const t = useTranslations('reports');
  const locale = useLocale() as 'en' | 'ar';
  const line = (label: string, minor: number, opts: { strong?: boolean; indent?: boolean; testId?: string } = {}) => (
    <div className={cn('flex justify-between gap-4 py-1.5 text-sm', opts.strong && 'border-t border-border pt-2 font-semibold', opts.indent && 'ps-4 text-fg-muted')} data-testid={opts.testId}>
      <span>{label}</span><span className={cn('tabular', minor < 0 && opts.strong && 'text-danger')}>{fmt.money(minor)}</span>
    </div>
  );
  return (
    <Card data-testid="profit-breakdown">
      <CardHeader title={t('profitBreakdownTitle')} description={t('profitBreakdownHelp', { n: b.journalEntries })} />
      <CardBody className="grid gap-6 md:grid-cols-2">
        <div>
          {line(t('pbRevenue'), b.revenueMinor, { testId: 'pb-revenue' })}
          {b.revenueByAccount.map((r) => <div key={r.name.en}>{line(r.name[locale], r.amountMinor, { indent: true })}</div>)}
          {line(t('pbCostOfSales'), -b.costOfSalesMinor)}
          {line(t('pbGrossProfit'), b.grossProfitMinor, { strong: true, testId: 'pb-gross' })}
          {line(t('pbOperatingExpenses'), -b.operatingExpensesMinor)}
          {b.expensesByAccount.map((r) => <div key={r.name.en}>{line(r.name[locale], -r.amountMinor, { indent: true })}</div>)}
          {line(t('pbNetProfit'), b.netProfitMinor, { strong: true, testId: 'pb-net' })}
        </div>
        <div className="flex flex-col gap-2 rounded-lg bg-subtle/60 p-4 text-sm">
          <p className="font-semibold text-fg">{t('pbCashTitle')}</p>
          <p className="tabular text-lg font-bold" data-testid="pb-cash">{fmt.money(b.cashChangeMinor)}</p>
          <p className="text-fg-muted">{t('pbCashHelp')}</p>
        </div>
      </CardBody>
    </Card>
  );
}
