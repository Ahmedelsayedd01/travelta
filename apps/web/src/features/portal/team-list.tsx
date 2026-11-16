'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { Badge } from '@/components/ui/badge';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { PagedList } from './paged-list';

/** Members of the active organization (team.members — tenant-scoped server-side). Management actions arrive in Milestone 5. */
export function TeamList({ pageSize = 10 }: { pageSize?: number }) {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const format = useFormatter();
  const api = useApi();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['team', 'members', { q, page, pageSize }],
    queryFn: () => api.call('team.members', { q: q || undefined, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  return (
    <PagedList
      label={t('auth.team')}
      query={query}
      search={q}
      onSearch={(v) => { setQ(v); setPage(1); }}
      page={page}
      onPage={setPage}
      render={(items) => (
        <Table data-testid="team-table">
          <THead>
            <tr>
              <Th>{t('auth.name')}</Th>
              <Th>{t('auth.email')}</Th>
              <Th>{t('auth.role')}</Th>
              <Th>{t('auth.lastLogin')}</Th>
            </tr>
          </THead>
          <TBody>
            {items.map((m) => (
              <Tr key={m.userId}>
                <Td className="font-medium">{m.name}</Td>
                <Td dir="ltr" className="text-start text-fg-muted">{m.email}</Td>
                <Td><Badge tone={m.role.isSystem ? 'primary' : 'accent'}>{m.role.name[locale]}</Badge></Td>
                <Td className="text-fg-muted">{m.lastLoginAt ? format.dateTime(new Date(m.lastLoginAt), { dateStyle: 'medium', timeStyle: 'short' }) : t('auth.never')}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    />
  );
}
