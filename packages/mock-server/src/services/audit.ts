import { createId } from '@travelta/shared';
import type { RequestContext } from '../context';

/** Append-only audit trail (TENANCY §6). Written inside the operation's transaction so it rolls back with it. */
export function audit(
  ctx: RequestContext,
  entry: { tenantId: string; action: string; entity: string; entityId: string; before?: unknown; after?: unknown; actorUserId?: string },
): void {
  const at = ctx.clock.nowIso();
  const { actorUserId, ...rest } = entry;
  ctx.db.insert('auditLogs', {
    id: createId('aud', ctx.clock.now()),
    createdAt: at,
    updatedAt: at,
    version: 1,
    // Explicit actor for events that happen before a session exists (login, registration).
    actorUserId: actorUserId ?? ctx.principal?.user.id ?? null,
    at,
    ...rest,
  });
}
