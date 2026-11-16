import { forbidden } from '../errors';
import { listPage } from '../query';
import { requirePrincipal } from '../security';
import type { HandlerMap } from './types';

type Ops = 'notifications.list' | 'notifications.markRead' | 'outbox.list';

export const notificationHandlers: HandlerMap<Ops> = {
  /** The caller's bell, scoped to the organization they are signed in to (customers: their seller). */
  'notifications.list': (ctx, query) => {
    const p = requirePrincipal(ctx);
    const mine = ctx.db.filter('notifications', (n) => n.userId === p.user.id && (n.orgId === null || n.orgId === p.org.id));
    const page = listPage(mine, query, {
      search: (n) => [n.title.en, n.title.ar, n.body.en, n.body.ar],
      sortable: { at: (n) => n.at }, defaultSort: 'at:desc',
      filters: { unread: (n, v) => v.includes(String(n.readAt === null)), topic: (n, v) => v.includes(n.topic) },
    });
    return { ...page, unread: mine.filter((n) => n.readAt === null).length };
  },
  'notifications.markRead': (ctx, { ids, all }) => {
    const p = requirePrincipal(ctx);
    const now = ctx.clock.nowIso();
    const targets = ctx.db.filter('notifications', (n) => n.userId === p.user.id && n.readAt === null && (n.orgId === null || n.orgId === p.org.id) && (all === true || (ids ?? []).includes(n.id)));
    for (const n of targets) ctx.db.replace('notifications', { ...n, readAt: now, updatedAt: now, version: n.version + 1 });
    return { unread: ctx.db.filter('notifications', (n) => n.userId === p.user.id && n.readAt === null && (n.orgId === null || n.orgId === p.org.id)).length };
  },
  /** Simulated email/WhatsApp outbox: sellers see their own messages, the platform sees everything. */
  'outbox.list': (ctx, query) => {
    const p = requirePrincipal(ctx);
    if (p.user.userType !== 'staff' || p.org.type === 'supplier' || !p.permissions.has('bookings.view')) throw forbidden();
    const rows = ctx.db.filter('outboxMessages', (m) => p.org.type === 'platform' || m.tenantId === p.org.id);
    return listPage(rows, query, {
      search: (m) => [m.toName, m.toAddress, m.subject.en, m.subject.ar],
      sortable: { at: (m) => m.at }, defaultSort: 'at:desc',
      filters: { channel: (m, v) => v.includes(m.channel), topic: (m, v) => v.includes(m.topic) },
    });
  },
};
