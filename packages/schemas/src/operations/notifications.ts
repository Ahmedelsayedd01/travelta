import { z } from 'zod';
import { listQuerySchema } from '../primitives';
import { notificationEntitySchema, outboxMessageEntitySchema } from '../entities/notifications';
import { op } from './define';
import { pageOf } from './reference';

export const notificationOperations = {
  'notifications.list': op({ input: listQuerySchema, output: pageOf(notificationEntitySchema).extend({ unread: z.number().int() }), http: { method: 'GET', path: '/notifications' }, auth: 'session' }),
  'notifications.markRead': op({ input: z.object({ ids: z.array(z.string()).max(200).optional(), all: z.boolean().optional() }), output: z.object({ unread: z.number().int() }), http: { method: 'POST', path: '/notifications/read' }, auth: 'session' }),
  'outbox.list': op({ input: listQuerySchema, output: pageOf(outboxMessageEntitySchema), http: { method: 'GET', path: '/outbox' }, auth: 'session' }),
} as const;
