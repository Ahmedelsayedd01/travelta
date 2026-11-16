import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showAlert } from '@/lib/alert';
import { ApiClientError } from '@travelta/api-client';
import { useTranslation } from 'react-i18next';

/** Business action with a success alert, cache refresh and translated error alert (mobile counterpart of the web useAction). */
export function useAction<I, O>(fn: (input: I) => Promise<O>, opts: { success?: string; onSuccess?: (out: O) => void; silentFieldErrors?: boolean } = {}) {
  const qc = useQueryClient();
  const { t, i18n } = useTranslation();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (out) => {
      await qc.invalidateQueries();
      if (opts.success) showAlert(opts.success);
      opts.onSuccess?.(out);
    },
    onError: (e) => {
      if (opts.silentFieldErrors && e instanceof ApiClientError && Object.keys(e.fieldErrors()).length) return;
      const detail = e instanceof ApiClientError ? e.details?.find((d) => i18n.exists(d.issue)) : undefined;
      showAlert(detail ? t(detail.issue, detail.params ?? {}) : e instanceof ApiClientError ? t(`errors.${e.code}`) : t('errors.INTERNAL'));
    },
  });
}
