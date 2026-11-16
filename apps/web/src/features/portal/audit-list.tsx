'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { useSession } from '@/lib/session';
import { PagedList } from './paged-list';

/** Audit trail (audit.list): own tenant for agencies/suppliers, every tenant for the platform. */
export function AuditList() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const format = useFormatter();
  const api = useApi();
  const platform = useSession((s) => s.session?.organization.type === 'platform');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['audit', { q, page }],
    queryFn: () => api.call('audit.list', { q: q || undefined, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
  return (
    <PagedList
      label={t('nav.auditLog')}
      query={query}
      search={q}
      onSearch={(v) => { setQ(v); setPage(1); }}
      page={page}
      onPage={setPage}
      render={(items) => (
        <Table data-testid="audit-table">
          <THead>
            <tr>
              <Th>{t('auth.auditWhen')}</Th>
              {platform && <Th>{t('auth.organization')}</Th>}
              <Th>{t('auth.auditActor')}</Th>
              <Th>{t('auth.auditAction')}</Th>
            </tr>
          </THead>
          <TBody>
            {items.map((a) => (
              <Tr key={a.id}>
                <Td className="tabular text-fg-muted">{format.dateTime(new Date(a.at), { dateStyle: 'medium', timeStyle: 'short' })}</Td>
                {platform && <Td>{a.tenantName[locale]}</Td>}
                <Td>{a.actorName ?? '—'}</Td>
                <Td><code dir="ltr" className="text-xs">{a.action}</code></Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    />
  );
}
