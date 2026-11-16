import type { BookingItemStatus } from '@travelta/contracts';
import type { BookingStatus } from '@travelta/schemas';

/**
 * BKG-1 item state machine: pending → confirmed → vouchered → travelled, with exits
 * pending → rejected | cancelled, confirmed|vouchered → cancelled (before travel), vouchered → no_show.
 */
const TRANSITIONS: Record<BookingItemStatus, readonly BookingItemStatus[]> = {
  pending: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['vouchered', 'cancelled', 'travelled'],
  vouchered: ['travelled', 'cancelled', 'no_show'],
  travelled: [],
  cancelled: [],
  rejected: [],
  no_show: [],
};

export function canTransition(from: BookingItemStatus, to: BookingItemStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(readonly from: BookingItemStatus, readonly to: BookingItemStatus) { super(`Cannot move an item from ${from} to ${to}`); }
}

export function assertTransition(from: BookingItemStatus, to: BookingItemStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

const RANK: Partial<Record<BookingItemStatus, number>> = { confirmed: 1, vouchered: 2, travelled: 3, no_show: 3 };

/**
 * BKG-2: booking status derives from its items —
 *  all rejected/cancelled → cancelled; any pending → pending (partially_confirmed when some are already confirmed);
 *  otherwise the lowest common state of the live items.
 */
export function deriveBookingStatus(items: readonly BookingItemStatus[]): BookingStatus {
  const live = items.filter((s) => s !== 'rejected' && s !== 'cancelled');
  if (live.length === 0) return 'cancelled';
  if (live.includes('pending')) return live.some((s) => s !== 'pending') ? 'partially_confirmed' : 'pending';
  const lowest = Math.min(...live.map((s) => RANK[s] ?? 1));
  return lowest >= 3 ? 'travelled' : lowest === 2 ? 'vouchered' : 'confirmed';
}

/** BKG-8: TRV-YYMM-XXXXX. */
export function bookingRef(today: string, sequence: number): string {
  return `TRV-${today.slice(2, 4)}${today.slice(5, 7)}-${String(sequence).padStart(5, '0')}`;
}

/** INV-1: INV-YYYY-000123 (per tenant sequence). */
export function documentNumber(prefix: string, today: string, sequence: number): string {
  return `${prefix}-${today.slice(0, 4)}-${String(sequence).padStart(6, '0')}`;
}
