'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { KYC_CASE_STATUSES, KYC_DOC_TYPES } from '@travelta/contracts';
import type { KycQueueItem } from '@travelta/schemas';
import { Check, X } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/data/status-badge';
import { EmptyState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useAction } from '@/lib/mutations';
import { DocStatus, DocumentPreview, ExpiryLine } from './kyc-shared';

type Decision = { kind: 'case'; decision: 'reject' | 'request_changes' } | { kind: 'doc'; documentId: string } | { kind: 'line'; serviceLineId: string };

/** Platform compliance queue (W1 step 3): oldest first; review documents, decide cases and supplier service lines. */
export function KycQueuePage() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const format = useFormatter();
  const api = useApi();
  const state = useListState({ pageSize: 10, sort: 'submittedAt:asc' });
  const result = useQuery({ queryKey: ['kyc', 'queue', state.query], queryFn: () => api.call('kyc.queue', state.query), placeholderData: keepPreviousData });
  const [caseId, setCaseId] = useState<string | null>(null);

  const columns: Column<KycQueueItem>[] = [
    { key: 'org', header: t('org.name'), sortKey: 'name', cell: (i) => <div><p className="font-medium">{i.organization.name[locale]}</p><p className="text-xs text-fg-muted">{i.organization.legalName}</p></div> },
    { key: 'type', header: t('org.type'), cell: (i) => <Badge tone={i.organization.type === 'supplier' ? 'accent' : 'neutral'}>{t(`enums.orgType.${i.organization.type}`)}</Badge> },
    { key: 'status', header: t('kyc.caseStatus'), cell: (i) => <StatusBadge kind="kycCaseStatus" value={i.status} /> },
    { key: 'docs', header: t('kyc.pendingDocs'), numeric: true, cell: (i) => i.pendingDocuments },
    { key: 'lines', header: t('kyc.pendingLines'), numeric: true, cell: (i) => i.pendingServiceLines },
    { key: 'age', header: t('kyc.age'), sortKey: 'age', cell: (i) => <span className={i.ageDays > 1 ? 'font-medium text-warning' : ''}>{t('kyc.ageDays', { days: i.ageDays })}</span> },
    { key: 'submitted', header: t('org.created'), sortKey: 'submittedAt', hideOnCard: true, cell: (i) => (i.submittedAt ? format.dateTime(new Date(i.submittedAt), { dateStyle: 'medium' }) : '—') },
  ];

  return (
    <>
      <PageHeader title={t('kyc.queueTitle')} description={t('kyc.queueDescription')} />
      <DataTable label={t('kyc.queueTitle')} testId="kyc-queue" state={state} result={result} columns={columns} rowKey={(i) => i.caseId}
        onRowClick={(i) => setCaseId(i.caseId)}
        filters={[{ key: 'status', label: t('kyc.caseStatus'), options: KYC_CASE_STATUSES.map((s) => ({ value: s, label: t(`enums.kycCaseStatus.${s}`) })) }]}
        rowActions={(i) => <Button variant="outline" size="sm" onClick={() => setCaseId(i.caseId)}>{t('kyc.review')}</Button>}
        empty={<EmptyState title={t('kyc.queueTitle')} body={t('kyc.queueDescription')} />} />
      {caseId && <CaseReview caseId={caseId} onClose={() => setCaseId(null)} />}
    </>
  );
}

function CaseReview({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const kase = useQuery({ queryKey: ['kyc', 'case', caseId], queryFn: () => api.call('kyc.getCase', { caseId }) });
  const [pending, setPending] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const invalidate = [['kyc'], ['orgs']] as const;
  const close = () => { setPending(null); setReason(''); };
  const reviewDoc = useAction((i: { documentId: string; status: 'accepted' | 'rejected'; note?: string }) => api.call('kyc.reviewDocument', i), { success: t('kyc.documentReviewed'), invalidate, onSuccess: close });
  const decide = useAction((i: { caseId: string; decision: 'approve' | 'reject' | 'request_changes'; reason?: string }) => api.call('kyc.decide', i), { success: t('kyc.decided'), invalidate, onSuccess: close });
  const decideLine = useAction((i: { serviceLineId: string; approve: boolean; reason?: string }) => api.call('kyc.decideServiceLine', i), { success: t('kyc.lineDecided'), invalidate, onSuccess: close });

  const c = kase.data;
  const reviewable = c && (c.status === 'submitted' || c.status === 'in_review');
  const allAccepted = c && KYC_DOC_TYPES.every((type) => c.documents.some((d) => d.docType === type && d.status === 'accepted' && d.daysToExpiry > 0));

  const confirmPending = () => {
    if (!pending || !reason.trim()) return;
    if (pending.kind === 'doc') reviewDoc.mutate({ documentId: pending.documentId, status: 'rejected', note: reason.trim() });
    else if (pending.kind === 'line') decideLine.mutate({ serviceLineId: pending.serviceLineId, approve: false, reason: reason.trim() });
    else decide.mutate({ caseId, decision: pending.decision, reason: reason.trim() });
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} size="lg" title={c?.organization.name[locale] ?? '…'} description={c?.organization.legalName}
      footer={reviewable && (
        <>
          <Button variant="ghost" className="text-danger" onClick={() => setPending({ kind: 'case', decision: 'reject' })}>{t('kyc.rejectCompany')}</Button>
          <Button variant="outline" onClick={() => setPending({ kind: 'case', decision: 'request_changes' })}>{t('kyc.requestChanges')}</Button>
          <Button disabled={!allAccepted} title={allAccepted ? undefined : t('kyc.approveHint')} loading={decide.isPending} onClick={() => decide.mutate({ caseId, decision: 'approve' })} data-testid="kyc-approve">{t('kyc.approve')}</Button>
        </>
      )}>
      {!c ? <Skeleton className="h-96 w-full" /> : (
        <div className="flex flex-col gap-5" data-testid="kyc-case">
          <div className="flex flex-wrap gap-2"><StatusBadge kind="kycCaseStatus" value={c.status} /><StatusBadge kind="orgStatus" value={c.organization.status} /></div>
          {KYC_DOC_TYPES.map((type) => {
            const d = c.documents.find((x) => x.docType === type);
            return (
              <Card key={type} className="flex flex-col gap-3 p-4" data-review-doc={type}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-fg">{t(`enums.kycDocType.${type}`)}</p>
                    {d && <p className="text-sm" dir="ltr">{d.number}</p>}
                    {d && <ExpiryLine doc={d} />}
                  </div>
                  <DocStatus doc={d} />
                </div>
                {d && <DocumentPreview doc={d} />}
                {d?.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => reviewDoc.mutate({ documentId: d.id, status: 'accepted' })}
                      loading={reviewDoc.isPending && reviewDoc.variables?.documentId === d.id} data-accept={type}><Check aria-hidden />{t('kyc.accept')}</Button>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setPending({ kind: 'doc', documentId: d.id })}><X aria-hidden />{t('kyc.reject')}</Button>
                  </div>
                )}
              </Card>
            );
          })}
          {c.serviceLines.length > 0 && (
            <div>
              <p className="mb-2 font-semibold text-fg">{t('kyc.serviceLines')}</p>
              <ul className="flex flex-col gap-2">
                {c.serviceLines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <span>{t(`enums.serviceType.${l.serviceType}`)}</span>
                    {l.status === 'requested' ? (
                      <span className="flex gap-1">
                        <Button size="sm" onClick={() => decideLine.mutate({ serviceLineId: l.id, approve: true })} data-approve-line={l.serviceType}>{t('kyc.approveLine')}</Button>
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setPending({ kind: 'line', serviceLineId: l.id })}>{t('kyc.rejectLine')}</Button>
                      </span>
                    ) : <Badge tone={l.status === 'approved' ? 'success' : 'danger'} dot>{t(l.status === 'approved' ? 'kyc.decision_approve' : 'kyc.decision_reject')}</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <Dialog open={pending !== null} onOpenChange={(o) => !o && close()} size="sm"
        title={pending?.kind === 'case' ? (pending.decision === 'reject' ? t('kyc.rejectCompany') : t('kyc.requestChanges')) : pending?.kind === 'line' ? t('kyc.rejectLine') : t('kyc.reject')}
        footer={<><Button variant="outline" onClick={close}>{t('common.cancel')}</Button><Button variant="danger" disabled={!reason.trim()} loading={reviewDoc.isPending || decide.isPending || decideLine.isPending} onClick={confirmPending}>{t('common.confirm')}</Button></>}>
        <Field label={t('kyc.decisionReason')} required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
      </Dialog>
    </Sheet>
  );
}
