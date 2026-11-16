import type { RequestStage } from '@travelta/contracts';

/**
 * CRM-1 request pipeline: pending → price_quotation → negotiation → won | lost. Negotiation can go back to
 * price_quotation; any open stage can be lost (reason required). `won` is reached only through the win action
 * (CRM-2), which creates the booking.
 */
export const REQUEST_MOVES: Record<RequestStage, readonly RequestStage[]> = {
  pending: ['price_quotation', 'lost'],
  price_quotation: ['negotiation', 'lost'],
  negotiation: ['price_quotation', 'won', 'lost'],
  won: [],
  lost: [],
};

export function canMoveRequest(from: RequestStage, to: RequestStage): boolean {
  return REQUEST_MOVES[from].includes(to);
}

export class InvalidStageMoveError extends Error {
  constructor(readonly from: RequestStage, readonly to: RequestStage) { super(`A request cannot move from ${from} to ${to}`); }
}

/** Validates a manual move; `won` needs the win action and `lost` needs a reason. Returns the issue key or null. */
export function checkRequestMove(from: RequestStage, to: RequestStage, reason?: string): 'invalid_move' | 'use_win' | 'reason_required' | null {
  if (!canMoveRequest(from, to)) return 'invalid_move';
  if (to === 'won') return 'use_win';
  if (to === 'lost' && !(reason && reason.trim().length >= 3)) return 'reason_required';
  return null;
}

/** CRM-4: overdue follow-ups are open ones whose due time has passed. */
export const isFollowUpOverdue = (f: { doneAt: string | null; dueAt: string }, nowIso: string) => f.doneAt === null && f.dueAt < nowIso;
