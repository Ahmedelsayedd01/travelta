'use client';

import type { KycDocumentDto } from '@travelta/schemas';
import { FileText } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/data/status-badge';

export function ExpiryLine({ doc }: { doc: KycDocumentDto }) {
  const t = useTranslations('kyc');
  const format = useFormatter();
  if (doc.daysToExpiry < 0) return <span className="text-sm font-medium text-danger">{t('expiredAgo', { days: -doc.daysToExpiry })}</span>;
  if (doc.expiringSoon) return <span className="text-sm font-medium text-warning">{t('expiresIn', { days: doc.daysToExpiry })}</span>;
  return <span className="text-sm text-fg-muted">{t('validUntil', { date: format.dateTime(new Date(doc.expiryDate), { dateStyle: 'medium' }) })}</span>;
}

/** File preview: images inline, PDFs in a frame; seeded records have no file content. */
export function DocumentPreview({ doc }: { doc: KycDocumentDto }) {
  const t = useTranslations('kyc');
  if (!doc.file.dataUrl) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-subtle text-center text-sm text-fg-muted">
        <FileText className="size-8" aria-hidden />
        <span dir="ltr">{doc.file.name}</span>
        <span className="text-xs">{t('seedFile')}</span>
      </div>
    );
  }
  return doc.file.type === 'application/pdf'
    ? <iframe title={doc.file.name} src={doc.file.dataUrl} className="h-72 w-full rounded-md border border-border bg-white" />
    // eslint-disable-next-line @next/next/no-img-element -- data URL preview of a user upload
    : <img src={doc.file.dataUrl} alt={doc.file.name} className="max-h-72 w-full rounded-md border border-border object-contain" />;
}

export function DocStatus({ doc }: { doc: KycDocumentDto | undefined }) {
  const t = useTranslations();
  if (!doc) return <Badge tone="neutral">{t('kyc.notUploaded')}</Badge>;
  const tone = { pending: 'warning', accepted: 'success', rejected: 'danger', expired: 'danger' } as const;
  return <Badge tone={tone[doc.status]} dot>{t(`enums.kycDocStatus.${doc.status}`)}</Badge>;
}

export { StatusBadge };
