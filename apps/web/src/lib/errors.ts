'use client';

import { ApiClientError } from '@travelta/api-client';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/** Translate any thrown value into a user-facing message (errors.<CODE> from @travelta/i18n). */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations('errors');
  const all = useTranslations();
  return useCallback((error: unknown) => {
    if (!(error instanceof ApiClientError)) return t('INTERNAL');
    // Business errors may carry a specific, translatable reason (plan module/limit, suspended subscription).
    const specific = error.details?.find((d) => d.issue.startsWith('errors.') && all.has(d.issue as never));
    return specific ? all(specific.issue as never, specific.params as never) : t(error.code);
  }, [t, all]);
}

/** Every translatable reason of a failed request (validation keys with their params), for inline display in dialogs. */
export function useErrorDetails(): (error: unknown) => string[] {
  const all = useTranslations();
  const message = useErrorMessage();
  return useCallback((error: unknown) => {
    if (!(error instanceof ApiClientError)) return error ? [message(error)] : [];
    const lines = (error.details ?? []).filter((d) => all.has(d.issue as never)).map((d) => all(d.issue as never, d.params as never));
    return lines.length ? lines : [message(error)];
  }, [all, message]);
}
