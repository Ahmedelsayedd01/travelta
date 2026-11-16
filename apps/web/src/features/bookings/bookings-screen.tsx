'use client';

import { BookingFinancePanel, FINANCE_ACTIONS } from '@/features/finance/booking-finance';
import { BookingDetail } from './booking-detail';
import { BookingsPage } from './bookings-page';
import { VoucherView } from './voucher';

/** /bookings, /bookings/:id and /bookings/:id/voucher/:itemId (also /reservations for suppliers). */
export function BookingsScreen({ segments }: { segments: string[] }) {
  const [id, sub, itemId] = segments;
  if (id && sub === 'voucher' && itemId) return <VoucherView bookingId={id} itemId={itemId} />;
  if (id) return <BookingDetail id={id} extraActions={FINANCE_ACTIONS} sections={(b) => <BookingFinancePanel booking={b} />} />;
  return <BookingsPage extraActions={FINANCE_ACTIONS} />;
}
