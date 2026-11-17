'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { KYC_DOC_TYPES, SERVICE_TYPES, type KycDocType, type ServiceType } from '@travelta/contracts';
import { KYC_FILE_TYPES, KYC_MAX_FILE_BYTES, uploadDocumentInputSchema, type KycCaseDto, type UploadDocumentInput } from '@travelta/schemas';
import { AlertTriangle, CheckCircle2, Clock3, FileUp, RefreshCw, Send } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useApi } from '@/components/api-provider';
import { StatusBadge } from '@/components/data/status-badge';
import { Can } from '@/components/portal/guards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-picker';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Stepper } from '@/components/ui/stepper';
import { applyFieldErrors, useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { DocStatus, ExpiryLine } from './kyc-shared';

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Agency/supplier view of their own verification (onboarding steps 2–3, renewals, service lines). */
export function MyKycPage() {
  const t = useTranslations();
  const format = useFormatter();
  const api = useApi();
  const onboarding = useSearchParams().get('onboarding') === '1';
  const orgType = useSession((s) => s.session?.organization.type);
  const kase = useQuery({ queryKey: ['kyc', 'me'], queryFn: () => api.call('kyc.myCase') });
  const [uploading, setUploading] = useState<KycDocType | null>(null);
  const submit = useAction(() => api.call('kyc.submit'), { success: t('kyc.submitted'), invalidate: [['kyc'], ['auth']] });
  const requestLine = useAction((serviceType: ServiceType) => api.call('kyc.requestServiceLine', { serviceType }), { success: t('kyc.lineRequested'), invalidate: [['kyc']] });

  if (!kase.data) return <Skeleton className="h-96 w-full" />;
  const c: KycCaseDto = kase.data;
  const docOf = (type: KycDocType) => c.documents.find((d) => d.docType === type);
  const step = c.status === 'approved' ? 3 : c.status === 'submitted' || c.status === 'in_review' ? 2 : 1;
  const hasPendingRenewal = c.status === 'approved' && c.documents.some((d) => d.status === 'pending');
  const blocked = c.organization.status === 'blocked_expired_docs';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('kyc.title')} description={t('kyc.myDescription')}
        actions={
          <Can permission="kyc.submit">
            {(c.canSubmit || hasPendingRenewal) && (
              <Button onClick={() => submit.mutate(undefined)} loading={submit.isPending} data-testid="kyc-submit"><Send className="flip-rtl" aria-hidden />{t('kyc.submit')}</Button>
            )}
          </Can>
        } />

      {(onboarding || c.status !== 'approved') && (
        <Card className="p-5">
          <Stepper steps={[t('onboarding.step1'), t('onboarding.step2'), t('onboarding.step3')]} current={step} />
          {c.status === 'draft' && (
            <ol className="mt-5 grid gap-3 text-sm text-fg-muted sm:grid-cols-3">
              {[t('onboarding.nextStep1'), t('onboarding.nextStep2'), t('onboarding.nextStep3')].map((s, i) => (
                <li key={s} className="flex gap-2"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-on-primary-soft">{i + 1}</span>{s}</li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {blocked && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{t('kyc.blockedBanner')}
        </div>
      )}
      {c.warnings.map((w) => (
        <div key={w.docType} role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-bg px-4 py-3 text-sm font-medium text-warning">
          <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden />{t('kyc.warningBanner', { doc: t(`enums.kycDocType.${w.docType}`), days: w.daysToExpiry })}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-fg-muted">{t('kyc.caseStatus')}</span>
        <StatusBadge kind="kycCaseStatus" value={c.status} />
        <StatusBadge kind="orgStatus" value={c.organization.status} />
        {(c.status === 'submitted' || c.status === 'in_review') && <span className="text-sm text-fg-muted">{t('kyc.awaiting')}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3" data-testid="kyc-documents">
        {KYC_DOC_TYPES.map((type) => {
          const d = docOf(type);
          const editable = c.status === 'draft' || c.status === 'changes_requested' || c.status === 'approved';
          return (
            <Card key={type} className="flex flex-col gap-3 p-5" data-doc-type={type}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-fg">{t(`enums.kycDocType.${type}`)}</p>
                <DocStatus doc={d} />
              </div>
              {d ? (
                <div className="flex flex-col gap-1 text-sm">
                  <span className="font-medium" dir="ltr">{d.number}</span>
                  <ExpiryLine doc={d} />
                  <span className="text-xs text-fg-muted">{t('kyc.version', { n: d.docVersion })} · <span dir="ltr">{d.file.name}</span></span>
                  {d.reviewNote && <p className="mt-1 rounded-md bg-danger-bg px-2 py-1 text-xs text-danger">{t('kyc.reviewNote')}: {d.reviewNote}</p>}
                </div>
              ) : <p className="text-sm text-fg-muted">{t('kyc.notUploaded')}</p>}
              <Can permission="kyc.submit">
                {editable && (
                  <Button variant={d ? 'outline' : 'primary'} size="sm" className="mt-auto self-start" onClick={() => setUploading(type)} data-upload={type}>
                    {d ? <RefreshCw aria-hidden /> : <FileUp aria-hidden />}
                    {!d ? t('kyc.upload') : c.status === 'approved' ? t('kyc.renew') : t('kyc.replace')}
                  </Button>
                )}
              </Can>
            </Card>
          );
        })}
      </div>

      {orgType === 'supplier' && (
        <Card>
          <CardHeader title={t('kyc.serviceLines')} description={t('onboarding.servicesHint')} />
          <CardBody className="flex flex-col gap-4">
            <ul className="flex flex-wrap gap-2">
              {c.serviceLines.map((l) => (
                <li key={l.id}><Badge tone={l.status === 'approved' ? 'success' : l.status === 'requested' ? 'warning' : 'danger'} dot>{t(`enums.serviceType.${l.serviceType}`)} · {t(`kyc.${l.status === 'approved' ? 'decision_approve' : l.status === 'requested' ? 'awaiting' : 'decision_reject'}`)}</Badge></li>
              ))}
            </ul>
            <Can permission="kyc.submit">
              <label className="flex max-w-sm items-center gap-2">
                <span className="sr-only">{t('kyc.requestLine')}</span>
                <Select defaultValue="" onChange={(e) => { if (e.target.value) { requestLine.mutate(e.target.value as ServiceType); e.target.value = ''; } }} aria-label={t('kyc.requestLine')}>
                  <option value="">{t('kyc.requestLine')}…</option>
                  {SERVICE_TYPES.filter((s) => !c.serviceLines.some((l) => l.serviceType === s && l.status !== 'rejected')).map((s) => <option key={s} value={s}>{t(`enums.serviceType.${s}`)}</option>)}
                </Select>
              </label>
            </Can>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title={t('kyc.decisions')} />
        <CardBody>
          {c.decisions.length === 0 ? <p className="text-sm text-fg-muted">{t('kyc.noDecisions')}</p> : (
            <ol className="flex flex-col gap-3">
              {c.decisions.map((d) => (
                <li key={d.id} className="flex gap-3 text-sm">
                  <CheckCircle2 className={d.decision.includes('reject') || d.decision === 'request_changes' ? 'mt-0.5 size-4 shrink-0 text-warning' : 'mt-0.5 size-4 shrink-0 text-success'} aria-hidden />
                  <div>
                    <p className="font-medium text-fg">{t(`kyc.decision_${d.decision}`)} <span className="font-normal text-fg-muted">· {t('kyc.by', { name: d.decidedByName })} · {format.dateTime(new Date(d.at), { dateStyle: 'medium', timeStyle: 'short' })}</span></p>
                    {d.reason && <p className="text-fg-muted">{d.reason}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      {uploading && <UploadSheet docType={uploading} onClose={() => setUploading(null)} />}
    </div>
  );
}

function UploadSheet({ docType, onClose }: { docType: KycDocType; onClose: () => void }) {
  const t = useTranslations();
  const api = useApi();
  const docName = t(`enums.kycDocType.${docType}`);
  const form = useForm<UploadDocumentInput>({
    resolver: zodResolver(uploadDocumentInputSchema) as Resolver<UploadDocumentInput>,
    defaultValues: { docType, number: '', issueDate: '', expiryDate: '', file: undefined as unknown as UploadDocumentInput['file'] },
  });
  const file = form.watch('file');
  const upload = useAction((input: UploadDocumentInput) => api.call('kyc.uploadDocument', input), { success: t('kyc.uploaded', { doc: docName }), invalidate: [['kyc']], onSuccess: onClose });
  const submit = form.handleSubmit((v) => upload.mutate(v, { onError: (e) => applyFieldErrors(e, form.setError) }));
  const e = form.formState.errors;
  const fileError = e.file?.message ?? (e.file as { type?: { message?: string }; size?: { message?: string } } | undefined)?.type?.message ?? (e.file as { size?: { message?: string } } | undefined)?.size?.message;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={t('kyc.uploadTitle', { doc: docName })}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={upload.isPending} onClick={() => void submit()} data-testid="upload-save">{t('kyc.upload')}</Button></>}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('kyc.number')} required error={e.number?.message}><Input dir="ltr" {...form.register('number')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('kyc.issueDate')} required error={e.issueDate?.message}><DateInput {...form.register('issueDate')} /></Field>
          <Field label={t('kyc.expiryDate')} required error={e.expiryDate?.message}><DateInput {...form.register('expiryDate')} /></Field>
        </div>
        <Field label={t('kyc.file')} required error={fileError}>
          <Input type="file" accept={KYC_FILE_TYPES.join(',')} className="py-1.5" onChange={async (ev) => {
            const f = ev.target.files?.[0];
            if (!f) return;
            // Size/type are validated by the shared schema; content is read only when within the cap.
            const dataUrl = f.size <= KYC_MAX_FILE_BYTES ? await readAsDataUrl(f) : null;
            form.setValue('file', { name: f.name, type: f.type as UploadDocumentInput['file']['type'], size: f.size, dataUrl }, { shouldValidate: true });
          }} />
        </Field>
        {file?.name && <p className="text-xs text-fg-muted" dir="ltr">{file.name} · {Math.round(file.size / 1024)} KB</p>}
      </form>
    </Sheet>
  );
}
