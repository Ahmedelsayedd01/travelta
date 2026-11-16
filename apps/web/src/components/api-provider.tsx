'use client';

import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { ApiClient } from '@travelta/api-client';
import { getMockApi, onReseed } from '@/lib/api';
import { createQueryClient } from '@/lib/query';
import { Skeleton } from '@/components/ui/skeleton';

const ApiContext = createContext<ApiClient | null>(null);

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <MockApiGate>');
  return api;
}

const CHANNEL = 'travelta-db';

/** Keeps every open tab in sync and invalidates queries whenever the simulated backend changes. Mount once. */
export function SyncBridge() {
  const queryClient = useQueryClient();
  const t = useTranslations('demo');
  useEffect(() => {
    const mock = getMockApi();
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
    let applyingRemote = false;
    const unsubscribe = mock.subscribe((event) => {
      void queryClient.invalidateQueries();
      // Tell other tabs after our write is persisted (flush), unless this change came from them.
      if (!applyingRemote && event.type !== 'clock.changed' && 'operation' in event && event.operation !== 'boot') {
        void mock.flush().then(() => channel?.postMessage({ type: 'changed' }));
      }
    });
    if (channel) {
      channel.onmessage = async () => {
        applyingRemote = true;
        try {
          await mock.reload();
          toast.info(t('syncedFromTab'));
        } finally {
          applyingRemote = false;
        }
      };
    }
    const flush = () => void mock.flush();
    window.addEventListener('pagehide', flush);
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVisibility);
    const offReseed = onReseed(() => toast.warning(t('reseeded')));
    return () => {
      unsubscribe();
      channel?.close();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      offReseed();
    };
  }, [queryClient, t]);
  return null;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const subscribeNoop = () => () => undefined;

/**
 * Renders children once the browser-side backend has loaded (or seeded) its data.
 * Wrap every screen that reads business data with it.
 */
export function MockApiGate({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [ready, setReady] = useState(false);
  const t = useTranslations('demo');

  useEffect(() => {
    if (!isClient) return;
    let active = true;
    void getMockApi().ready().then(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [isClient]);

  if (!isClient || !ready) {
    return (
      fallback ?? (
        <div className="flex flex-col gap-3 p-6" role="status" aria-live="polite">
          <span className="sr-only">{t('booting')}</span>
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      )
    );
  }
  return (
    <ApiContext.Provider value={getMockApi().api}>{children}</ApiContext.Provider>
  );
}
