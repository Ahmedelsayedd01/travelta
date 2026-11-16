'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { OperationInput } from '@travelta/api-client';
import { useApi } from '@/components/api-provider';

export const demoKeys = { status: ['demo', 'status'] as const };

export function useDemoStatus(enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: demoKeys.status, queryFn: () => api.call('demo.status'), enabled });
}

/** "Today" on the demo clock (business dates follow it, not the browser's clock). */
export function useDemoToday(): string {
  const status = useDemoStatus();
  return (status.data?.now ?? new Date().toISOString()).slice(0, 10);
}

/** "Now" on the demo clock, for relative times ("2 hours ago") that stay consistent with moved clocks. */
export function useDemoNow(): Date {
  const status = useDemoStatus();
  const [mounted] = useState(() => Date.now());
  return new Date(status.data?.now ?? mounted);
}

/** Demo mutations refresh everything: they change the whole dataset or the clock. */
function useDemoMutation<T>(fn: (input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}

export function useResetDemo() {
  const api = useApi();
  return useDemoMutation(() => api.call('demo.reset'));
}

export function useImportDemo() {
  const api = useApi();
  return useDemoMutation((snapshot: OperationInput<'demo.import'>) => api.call('demo.import', snapshot));
}

export function useSetClock() {
  const api = useApi();
  return useDemoMutation((offsetDays: number) => api.call('demo.setClock', { offsetDays }));
}

export function useSetSimulation() {
  const api = useApi();
  return useDemoMutation((input: OperationInput<'demo.setSimulation'>) => api.call('demo.setSimulation', input));
}

export function useExportDemo() {
  const api = useApi();
  return useMutation({ mutationFn: () => api.call('demo.export') });
}
