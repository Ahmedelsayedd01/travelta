import { describe, expect, it } from 'vitest';
import { canMoveRequest, checkRequestMove, isFollowUpOverdue } from './pipeline';

describe('CRM-1 request pipeline', () => {
  it('allows the forward path, the negotiation step back, and lost from any open stage', () => {
    expect(canMoveRequest('pending', 'price_quotation')).toBe(true);
    expect(canMoveRequest('price_quotation', 'negotiation')).toBe(true);
    expect(canMoveRequest('negotiation', 'price_quotation')).toBe(true);
    expect(canMoveRequest('pending', 'negotiation')).toBe(false);
    expect(canMoveRequest('won', 'lost')).toBe(false);
    expect(canMoveRequest('lost', 'pending')).toBe(false);
  });
  it('requires the win action for won and a reason for lost', () => {
    expect(checkRequestMove('negotiation', 'won')).toBe('use_win');
    expect(checkRequestMove('pending', 'lost')).toBe('reason_required');
    expect(checkRequestMove('pending', 'lost', 'Budget')).toBeNull();
    expect(checkRequestMove('pending', 'won')).toBe('invalid_move');
  });
  it('flags open follow-ups past their due time (CRM-4)', () => {
    expect(isFollowUpOverdue({ doneAt: null, dueAt: '2026-11-14T10:00:00Z' }, '2026-11-15T09:00:00Z')).toBe(true);
    expect(isFollowUpOverdue({ doneAt: '2026-11-14T11:00:00Z', dueAt: '2026-11-14T10:00:00Z' }, '2026-11-15T09:00:00Z')).toBe(false);
  });
});
