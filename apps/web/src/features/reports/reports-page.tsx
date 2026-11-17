'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReportKey } from '@travelta/schemas';
import { Download, FileBarChart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-picker';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useDemoToday } from '@/features/demo/hooks';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { addDays } from '@travelta/shared';
import { toCsv, useReportFormat } from './shared';

/** Reports (W11, ACC-3): pick a report, set the period, read the table, export CSV. Money comes from posted entries. */
export function ReportsPage() {
  const t = useTranslations('reports');
  const te = useTranslations('enums');
  const api = useApi();
  const router = useRouter();
  const today = useDemoToday();
  const [report, setReport] = useState<ReportKey | null>(null);
  const [from, setFrom] = useState(addDays(today, -89));
  const [to, setTo] = useState(today);
  const available = useQuery({ queryKey: ['reports', 'available'], queryFn: () => api.call('reports.available', undefined) });
  const current = report ?? available.data?.[0] ?? null;
  const run = useQuery({ queryKey: ['reports', 'run', current, from, to], queryFn: () => api.call('reports.run', { report: current!, from, to }), enabled: current !== null });
  const fmt = useReportFormat(run.data?.currency ?? 'EGP');
  const cell = (type: string, v: string | number | null, key: string) => {
    if (v === null || v === '') return '—';
    if (type === 'money') return fmt.money(v as number);
    if (type === 'percent') return fmt.percent(v as number);
    if (type === 'number') return fmt.number(v as number);
    if (type === 'date') return fmt.date(String(v));
    if (key === 'service') return te(`serviceType.${v}` as never);
    if ((key === 'kind' || key === 'source') && t.has(`src_${v}` as never)) return t(`src_${v}` as never);
    if (key === 'status') return t.has(`status_${v}` as never) ? t(`status_${v}` as never) : String(v);
    return String(v);
  };
  const download = () => {
    if (!run.data) return;
    const cols = run.data.columns.map((c) => c.key);
    const csv = toCsv(cols, cols.map((c) => t(`col_${c}` as never)), run.data.rows, new Set(run.data.columns.filter((c) => c.type === 'money').map((c) => c.key)));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `travelta-${run.data.key}-${from}-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} actions={run.data && run.data.rows.length > 0 && <Button variant="outline" onClick={download} data-testid="export-csv"><Download aria-hidden />{t('exportCsv')}</Button>} />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label={t('title')} className="flex flex-row flex-wrap gap-1 lg:flex-col" data-testid="report-list">
          {!available.data ? <Skeleton className="h-64 w-full" /> : available.data.map((k) => (
            <button key={k} type="button" onClick={() => setReport(k)} aria-current={current === k ? 'page' : undefined} data-report={k}
              className={cn('rounded-md px-3 py-2 text-start text-sm', current === k ? 'bg-primary-soft font-semibold text-on-primary-soft' : 'text-fg-muted hover:bg-subtle hover:text-fg')}>
              <span className="block">{t(`report_${k}` as never)}</span>
              <span className="block text-xs font-normal">{t(`reportHint_${k}` as never)}</span>
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-4">
          {run.data?.from !== null && (
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('from')}><DateInput name="from" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label={t('to')}><DateInput name="to" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
          )}
          {run.isError ? <ErrorState onRetry={() => void run.refetch()} /> : !run.data ? <Skeleton className="h-96 w-full" /> : run.data.rows.length === 0 ? (
            <EmptyState icon={<FileBarChart aria-hidden />} title={t('noData')} body={t('noDataBody')} />
          ) : (
            <Card><CardBody className="overflow-x-auto p-0" tabIndex={0} role="region" aria-label={t('tableScrollRegion')}>
              <table className="w-full min-w-[40rem] text-sm" data-testid="report-table" data-report={run.data.key}>
                <thead><tr className="border-b border-border text-xs text-fg-muted uppercase">{run.data.columns.map((c) => <th key={c.key} scope="col" className={cn('px-4 py-2.5 font-medium', c.type === 'text' || c.type === 'date' ? 'text-start' : 'text-end')}>{t(`col_${c.key}` as never)}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">
                  {run.data.rows.map((r, i) => (
                    <tr key={i} onClick={() => run.data!.links[i] && router.push(run.data!.links[i]!)} className={run.data!.links[i] ? 'cursor-pointer hover:bg-subtle' : undefined}>
                      {run.data!.columns.map((c) => <td key={c.key} className={cn('px-4 py-2', c.type === 'text' || c.type === 'date' ? 'text-start' : 'tabular text-end', c.key === 'ref' && 'font-mono text-xs')} dir={c.key === 'ref' ? 'ltr' : undefined}>{cell(c.type, r[c.key] ?? null, c.key)}</td>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-border font-semibold">
                  {run.data.columns.map((c, i) => <td key={c.key} className={cn('px-4 py-2.5', c.type === 'text' || c.type === 'date' ? 'text-start' : 'tabular text-end')}>{i === 0 ? t('totals') : run.data!.totals[c.key] !== undefined ? cell(c.type, run.data!.totals[c.key]!, c.key) : ''}</td>)}
                </tr></tfoot>
              </table>
            </CardBody></Card>
          )}
        </div>
      </div>
    </>
  );
}
