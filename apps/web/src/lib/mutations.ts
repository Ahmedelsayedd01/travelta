'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@travelta/api-client';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { useErrorMessage } from './errors';

/**
 * Standard mutation for business actions: success toast, refresh of affected queries, error toast —
 * and, when a form is attached, server field errors (VALIDATION_ERROR / CONFLICT details) land on their fields.
 */
export function useAction<I, O>(
  fn: (input: I) => Promise<O>,
  options: { success?: string | ((out: O, input: I) => string); invalidate?: readonly (readonly unknown[])[]; onSuccess?: (out: O, input: I) => void } = {},
) {
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (out, input) => {
      if (options.success) toast.success(typeof options.success === 'function' ? options.success(out, input) : options.success);
      await Promise.all((options.invalidate ?? [[]]).map((key) => qc.invalidateQueries({ queryKey: key as unknown[] })));
      options.onSuccess?.(out, input);
    },
    onError: (error) => {
      // Per-call onError handlers (which may map field errors onto a form) run after this one; decide on the next tick.
      // Every error that no form displayed gets a toast, so an action can never fail silently.
      setTimeout(() => { if (!handledByForm.has(error as object)) toast.error(errorMessage(error)); }, 0);
    },
  });
}

/** Errors whose details were shown on a form field (no toast needed). */
const handledByForm = new WeakSet<object>();

/** Copy server field errors onto a react-hook-form form; returns true if any field matched. */
export function applyFieldErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
  if (!(error instanceof ApiClientError)) return false;
  const fields = Object.entries(error.fieldErrors());
  for (const [field, issue] of fields) setError(field as Path<T>, { message: issue });
  if (fields.length > 0) handledByForm.add(error);
  return fields.length > 0;
}

/** For forms kept in plain state: the server's field errors (field → message key), marked as shown so no toast repeats them. */
export function takeFieldErrors(error: unknown): Record<string, string> | null {
  if (!(error instanceof ApiClientError)) return null;
  const fields = error.fieldErrors();
  if (Object.keys(fields).length === 0) return null;
  handledByForm.add(error);
  return fields;
}
