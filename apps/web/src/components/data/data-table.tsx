'use client';

import type { ListQuery, Page } from '@travelta/contracts';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EmptyState, QueryErrorState } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Server sort key; omit for unsortable columns. */
  sortKey?: string;
  numeric?: boolean;
  /** Hide on small screens' card layout (still visible in the table). */
  hideOnCard?: boolean;
  className?: string;
}

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/** List state shared by every server-paged table: search (debounced), filters, sort, page. */
export function useListState(defaults: { pageSize?: number; sort?: ListQuery['sort'] } = {}) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<ListQuery['sort']>(defaults.sort);
  const [page, setPage] = useState(1);
  const pageSize = defaults.pageSize ?? 10;

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(handle);
  }, [q]);

  const query: ListQuery = useMemo(
    () => ({ q: debouncedQ || undefined, page, pageSize, sort, filters: Object.keys(filters).length ? filters : undefined }),
    [debouncedQ, page, pageSize, sort, filters],
  );
  return {
    query,
    q,
    setQ: (v: string) => { setQ(v); setPage(1); },
    filters,
    setFilter: (key: string, value: string) => {
      setFilters((f) => { const next = { ...f }; if (value) next[key] = value; else delete next[key]; return next; });
      setPage(1);
    },
    sort,
    toggleSort: (key: string) => setSort((s) => (s === `${key}:asc` ? `${key}:desc` : `${key}:asc`)),
    page,
    setPage,
  };
}

export type ListState = ReturnType<typeof useListState>;

interface DataTableProps<T> {
  state: ListState;
  result: { data?: Page<T>; isLoading: boolean; isError: boolean; isFetching?: boolean; error?: unknown; refetch: () => unknown };
  columns: Column<T>[];
  rowKey: (row: T) => string;
  filters?: FilterDef[];
  toolbar?: ReactNode;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  empty?: ReactNode;
  label: string;
  testId?: string;
}

/**
 * Server-paged data table (FRONTEND_ARCHITECTURE §2 `components/data`). Desktop: sticky-header table with
 * sortable columns. Phones: stacked cards. Always: skeleton → error (retry) → empty → data.
 */
export function DataTable<T>({ state, result, columns, rowKey, filters, toolbar, onRowClick, rowActions, empty, label, testId }: DataTableProps<T>) {
  const t = useTranslations('common');
  const data = result.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const hasFilters = Boolean(state.q) || Object.keys(state.filters).length > 0;

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <span className="sr-only">{t('search')}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input type="search" value={state.q} onChange={(e) => state.setQ(e.target.value)} placeholder={t('search')} className="ps-9" aria-label={`${t('search')} — ${label}`} />
        </label>
        {filters?.map((f) => (
          <label key={f.key} className="min-w-36">
            <span className="sr-only">{f.label}</span>
            <Select value={state.filters[f.key] ?? ''} onChange={(e) => state.setFilter(f.key, e.target.value)} aria-label={f.label} data-filter={f.key}>
              <option value="">{f.label}: {t('all')}</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </label>
        ))}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { state.setQ(''); for (const k of Object.keys(state.filters)) state.setFilter(k, ''); }}>
            {t('clearFilters')}
          </Button>
        )}
        {toolbar && <div className="ms-auto flex flex-wrap gap-2">{toolbar}</div>}
      </div>

      {result.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
      ) : result.isError ? (
        <QueryErrorState error={result.error} onRetry={() => void result.refetch()} />
      ) : !data || data.items.length === 0 ? (
        hasFilters ? <EmptyState title={t('noResults')} /> : (empty ?? <EmptyState />)
      ) : (
        <>
          {/* Desktop table */}
          <div className={cn('hidden overflow-x-auto rounded-lg border border-border bg-surface md:block', result.isFetching && 'opacity-70')} tabIndex={0} role="region" aria-label={typeof label === 'string' ? label : undefined}>
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-subtle">
                <tr>
                  {columns.map((c) => {
                    const active = state.sort?.startsWith(`${c.sortKey}:`);
                    const dir = active ? state.sort?.split(':')[1] : undefined;
                    return (
                      <th key={c.key} scope="col" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                        className={cn('px-4 py-2.5 text-xs font-semibold tracking-wide text-fg-muted uppercase', c.numeric ? 'text-end' : 'text-start', c.className)}>
                        {c.sortKey ? (
                          <button type="button" onClick={() => state.toggleSort(c.sortKey!)} className="inline-flex items-center gap-1 uppercase hover:text-fg">
                            {c.header}
                            {active && (dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
                          </button>
                        ) : c.header}
                      </th>
                    );
                  })}
                  {rowActions && <th scope="col" className="w-px px-4 py-2.5"><span className="sr-only">{t('actions')}</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((row) => (
                  <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn('h-12 transition-colors hover:bg-subtle/60', onRowClick && 'cursor-pointer')}>
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-2.5 text-fg', c.numeric && 'tabular text-end', c.className)}>{c.cell(row)}</td>
                    ))}
                    {rowActions && <td className="px-4 py-2 text-end whitespace-nowrap" onClick={(e) => e.stopPropagation()}>{rowActions(row)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phone cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {data.items.map((row) => (
              <li key={rowKey(row)} className="rounded-lg border border-border bg-surface p-4" onClick={onRowClick ? () => onRowClick(row) : undefined}>
                <dl className="flex flex-col gap-1.5">
                  {columns.filter((c) => !c.hideOnCard).map((c) => (
                    <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                      <dt className="text-fg-muted">{c.header}</dt>
                      <dd className={cn('text-end text-fg', c.numeric && 'tabular')}>{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
                {rowActions && <div className="mt-3 flex flex-wrap justify-end gap-2" onClick={(e) => e.stopPropagation()}>{rowActions(row)}</div>}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 text-sm text-fg-muted">
            <span className="tabular">{t('showingRange', { from, to, total: data.total })}</span>
            <div className="flex items-center gap-1">
              <span className="tabular me-2">{t('pagination', { page: data.page, pages })}</span>
              <Button variant="outline" size="sm" disabled={state.page <= 1} onClick={() => state.setPage(state.page - 1)} aria-label={t('previous')}>
                <ChevronLeft className="flip-rtl" aria-hidden />
              </Button>
              <Button variant="outline" size="sm" disabled={state.page >= pages} onClick={() => state.setPage(state.page + 1)} aria-label={t('next')}>
                <ChevronRight className="flip-rtl" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
