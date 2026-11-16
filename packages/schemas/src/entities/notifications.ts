import { z } from 'zod';
import { isoDateTimeSchema, localizedTextSchema } from '../primitives';
import { entityBaseSchema, tenantEntityBaseSchema } from './base';

// ---- Notifications (M19): in-app per user + a simulated email/WhatsApp outbox with en/ar templates ------------------------
export const NOTIFICATION_TOPICS = [
  'booking.created', 'booking.new_reservation', 'booking.confirmed', 'booking.rejected', 'booking.vouchered', 'booking.cancelled', 'booking.credit_approval',
  'payment.received', 'payment.reminder', 'payment.overdue', 'travel.upcoming', 'wallet.top_up_requested', 'wallet.top_up_decided',
  'kyc.decided', 'kyc.expiring', 'quotation.sent', 'crm.follow_up_due', 'subscription.past_due', 'subscription.suspended', 'cancellation.approval', 'support.request',
  'auth.password_reset', 'auth.email_verify',
] as const;
export const notificationTopicSchema = z.enum(NOTIFICATION_TOPICS);
export type NotificationTopic = z.infer<typeof notificationTopicSchema>;

export const notificationEntitySchema = entityBaseSchema.extend({
  userId: z.string(),
  /** Organization context the notification belongs to (switching org filters the bell). */
  orgId: z.string().nullable(),
  topic: notificationTopicSchema,
  title: localizedTextSchema,
  body: localizedTextSchema,
  /** App path below the locale (e.g. /agency/bookings/…). */
  link: z.string().nullable(),
  severity: z.enum(['info', 'success', 'warning', 'danger']),
  readAt: isoDateTimeSchema.nullable(),
  at: isoDateTimeSchema,
  dedupeKey: z.string().nullable(),
});
export type NotificationEntity = z.infer<typeof notificationEntitySchema>;

export const outboxMessageEntitySchema = tenantEntityBaseSchema.extend({
  channel: z.enum(['email', 'whatsapp']),
  topic: notificationTopicSchema,
  toName: z.string(),
  toAddress: z.string(),
  locale: z.enum(['en', 'ar']),
  subject: localizedTextSchema,
  body: localizedTextSchema,
  /** SIMULATION: nothing leaves the browser; messages are "sent" instantly and kept for preview. */
  status: z.enum(['sent', 'failed']),
  related: z.object({ kind: z.string(), id: z.string() }).nullable(),
  at: isoDateTimeSchema,
  dedupeKey: z.string().nullable(),
});
export type OutboxMessageEntity = z.infer<typeof outboxMessageEntitySchema>;
