'use client';

import { useQuery } from '@tanstack/react-query';
import { SERVICE_TYPES, type ServiceType } from '@travelta/contracts';
import type { CommercialSettingsEntity, CommercialSettingsInput, RoundingRule } from '@travelta/schemas';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { DemoBadge } from '@/components/feedback/markers';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useAction } from '@/lib/mutations';
import { useCan, useSession } from '@/lib/session';

const num = (v: string) => (v === '' ? 0 : Number(v));

function toInput(s: CommercialSettingsEntity): CommercialSettingsInput {
  const { defaultMarkupPct, platformDefaults, childGuardrails, defaultGuardrail, fxBufferPct, rounding, maxDiscountPctByRole, defaultCreditLimitMinor, payLaterEnabled, cancellationAdminFeeMinor } = s;
  return { defaultMarkupPct, platformDefaults, childGuardrails, defaultGuardrail, fxBufferPct, rounding, maxDiscountPctByRole, defaultCreditLimitMinor, payLaterEnabled, cancellationAdminFeeMinor };
}

/** Commercial settings (PRC-13): platform defaults & limits, or an agency's own defaults for its sub-agencies. */
export function CommercialSettingsForm() {
  const t = useTranslations();
  const api = useApi();
  const isPlatform = useSession((s) => s.session?.organization.type === 'platform');
  const canEdit = useCan(isPlatform ? 'commercial_settings.manage' : 'pricing.manage_rules');
  const settings = useQuery({ queryKey: ['commercialSettings'], queryFn: () => api.call('commercialSettings.get') });
  const [draft, setDraft] = useState<CommercialSettingsInput | null>(null);
  const save = useAction((i: CommercialSettingsInput) => api.call('commercialSettings.update', i), { success: t('pricing.csSaved'), invalidate: [['commercialSettings'], ['pricing']], onSuccess: () => setDraft(null) });

  if (!settings.data) return <Skeleton className="h-96 w-full" />;
  const v = draft ?? toInput(settings.data);
  const set = (patch: Partial<CommercialSettingsInput>) => setDraft({ ...v, ...patch });
  const egp: RoundingRule = v.rounding.EGP ?? { mode: 'none', incrementMinor: 100, charmMinor: null };

  return (
    <Card data-testid="commercial-settings">
      <CardHeader title={t('pricing.csTitle')} description={t('pricing.csDescription')} actions={settings.data.isDemoValue && <DemoBadge />} />
      <CardBody>
        <fieldset disabled={!canEdit} className="grid gap-5">
          {isPlatform && v.platformDefaults && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('pricing.platformApiPct')}><Input type="number" step="0.1" min={0} value={v.platformDefaults.apiPct} onChange={(e) => set({ platformDefaults: { ...v.platformDefaults!, apiPct: num(e.target.value) } })} data-field="apiPct" /></Field>
              <Field label={t('pricing.platformNetworkPct')}><Input type="number" step="0.1" min={0} value={v.platformDefaults.networkPct} onChange={(e) => set({ platformDefaults: { ...v.platformDefaults!, networkPct: num(e.target.value) } })} /></Field>
              <Field label={t('pricing.fxBufferPct')}><Input type="number" step="0.1" min={0} max={10} value={v.fxBufferPct} onChange={(e) => set({ fxBufferPct: num(e.target.value) })} /></Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            {!isPlatform && <Field label={t('pricing.defaultMarkupPct')}><Input type="number" step="0.1" min={0} value={v.defaultMarkupPct} onChange={(e) => set({ defaultMarkupPct: num(e.target.value) })} /></Field>}
            <Field label={t('pricing.guardrailMin')}><Input type="number" step="0.1" min={0} value={v.defaultGuardrail.minPct} onChange={(e) => set({ defaultGuardrail: { ...v.defaultGuardrail, minPct: num(e.target.value) } })} /></Field>
            <Field label={t('pricing.guardrailMax')}><Input type="number" step="0.1" min={0} value={v.defaultGuardrail.maxPct} onChange={(e) => set({ defaultGuardrail: { ...v.defaultGuardrail, maxPct: num(e.target.value) } })} /></Field>
            {!isPlatform && (
              <Field label={`${t('pricing.adminFee')} (EGP)`}><Input type="number" min={0} value={v.cancellationAdminFeeMinor / 100} onChange={(e) => set({ cancellationAdminFeeMinor: Math.round(num(e.target.value) * 100) })} data-field="adminFee" /></Field>
            )}
            {!isPlatform && <div className="flex items-end pb-2"><Switch label={t('pricing.payLater')} checked={v.payLaterEnabled} onCheckedChange={(on) => set({ payLaterEnabled: on })} /></div>}
            {isPlatform && (
              <Field label={`${t('pricing.creditLimit')} (EGP)`}><Input type="number" min={0} value={(v.defaultCreditLimitMinor ?? 0) / 100} onChange={(e) => set({ defaultCreditLimitMinor: Math.round(num(e.target.value) * 100) })} /></Field>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-fg">{t('pricing.perServiceGuardrails')}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SERVICE_TYPES.map((s: ServiceType) => {
                const g = v.childGuardrails[s];
                return (
                  <div key={s} className="rounded-md border border-border p-3">
                    <p className="mb-2 text-xs font-semibold text-fg-muted">{t(`enums.serviceType.${s}`)}</p>
                    <div className="flex items-center gap-2">
                      <Input aria-label={`${t('pricing.guardrailMin')} ${s}`} type="number" min={0} placeholder={String(v.defaultGuardrail.minPct)} value={g?.minPct ?? ''}
                        onChange={(e) => set({ childGuardrails: { ...v.childGuardrails, [s]: e.target.value === '' && !g?.maxPct ? undefined : { minPct: num(e.target.value), maxPct: g?.maxPct ?? v.defaultGuardrail.maxPct } } })} />
                      <span className="text-fg-muted">–</span>
                      <Input aria-label={`${t('pricing.guardrailMax')} ${s}`} type="number" min={0} placeholder={String(v.defaultGuardrail.maxPct)} value={g?.maxPct ?? ''}
                        onChange={(e) => set({ childGuardrails: { ...v.childGuardrails, [s]: { minPct: g?.minPct ?? v.defaultGuardrail.minPct, maxPct: num(e.target.value) } } })} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-fg">{t('pricing.rounding')} (EGP)</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('pricing.roundingMode')}>
                <Select value={egp.mode} onChange={(e) => set({ rounding: { ...v.rounding, EGP: { ...egp, mode: e.target.value as RoundingRule['mode'] } } })}>
                  <option value="none">{t('pricing.roundNone')}</option><option value="up">{t('pricing.roundUp')}</option><option value="nearest">{t('pricing.roundNearest')}</option><option value="down">{t('pricing.roundDown')}</option>
                </Select>
              </Field>
              <Field label={t('pricing.increment')}><Input type="number" min={0.01} step="0.01" value={egp.incrementMinor / 100} onChange={(e) => set({ rounding: { ...v.rounding, EGP: { ...egp, incrementMinor: Math.max(1, Math.round(num(e.target.value) * 100)) } } })} /></Field>
              <Field label={t('pricing.charm')} optional><Input type="number" min={0} max={99} value={egp.charmMinor ?? ''} onChange={(e) => set({ rounding: { ...v.rounding, EGP: { ...egp, charmMinor: e.target.value === '' ? null : num(e.target.value) } } })} /></Field>
            </div>
          </div>
          {canEdit && (
            <div className="flex justify-end gap-2">
              {draft && <Button variant="outline" onClick={() => setDraft(null)}>{t('common.reset')}</Button>}
              <Button disabled={!draft} loading={save.isPending} onClick={() => draft && save.mutate(draft)} data-testid="cs-save">{t('common.save')}</Button>
            </div>
          )}
        </fieldset>
      </CardBody>
    </Card>
  );
}

export function CommercialSettingsPage() {
  const t = useTranslations('pricing');
  return (
    <>
      <PageHeader title={t('csTitle')} description={t('csDescription')} />
      <CommercialSettingsForm />
    </>
  );
}
