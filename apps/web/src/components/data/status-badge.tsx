'use client';

import type { BookingStatus } from '@travelta/schemas';
import type {
  BookingItemStatus, InstallmentStatus, InvoiceStatus, KycCaseStatus, OrgStatus, PaymentStatus, RequestStage, SubscriptionStatus,
} from '@travelta/contracts';
import { useTranslations } from 'next-intl';
import { Badge, type BadgeTone } from '@/components/ui/badge';

/** One mapping table for every status in the platform (DESIGN_SYSTEM §6). */
const tones = {
  bookingStatus: { pending: 'warning', partially_confirmed: 'warning', confirmed: 'info', vouchered: 'primary', travelled: 'success', cancelled: 'danger' },
  bookingPaymentStatus: { unpaid: 'neutral', authorized: 'info', partially_paid: 'warning', paid: 'success', refunded: 'neutral' },
  bookingItemStatus: { pending: 'warning', confirmed: 'info', vouchered: 'primary', travelled: 'success', cancelled: 'danger', rejected: 'danger', no_show: 'neutral' },
  paymentStatus: { pending: 'warning', authorized: 'info', succeeded: 'success', failed: 'danger', voided: 'neutral', refunded: 'neutral' },
  installmentStatus: { pending: 'info', partially_paid: 'warning', paid: 'success', overdue: 'danger', cancelled: 'neutral' },
  invoiceStatus: { issued: 'info', partially_paid: 'warning', paid: 'success', void: 'neutral' },
  requestStage: { pending: 'neutral', price_quotation: 'info', negotiation: 'warning', won: 'success', lost: 'danger' },
  kycCaseStatus: { draft: 'neutral', submitted: 'info', in_review: 'warning', changes_requested: 'warning', approved: 'success', rejected: 'danger' },
  orgStatus: { pending_kyc: 'warning', active: 'success', suspended: 'danger', blocked_expired_docs: 'danger', rejected: 'danger' },
  subscriptionStatus: { trialing: 'info', active: 'success', past_due: 'warning', suspended: 'danger', cancelled: 'neutral' },
} as const satisfies Record<string, Record<string, BadgeTone>>;

type StatusMap = {
  bookingStatus: BookingStatus;
  bookingPaymentStatus: 'unpaid' | 'authorized' | 'partially_paid' | 'paid' | 'refunded';
  bookingItemStatus: BookingItemStatus;
  paymentStatus: PaymentStatus;
  installmentStatus: InstallmentStatus;
  invoiceStatus: InvoiceStatus;
  requestStage: RequestStage;
  kycCaseStatus: KycCaseStatus;
  orgStatus: OrgStatus;
  subscriptionStatus: SubscriptionStatus;
};

export function StatusBadge<K extends keyof StatusMap>({ kind, value }: { kind: K; value: StatusMap[K] }) {
  const t = useTranslations('enums');
  const tone = (tones[kind] as Record<string, BadgeTone>)[value] ?? 'neutral';
  return (
    <Badge tone={tone} dot>
      {t(`${kind}.${value}` as never)}
    </Badge>
  );
}
