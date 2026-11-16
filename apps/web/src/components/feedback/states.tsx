'use client';

import { CircleAlert, Inbox } from 'lucide-react';
import { ApiClientError } from '@travelta/api-client';
import { useTranslations } from 'next-intl';
import { useErrorMessage } from '@/lib/errors';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function EmptyState({ title, body, icon, action }: { title?: ReactNode; body?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  const t = useTranslations('common');
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft [&_svg]:size-6">{icon ?? <Inbox aria-hidden />}</span>
      <div>
        <p className="font-semibold text-fg">{title ?? t('emptyTitle')}</p>
        <p className="mt-1 max-w-sm text-sm text-fg-muted">{body ?? t('emptyBody')}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ title, body, onRetry }: { title?: ReactNode; body?: ReactNode; onRetry?: () => void }) {
  const t = useTranslations('common');
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-lg border border-danger/30 bg-danger-bg/40 px-6 py-12 text-center">
      <CircleAlert className="size-8 text-danger" aria-hidden />
      <div>
        <p className="font-semibold text-fg">{title ?? t('errorTitle')}</p>
        <p className="mt-1 max-w-sm text-sm text-fg-muted">{body ?? t('errorBody')}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

/**
 * Error state for a failed query: "not found" (which is also what another tenant's record looks like — the server
 * never confirms it exists) gets a definitive message without a retry; anything else shows the reason and a retry.
 */
export function QueryErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTranslations('common');
  const message = useErrorMessage();
  if (error instanceof ApiClientError && error.code === 'NOT_FOUND') {
    return <ErrorState title={t('notFoundTitle')} body={t('notFoundBody')} />;
  }
  return <ErrorState body={message(error)} onRetry={onRetry} />;
}
