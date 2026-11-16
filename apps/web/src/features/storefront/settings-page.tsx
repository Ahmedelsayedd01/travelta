'use client';

import { useQuery } from '@tanstack/react-query';
import type { KycFile, StorefrontDto } from '@travelta/schemas';
import { ApiClientError } from '@travelta/api-client';
import { CheckCircle2, Copy, ExternalLink, Globe, Lock, Search, ShieldAlert, Store, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { useApi } from '@/components/api-provider';
import { ErrorState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { priceOf } from '@/features/search/format';
import { contrastBetween } from '@travelta/domain';
import { toStoredFile } from '@/lib/files';
import { useAction } from '@/lib/mutations';
import { cn } from '@/lib/cn';

const KEYS = [['storefront']] as const;

function ContrastBadge({ hex }: { hex: string }) {
  const t = useTranslations('storefront');
  const valid = /^#[0-9a-fA-F]{6}$/.test(hex);
  const ratio = valid ? contrastBetween(hex, '#FFFFFF') : 0;
  const ok = ratio >= 4.5;
  return <Badge tone={ok ? 'success' : 'danger'} data-testid="contrast">{ok ? <CheckCircle2 className="size-3" aria-hidden /> : <XCircle className="size-3" aria-hidden />}{t('contrast', { ratio: ratio.toFixed(2) })}</Badge>;
}

function Preview({ v, logo }: { v: { displayName: string; tagline: string; primaryColor: string; heroColor: string }; logo: string | null }) {
  const t = useTranslations('storefront');
  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-sm" aria-label={t('preview')} data-testid="brand-preview">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- uploaded logo kept as a data URL */}
        {logo ? <img src={logo} alt="" className="size-7 rounded object-contain" /> : <span className="flex size-7 items-center justify-center rounded text-xs font-bold text-white" style={{ background: v.primaryColor }}>{v.displayName.slice(0, 1)}</span>}
        <span className="text-sm font-semibold">{v.displayName}</span>
      </div>
      <div className="px-5 py-6 text-white" style={{ background: v.heroColor }}>
        <p className="text-lg font-bold">{v.tagline}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: v.primaryColor }}><Search className="size-4" aria-hidden />{t('previewSearch')}</span>
      </div>
    </div>
  );
}

function DomainCard({ sf }: { sf: StorefrontDto }) {
  const locale = useLocale();
  const t = useTranslations('storefront');
  const api = useApi();
  const [domain, setDomain] = useState(sf.customDomain ?? '');
  const [error, setError] = useState<string | null>(null);
  const tv = useTranslations();
  const request = useAction((d: string | null) => api.call('storefront.requestDomain', { domain: d }), { success: t('domainSaved'), invalidate: KEYS });
  const dns = useAction(() => api.call('storefront.simulateDns', undefined), { success: t('dnsAdded'), invalidate: KEYS });
  const verify = useAction(() => api.call('storefront.verifyDomain', undefined), { success: (o) => (o.domainStatus === 'verified' ? t('verified') : t('verifyFailed')), invalidate: KEYS });
  const tone = { none: 'neutral', pending: 'warning', verified: 'success', failed: 'danger' } as const;
  return (
    <Card>
      <CardHeader title={t('domainTitle')} description={t('domainBody')} actions={<Badge tone={tone[sf.domainStatus]} data-testid="domain-status">{t(`domain_${sf.domainStatus}`)}</Badge>} />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('customDomain')} className="min-w-64 flex-1" error={error ?? undefined}><Input name="domain" dir="ltr" placeholder="book.youragency.com" value={domain} disabled={!sf.canManage} onChange={(e) => setDomain(e.target.value)} /></Field>
          {sf.canManage && <Button variant="outline" onClick={() => request.mutate(domain.trim() || null, { onError: (e) => setError(e instanceof ApiClientError && e.fieldErrors().domain ? tv(e.fieldErrors().domain as never) : null) })} loading={request.isPending} data-testid="domain-save">{domain.trim() ? t('connect') : t('remove')}</Button>}
        </div>
        {sf.customDomain && sf.domainStatus !== 'verified' && (
          <ol className="flex flex-col gap-3 rounded-lg bg-subtle p-4 text-sm" data-testid="dns-steps">
            <li><p className="font-medium">{t('step1')}</p>
              <div className="mt-1 grid gap-1 font-mono text-xs" dir="ltr">
                <span>TXT · _travelta.{sf.customDomain}</span>
                <span className="flex items-center gap-2 break-all">{sf.verificationToken}<Button size="sm" variant="ghost" aria-label={t('copy')} onClick={() => { void navigator.clipboard?.writeText(sf.verificationToken ?? ''); toast.success(t('copied')); }}><Copy aria-hidden /></Button></span>
                <span>CNAME · {sf.customDomain} → storefronts.travelta.app</span>
              </div>
            </li>
            <li className="flex flex-wrap items-center gap-2"><p className="font-medium">{t('step2')}</p>
              {sf.dnsRecordPresent ? <Badge tone="success">{t('dnsFound')}</Badge> : sf.canManage && <Button size="sm" variant="outline" onClick={() => dns.mutate()} loading={dns.isPending} data-testid="simulate-dns">{t('simulateDns')}</Button>}
            </li>
            <li className="flex flex-wrap items-center gap-2"><p className="font-medium">{t('step3')}</p>{sf.canManage && <Button size="sm" onClick={() => verify.mutate()} loading={verify.isPending} data-testid="verify-domain">{t('verify')}</Button>}</li>
          </ol>
        )}
        {sf.domainStatus === 'failed' && <p className="flex items-center gap-1.5 text-sm text-danger"><ShieldAlert className="size-4" aria-hidden />{t('failedBody')}</p>}
        {sf.customDomain && (
          <p className="text-sm" data-testid="domain-mapping">
            <span className="text-fg-muted">{t('mappingLabel')}: </span>
            <span className="font-mono" dir="ltr">{sf.customDomain}</span> → <span className="font-medium">{sf.displayName.en}</span>
            {sf.domainStatus === 'verified' && <> · <a className="text-primary hover:underline" href={`/${locale}${sf.urls.path}`}>{t('openStorefront')}</a></>}
          </p>
        )}
        <p role="note" className="rounded-md border border-dashed border-border-strong px-3 py-2 text-xs text-fg-muted" data-testid="dns-demo-notice">{t('dnsDemoNotice')}</p>
      </CardBody>
    </Card>
  );
}

/** Agency storefront (M22): branding with AA contrast checks, publish, URLs and a custom domain verified via simulated DNS. */
export function StorefrontSettingsPage() {
  const t = useTranslations('storefront');
  const tv = useTranslations();
  const locale = useLocale();
  const api = useApi();
  const q = useQuery({ queryKey: ['storefront'], queryFn: () => api.call('storefront.get', undefined) });
  const [draft, setDraft] = useState<null | { en: string; ar: string; ten: string; tar: string; primaryColor: string; heroColor: string; subdomain: string; supportEmail: string; supportPhone: string; showPoweredBy: boolean; logo: KycFile | null }>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sf = q.data;
  const v = draft ?? (sf ? { en: sf.displayName.en, ar: sf.displayName.ar, ten: sf.tagline.en, tar: sf.tagline.ar, primaryColor: sf.primaryColor, heroColor: sf.heroColor, subdomain: sf.subdomain, supportEmail: sf.supportEmail, supportPhone: sf.supportPhone, showPoweredBy: sf.showPoweredBy, logo: sf.logo } : null);
  const save = useAction(() => api.call('storefront.save', {
    displayName: { en: v!.en, ar: v!.ar }, tagline: { en: v!.ten, ar: v!.tar }, logo: v!.logo, primaryColor: v!.primaryColor, heroColor: v!.heroColor, subdomain: v!.subdomain,
    supportEmail: v!.supportEmail, supportPhone: v!.supportPhone, showPoweredBy: v!.showPoweredBy,
  }), { success: t('saved'), invalidate: KEYS, onSuccess: () => { setDraft(null); setErrors({}); } });
  const publish = useAction((on: boolean) => api.call('storefront.setPublished', { published: on }), { success: (o) => (o.published ? t('publishedToast') : t('unpublishedToast')), invalidate: KEYS });
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!sf || !v) return <Skeleton className="h-96 w-full" />;
  const set = (patch: Partial<NonNullable<typeof v>>) => setDraft({ ...v, ...patch });
  const err = (k: string) => (errors[k] ? (tv.has(errors[k] as never) ? tv(errors[k] as never, { ratio: '' } as never) : errors[k]) : undefined);
  return (
    <>
      <PageHeader title={t('title')} description={t('description')}
        actions={<a href={`/${locale}${sf.urls.path}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline' })} data-testid="open-storefront"><ExternalLink aria-hidden />{t('open')}</a>} />
      <div className="flex flex-col gap-6" data-testid="storefront-settings">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="flex flex-col gap-3 p-5">
            <span className="text-sm font-medium text-fg-muted">{t('status')}</span>
            <Switch checked={sf.published} disabled={!sf.canManage || (!sf.entitled && !sf.published) || publish.isPending} onCheckedChange={(on) => publish.mutate(on)} label={<span className="font-semibold" data-testid="published-label">{sf.published ? t('live') : t('draft')}</span>} />
            {!sf.entitled && <p className="flex items-center gap-1.5 text-xs text-warning"><Lock className="size-3.5" aria-hidden />{t('needsAddon')}</p>}
          </Card>
          <StatCard label={t('customers')} value={sf.stats.customers} icon={<Store />} />
          <StatCard label={t('bookings')} value={sf.stats.bookings} icon={<Globe />} />
          <StatCard label={t('sales')} value={priceOf(sf.stats.salesMinor, 'EGP', locale)} icon={<CheckCircle2 />} />
        </div>
        <Card>
          <CardHeader title={t('addresses')} />
          <CardBody className="grid gap-2 text-sm" dir="ltr">
            <p><span className="text-fg-muted">{t('pathUrl')}:</span> <a className="font-mono text-primary hover:underline" href={`/${locale}${sf.urls.path}`}>{sf.urls.path}</a></p>
            <p><span className="text-fg-muted">{t('subdomainUrl')}:</span> <span className="font-mono">{sf.urls.subdomain}</span> <span className="text-xs text-fg-muted">({t('localPreview')} <a className="text-primary hover:underline" href={`http://${sf.subdomain}.localhost:3001/${locale}`}>{sf.subdomain}.localhost:3001</a>)</span></p>
            {sf.urls.custom && <p><span className="text-fg-muted">{t('customUrl')}:</span> <span className="font-mono">{sf.urls.custom}</span></p>}
          </CardBody>
        </Card>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Card>
            <CardHeader title={t('branding')} description={t('brandingBody')} />
            <CardBody className="grid gap-4 sm:grid-cols-2" data-testid="branding-form">
              <Field label={t('nameEn')} required><Input name="nameEn" value={v.en} disabled={!sf.canManage} onChange={(e) => set({ en: e.target.value })} /></Field>
              <Field label={t('nameAr')} required><Input name="nameAr" dir="rtl" value={v.ar} disabled={!sf.canManage} onChange={(e) => set({ ar: e.target.value })} /></Field>
              <Field label={t('taglineEn')} required><Input name="taglineEn" value={v.ten} disabled={!sf.canManage} onChange={(e) => set({ ten: e.target.value })} /></Field>
              <Field label={t('taglineAr')} required><Input name="taglineAr" dir="rtl" value={v.tar} disabled={!sf.canManage} onChange={(e) => set({ tar: e.target.value })} /></Field>
              {(['primaryColor', 'heroColor'] as const).map((k) => (
                <Field key={k} label={t(k)} help={t(`${k}Help`)} error={err(k)}>
                  <div className="flex items-center gap-2">
                    <input type="color" aria-label={t(k)} value={/^#[0-9a-fA-F]{6}$/.test(v[k]) ? v[k] : '#000000'} disabled={!sf.canManage} onChange={(e) => set({ [k]: e.target.value.toUpperCase() })} className="h-10 w-12 cursor-pointer rounded border border-border bg-surface" />
                    <Input name={k} aria-label={`${t(k)} (hex)`} dir="ltr" className="w-28 font-mono" value={v[k]} disabled={!sf.canManage} onChange={(e) => set({ [k]: e.target.value })} />
                    <ContrastBadge hex={v[k]} />
                  </div>
                </Field>
              ))}
              <Field label={t('subdomain')} error={err('subdomain')} help={`${v.subdomain}.travelta.app`}><Input name="subdomain" dir="ltr" value={v.subdomain} disabled={!sf.canManage} onChange={(e) => set({ subdomain: e.target.value.toLowerCase() })} /></Field>
              <Field label={t('logo')} optional help={v.logo ? v.logo.name : t('logoHelp')}>
                <Input type="file" accept="image/png,image/jpeg" disabled={!sf.canManage} onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const r = await toStoredFile(f); if ('error' in r) toast.error(tv(r.error as never)); else set({ logo: r.file }); }} />
              </Field>
              <Field label={t('supportEmail')}><Input name="supportEmail" dir="ltr" value={v.supportEmail} disabled={!sf.canManage} onChange={(e) => set({ supportEmail: e.target.value })} /></Field>
              <Field label={t('supportPhone')}><Input name="supportPhone" dir="ltr" value={v.supportPhone} disabled={!sf.canManage} onChange={(e) => set({ supportPhone: e.target.value })} /></Field>
              <Switch className="sm:col-span-2" checked={v.showPoweredBy} disabled={!sf.canManage} onCheckedChange={(on) => set({ showPoweredBy: on })} label={t('poweredBy')} />
              {sf.canManage && (
                <div className={cn('flex gap-2 sm:col-span-2')}>
                  <Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={save.isPending} disabled={draft === null} data-testid="storefront-save">{t('save')}</Button>
                  {draft && <Button variant="ghost" onClick={() => { setDraft(null); setErrors({}); }}>{t('discard')}</Button>}
                </div>
              )}
            </CardBody>
          </Card>
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-fg-muted">{t('preview')}</h2>
            <Preview v={{ displayName: locale === 'ar' ? v.ar : v.en, tagline: locale === 'ar' ? v.tar : v.ten, primaryColor: /^#[0-9a-fA-F]{6}$/.test(v.primaryColor) ? v.primaryColor : '#000000', heroColor: /^#[0-9a-fA-F]{6}$/.test(v.heroColor) ? v.heroColor : '#000000' }} logo={v.logo?.dataUrl ?? null} />
          </div>
        </div>
        <DomainCard sf={sf} />
      </div>
    </>
  );
}
