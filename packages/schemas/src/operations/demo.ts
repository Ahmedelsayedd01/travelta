import { z } from 'zod';
import { isoDateTimeSchema } from '../primitives';
import { op } from './define';

export const latencySchema = z.object({ minMs: z.number().int().min(0).max(10_000), maxMs: z.number().int().min(0).max(10_000) })
  .refine((l) => l.maxMs >= l.minMs, { error: 'validation.invalid_value', path: ['maxMs'] });

export const demoStatusSchema = z.object({
  schemaVersion: z.number().int(),
  seed: z.number().int(),
  seededAt: isoDateTimeSchema,
  now: isoDateTimeSchema,
  clockOffsetDays: z.number(),
  latency: latencySchema,
  failureRate: z.number().min(0).max(1),
  nextSupplierResponse: z.enum(['auto', 'confirm', 'reject', 'pending', 'timeout']),
  counts: z.record(z.string(), z.number().int()),
  fingerprint: z.string(),
});
export type DemoStatus = z.infer<typeof demoStatusSchema>;

/** Exported dataset (JSON file). Shape-checked on import; entity-level validation happens in the mock server. */
export const demoSnapshotSchema = z.object({
  format: z.literal('travelta-demo'),
  schemaVersion: z.number().int(),
  seed: z.number().int(),
  seededAt: isoDateTimeSchema,
  exportedAt: isoDateTimeSchema.optional(),
  clockOffsetMs: z.number().int(),
  sequences: z.record(z.string(), z.number().int()),
  collections: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type DemoSnapshot = z.infer<typeof demoSnapshotSchema>;

export const demoOperations = {
  'demo.status': op({ input: z.void(), output: demoStatusSchema, http: { method: 'GET', path: '/demo/status' }, auth: 'public', demoOnly: true }),
  'demo.reset': op({ input: z.void(), output: demoStatusSchema, http: { method: 'POST', path: '/demo/reset' }, auth: 'public', demoOnly: true }),
  'demo.export': op({ input: z.void(), output: demoSnapshotSchema, http: { method: 'GET', path: '/demo/export' }, auth: 'public', demoOnly: true }),
  'demo.import': op({ input: demoSnapshotSchema, output: demoStatusSchema, http: { method: 'POST', path: '/demo/import' }, auth: 'public', demoOnly: true }),
  'demo.setClock': op({
    input: z.object({ offsetDays: z.number().int().min(-3650).max(3650) }),
    output: demoStatusSchema,
    http: { method: 'POST', path: '/demo/clock' },
    auth: 'public',
    demoOnly: true,
  }),
  'demo.setSimulation': op({
    input: z.object({ latency: latencySchema.optional(), failureRate: z.number().min(0).max(1).optional(), nextSupplierResponse: z.enum(['auto', 'confirm', 'reject', 'pending', 'timeout']).optional() }),
    output: demoStatusSchema,
    http: { method: 'POST', path: '/demo/simulation' },
    auth: 'public',
    demoOnly: true,
  }),
} as const;
