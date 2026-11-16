import type { z } from 'zod';

/**
 * One entry of the operation catalogue — the executable form of DATA_CONTRACTS §6.
 * The mock server validates input/output against these schemas today; the future NestJS API
 * implements `http` with the same shapes, and HttpTransport maps operations to it.
 */
export interface OperationDef<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  input: I;
  output: O;
  http: { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string };
  /** `public` operations need no session; everything else is checked against the token (TENANCY §2). */
  auth: 'public' | 'session';
  /** Demo-only operations never exist in production APIs. */
  demoOnly?: boolean;
}

export const op = <I extends z.ZodType, O extends z.ZodType>(def: OperationDef<I, O>) => def;
