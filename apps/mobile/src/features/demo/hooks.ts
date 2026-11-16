import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OperationInput } from '@travelta/api-client';
import { useApi } from '@/lib/api-provider';

export function useDemoStatus() {
  const api = useApi();
  return useQuery({ queryKey: ['demo', 'status'], queryFn: () => api.call('demo.status') });
}

function useInvalidatingMutation<T, R>(fn: (input: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}

export function useDemoActions() {
  const api = useApi();
  return {
    reset: useInvalidatingMutation(() => api.call('demo.reset')),
    setClock: useInvalidatingMutation((offsetDays: number) => api.call('demo.setClock', { offsetDays })),
    setSimulation: useInvalidatingMutation((input: OperationInput<'demo.setSimulation'>) => api.call('demo.setSimulation', input)),
    importSnapshot: useInvalidatingMutation((snapshot: OperationInput<'demo.import'>) => api.call('demo.import', snapshot)),
    exportSnapshot: useMutation({ mutationFn: () => api.call('demo.export') }),
  };
}
