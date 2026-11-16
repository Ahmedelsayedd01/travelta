'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { NotificationEntity, OutboxMessageEntity } from '@travelta/schemas';
import { Bell, CheckCheck, Mail, MessageCircle } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { useDemoNow } from '@/features/demo/hooks';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { useAction } from '@/lib/mutations';
import { NOTIFICATION_TOPICS } from '@travelta/schemas';

/** All notifications of the signed-in user in this organization. */
export function NotificationsPage() {
  const t = useTranslations('notifications');
  const locale = useLocale() as 'en' | 'ar';
  const format = useFormatter();
  const now = useDemoNow();
  const api = useApi();
  const router = useRouter();
  const state = useListState({ pageSize: 15, sort: 'at:desc' });
  const result = useQuery({ queryKey: ['notifications', 'page', state.query], queryFn: () => api.call('notifications.list', state.query), placeholderData: keepPreviousData });
  const markAll = useAction(() => api.call('notifications.markRead', { all: true }), { success: t('allRead'), invalidate: [['notifications']] });
  const markOne = useAction((id: string) => api.call('notifications.markRead', { ids: [id] }), { invalidate: [['notifications']] });
  const columns: Column<NotificationEntity>[] = [
    { key: 'title', header: t('notification'), cell: (n) => (
      <div className="flex gap-2.5">
        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt === null ? 'bg-primary' : 'bg-transparent')} aria-hidden />
        <div className="min-w-0"><p className={cn('text-sm', n.readAt === null ? 'font-semibold' : 'font-medium')}>{n.title[locale]}</p><p className="text-xs text-fg-muted">{n.body[locale]}</p></div>
      </div>
    ) },
    { key: 'topic', header: t('type'), hideOnCard: true, cell: (n) => <Badge tone={n.severity === 'danger' ? 'danger' : n.severity === 'warning' ? 'warning' : n.severity === 'success' ? 'success' : 'info'}>{t(`topic_${n.topic.replace('.', '_')}` as never)}</Badge> },
    { key: 'at', header: t('when'), sortKey: 'at', cell: (n) => <span className="whitespace-nowrap text-sm text-fg-muted">{format.relativeTime(new Date(n.at), now)}</span> },
  ];
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} actions={(result.data?.unread ?? 0) > 0 && <Button variant="outline" onClick={() => markAll.mutate()}><CheckCheck aria-hidden />{t('markAll')}</Button>} />
      <DataTable state={state} result={result} columns={columns} rowKey={(n) => n.id} label={t('title')} testId="notifications-table"
        onRowClick={(n) => { if (n.readAt === null) markOne.mutate(n.id); if (n.link) router.push(n.link); }}
        filters={[{ key: 'unread', label: t('status'), options: [{ value: 'true', label: t('unread') }, { value: 'false', label: t('read') }] }]}
        empty={<EmptyState icon={<Bell aria-hidden />} title={t('empty')} />} />
    </>
  );
}

/** Simulated email / WhatsApp outbox (M19): every message rendered in both languages, previewed as sent. */
export function OutboxPage() {
  const t = useTranslations('notifications');
  const format = useFormatter();
  const now = useDemoNow();
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const state = useListState({ pageSize: 15, sort: 'at:desc' });
  const result = useQuery({ queryKey: ['outbox', state.query], queryFn: () => api.call('outbox.list', state.query), placeholderData: keepPreviousData });
  const [preview, setPreview] = useState<OutboxMessageEntity | null>(null);
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const columns: Column<OutboxMessageEntity>[] = [
    { key: 'channel', header: t('channel'), cell: (m) => <Badge tone={m.channel === 'whatsapp' ? 'success' : 'info'}>{m.channel === 'whatsapp' ? <MessageCircle className="size-3" aria-hidden /> : <Mail className="size-3" aria-hidden />}{t(`ch_${m.channel}`)}</Badge> },
    { key: 'to', header: t('to'), cell: (m) => <div><p className="text-sm font-medium">{m.toName}</p><p className="text-xs text-fg-muted" dir="ltr">{m.toAddress}</p></div> },
    { key: 'subject', header: t('subject'), cell: (m) => <span className="text-sm">{m.subject[locale]}</span> },
    { key: 'at', header: t('when'), sortKey: 'at', cell: (m) => <span className="whitespace-nowrap text-sm text-fg-muted">{format.relativeTime(new Date(m.at), now)}</span> },
  ];
  return (
    <>
      <PageHeader title={t('outboxTitle')} description={t('outboxDescription')} />
      <DataTable state={state} result={result} columns={columns} rowKey={(m) => m.id} label={t('outboxTitle')} testId="outbox-table" onRowClick={(m) => { setPreview(m); setLang(m.locale); }}
        filters={[
          { key: 'channel', label: t('channel'), options: [{ value: 'email', label: t('ch_email') }, { value: 'whatsapp', label: t('ch_whatsapp') }] },
          { key: 'topic', label: t('type'), options: NOTIFICATION_TOPICS.map((x) => ({ value: x, label: t(`topic_${x.replace('.', '_')}` as never) })) },
        ]}
        empty={<EmptyState icon={<Mail aria-hidden />} title={t('outboxEmpty')} body={t('outboxEmptyBody')} />} />
      {preview && (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)} title={t('preview')} description={`${preview.toName} · ${preview.toAddress}`} size="md">
          <div className="flex gap-1 self-start rounded-lg bg-subtle p-1" role="tablist">
            {(['en', 'ar'] as const).map((l) => <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)} className={cn('rounded-md px-3 py-1 text-sm font-medium', lang === l ? 'bg-surface shadow-xs' : 'text-fg-muted')} data-lang={l}>{l === 'en' ? 'English' : 'العربية'}</button>)}
          </div>
          <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} data-testid="message-preview">
            {preview.channel === 'email' ? (
              <article className="overflow-hidden rounded-lg border border-border">
                <header className="border-b border-border bg-subtle px-4 py-2 text-sm"><p className="text-fg-muted">{t('subject')}</p><p className="font-semibold">{preview.subject[lang]}</p></header>
                <p className="px-4 py-4 text-sm leading-relaxed whitespace-pre-line">{preview.body[lang]}</p>
                <footer className="border-t border-border px-4 py-2 text-xs text-fg-subtle">{t('simulated')}</footer>
              </article>
            ) : (
              <div className="rounded-lg bg-subtle p-4">
                <div className="ms-auto max-w-[85%] rounded-lg rounded-se-none bg-success-bg px-3 py-2 text-sm text-fg shadow-xs">
                  <p className="font-semibold">{preview.subject[lang]}</p><p className="mt-1 whitespace-pre-line">{preview.body[lang]}</p>
                </div>
                <p className="mt-2 text-center text-xs text-fg-muted">{t('simulated')}</p>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
