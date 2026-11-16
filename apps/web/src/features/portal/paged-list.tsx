'use client';

import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ErrorState, EmptyState } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

/** Minimal search + pagination frame for server-paged lists (the full DataTable kit arrives in Milestone 6). */
export function PagedList<T>({
  query, search, onSearch, page, onPage, render, label,
}: {
  query: { data?: { items: T[]; page: number; pageSize: number; total: number }; isLoading: boolean; isError: boolean; refetch: () => unknown };
  search: string;
  onSearch: (q: string) => void;
  page: number;
  onPage: (p: number) => void;
  render: (items: T[]) => ReactNode;
  label: string;
}) {
  const t = useTranslations('common');
  const data = query.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  return (
    <div className="flex flex-col gap-3">
      <label className="relative max-w-sm">
        <span className="sr-only">{t('search')}</span>
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <Input type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={t('search')} className="ps-9" aria-label={`${t('search')} — ${label}`} />
      </label>
      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title={search ? t('noResults') : undefined} />
      ) : (
        <>
          {render(data.items)}
          <div className="flex items-center justify-between gap-3 text-sm text-fg-muted">
            <span className="tabular">{t('showingRange', { from, to, total: data.total })}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('previous')}>
                <ChevronLeft className="flip-rtl" aria-hidden />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('next')}>
                <ChevronRight className="flip-rtl" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
