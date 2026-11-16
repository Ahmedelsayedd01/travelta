'use client';

import { useQuery } from '@tanstack/react-query';
import type { CartItemDto, ItemDetails, Traveller } from '@travelta/schemas';
import { PASSPORT_SERVICES } from '@travelta/schemas';
import { Copy, FileUp, Star, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useApi } from '@/components/api-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { toStoredFile } from '@/lib/files';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { SelectField } from '@/components/ui/select';

const TITLES: Traveller['title'][] = ['mr', 'mrs', 'ms', 'miss', 'mstr'];

/** Empty travellers matching an item's occupancy (first adult = lead). */
export function blankTravellers(item: Pick<CartItemDto, 'serviceType' | 'occupancy'>): Traveller[] {
  const o = item.occupancy;
  const rooms = item.serviceType === 'hotel' && o.rooms.length > 0;
  const adults = rooms ? o.rooms.reduce((a, r) => a + r.adults, 0) : o.adults;
  const children = rooms ? o.rooms.reduce((a, r) => a + r.childAges.length, 0) : o.children;
  const infants = rooms ? 0 : o.infants;
  const blank = (type: Traveller['type'], lead = false): Traveller => ({
    type, title: type === 'adult' ? 'mr' : 'mstr', firstName: '', lastName: '', dateOfBirth: null, nationalityIso2: null, passportNo: null, passportExpiry: null, mahram: null, lead,
  });
  return [...Array.from({ length: adults }, (_, i) => blank('adult', i === 0)), ...Array.from({ length: children }, () => blank('child')), ...Array.from({ length: infants }, () => blank('infant'))];
}

interface Props {
  index: number;
  item: CartItemDto;
  travellers: Traveller[];
  details: ItemDetails;
  errors: Record<string, string>;
  onChange: (travellers: Traveller[]) => void;
  onDetails: (details: ItemDetails) => void;
  /** Offer to copy names from the previous item when the party is the same size. */
  copyFrom?: Traveller[];
}

/** Per-item traveller & service details (W2 "Per-service booking details captured"). */
export function TravellerFields({ index, item, travellers, details, errors, onChange, onDetails, copyFrom }: Props) {
  const t = useTranslations('checkout');
  const te = useTranslations('enums');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const countries = useQuery({ queryKey: ['reference', 'countries'], queryFn: () => api.call('reference.countries', undefined) });
  const passport = (PASSPORT_SERVICES as readonly string[]).includes(item.serviceType);
  const err = (path: string) => errors[`items.${index}.${path}`];
  const set = (j: number, patch: Partial<Traveller>) => onChange(travellers.map((x, k) => (k === j ? { ...x, ...patch } : patch.lead ? { ...x, lead: false } : x)));
  const sameShape = copyFrom && copyFrom.length === travellers.length && copyFrom.every((c, k) => c.type === travellers[k]!.type);
  const listError = err('travellers');
  // Signed-in storefront customers can fill a traveller from their saved travellers (Account → My travellers).
  const customer = useSession((s) => s.session?.user.userType === 'customer');
  const saved = useQuery({ queryKey: ['account', 'travelers'], enabled: customer, queryFn: () => api.call('travelers.list', undefined) });
  const savedFor = (type: Traveller['type']) => (saved.data ?? []).filter((x) => x.type === type);

  return (
    <div className="flex flex-col gap-4" data-testid="traveller-fields" data-item={item.id}>
      {sameShape && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => onChange(copyFrom!.map((c) => ({ ...c })))}><Copy aria-hidden />{t('copyPrevious')}</Button>
      )}
      {listError && <p role="alert" className="text-sm font-medium text-danger"><ValidationText k={listError} /></p>}
      {travellers.map((tr, j) => (
        <fieldset key={j} className={cn('rounded-lg border p-4', tr.lead ? 'border-primary/50 bg-primary-soft/20' : 'border-border')} data-traveller={j}>
          <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-fg">
            {t('traveller', { n: j + 1 })} <Badge tone="neutral">{te(`paxType.${tr.type}` as never)}</Badge>
            {tr.lead ? <Badge tone="primary"><Star className="size-3" aria-hidden />{t('leadTraveller')}</Badge>
              : tr.type === 'adult' && <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => set(j, { lead: true })}>{t('leadTraveller')}</button>}
          </legend>
          {savedFor(tr.type).length > 0 && (
            <div className="mb-3 max-w-xs">
              <SelectField name={`t${j}saved`} aria-label={t('useSaved')} placeholder={t('useSaved')} value=""
                options={savedFor(tr.type).map((x) => ({ value: x.id, label: `${x.firstName} ${x.lastName}` }))}
                onValueChange={(id) => {
                  const x = saved.data?.find((y) => y.id === id);
                  if (x) set(j, { title: x.title, firstName: x.firstName, lastName: x.lastName, dateOfBirth: x.dateOfBirth, nationalityIso2: x.nationalityIso2, passportNo: x.passportNo, passportExpiry: x.passportExpiry });
                }} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('titleField')}>
              <Select value={tr.title} onChange={(e) => set(j, { title: e.target.value as Traveller['title'] })} name={`t${j}title`}>
                {TITLES.map((x) => <option key={x} value={x}>{t(`title_${x}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('firstName')} required error={err(`travellers.${j}.firstName`)}><Input name={`t${j}first`} value={tr.firstName} onChange={(e) => set(j, { firstName: e.target.value })} autoComplete="off" /></Field>
            <Field label={t('lastName')} required error={err(`travellers.${j}.lastName`)}><Input name={`t${j}last`} value={tr.lastName} onChange={(e) => set(j, { lastName: e.target.value })} autoComplete="off" /></Field>
            {(tr.type !== 'adult' || passport) && (
              <Field label={t('dateOfBirth')} required={tr.type !== 'adult'} error={err(`travellers.${j}.dateOfBirth`)}>
                <Input type="date" name={`t${j}dob`} value={tr.dateOfBirth ?? ''} onChange={(e) => set(j, { dateOfBirth: e.target.value || null })} />
              </Field>
            )}
            {passport && (
              <>
                <Field label={t('nationality')} required error={err(`travellers.${j}.nationalityIso2`)}>
                  <Select name={`t${j}nat`} value={tr.nationalityIso2 ?? ''} onChange={(e) => set(j, { nationalityIso2: e.target.value || null })}>
                    <option value="">—</option>
                    {countries.data?.map((c) => <option key={c.iso2} value={c.iso2}>{c.name[locale]}</option>)}
                  </Select>
                </Field>
                <Field label={t('passportNo')} required error={err(`travellers.${j}.passportNo`)}><Input name={`t${j}passport`} value={tr.passportNo ?? ''} onChange={(e) => set(j, { passportNo: e.target.value.toUpperCase() || null })} dir="ltr" /></Field>
                <Field label={t('passportExpiry')} required error={err(`travellers.${j}.passportExpiry`)}><Input type="date" name={`t${j}pexp`} value={tr.passportExpiry ?? ''} onChange={(e) => set(j, { passportExpiry: e.target.value || null })} /></Field>
              </>
            )}
            {item.serviceType === 'umrah' && tr.type === 'adult' && ['mrs', 'ms', 'miss'].includes(tr.title) && (
              <Field label={t('mahram')} required error={err(`travellers.${j}.mahram`)} className="sm:col-span-2"><Input name={`t${j}mahram`} value={tr.mahram ?? ''} onChange={(e) => set(j, { mahram: e.target.value || null })} /></Field>
            )}
          </div>
        </fieldset>
      ))}
      <ServiceDetails index={index} item={item} details={details} onDetails={onDetails} errors={errors} />
    </div>
  );
}

function ValidationText({ k }: { k: string }) {
  const t = useTranslations();
  return <>{t.has(k as never) ? t(k as never) : k}</>;
}

function ServiceDetails({ index, item, details, onDetails, errors }: Pick<Props, 'index' | 'item' | 'details' | 'onDetails' | 'errors'>) {
  const t = useTranslations('checkout');
  const tv = useTranslations();
  const set = (patch: Partial<ItemDetails>) => onDetails({ ...details, ...patch });
  const err = (path: string) => errors[`items.${index}.details.${path}`];
  const s = item.serviceType;
  return (
    <div className="grid gap-3 rounded-lg border border-dashed border-border-strong p-4 sm:grid-cols-2">
      <p className="text-sm font-semibold text-fg sm:col-span-2">{t('serviceDetails')}</p>
      {(s === 'activity' || s === 'tour') && item.times.length > 0 && (
        <Field label={t('time')} required error={err('time')}>
          <Select name={`d${index}time`} value={details.time ?? ''} onChange={(e) => set({ time: e.target.value || undefined })}>
            <option value="">—</option>{item.times.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        </Field>
      )}
      {(s === 'activity' || s === 'tour') && (
        <Field label={t('language')} optional>
          <Select value={details.language ?? ''} onChange={(e) => set({ language: e.target.value || undefined })}>
            <option value="">—</option><option value="en">English</option><option value="ar">العربية</option><option value="de">Deutsch</option>
          </Select>
        </Field>
      )}
      {(s === 'activity' || s === 'tour' || s === 'transfer') && (
        <Field label={t('pickupPoint')} optional><Input value={details.pickupPoint ?? ''} onChange={(e) => set({ pickupPoint: e.target.value || undefined })} /></Field>
      )}
      {s === 'transfer' && <Field label={t('flightNo')} optional><Input dir="ltr" value={details.flightNo ?? ''} onChange={(e) => set({ flightNo: e.target.value.toUpperCase() || undefined })} /></Field>}
      {s === 'visa' && <Field label={t('appointmentDate')} optional><Input type="date" value={details.appointmentDate ?? ''} onChange={(e) => set({ appointmentDate: e.target.value || undefined })} /></Field>}
      {s === 'umrah' && (
        <Field label={t('occupancy')} optional>
          <Select value={details.occupancy ?? ''} onChange={(e) => set({ occupancy: (e.target.value || undefined) as ItemDetails['occupancy'] })}>
            <option value="">—</option><option value="double">{t('occ_double')}</option><option value="triple">{t('occ_triple')}</option><option value="quad">{t('occ_quad')}</option>
          </Select>
        </Field>
      )}
      {s === 'visa' && (
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm font-medium text-fg">{t('documents')} <span className="text-danger" aria-hidden>*</span></span>
          <div className="flex flex-wrap gap-2">
            {(details.documents ?? []).map((d, k) => (
              <Badge key={`${d.name}-${k}`} tone="info" className="gap-1.5">{d.name}
                <button type="button" aria-label="×" onClick={() => set({ documents: details.documents!.filter((_, m) => m !== k) })}><X className="size-3" aria-hidden /></button>
              </Badge>
            ))}
          </div>
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-fg hover:bg-subtle">
            <FileUp className="size-4" aria-hidden />{t('uploadDocument')}
            <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" data-testid={`visa-doc-${index}`}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const r = await toStoredFile(f);
                if ('file' in r) set({ documents: [...(details.documents ?? []), r.file].slice(0, 5) });
                else toast.error(tv(r.error as never));
              }} />
          </label>
          {err('documents') && <p role="alert" className="text-xs font-medium text-danger">{tv(err('documents') as never)}</p>}
        </div>
      )}
      <Field label={t('specialRequests')} optional className="sm:col-span-2"><Input value={details.specialRequests ?? ''} onChange={(e) => set({ specialRequests: e.target.value || undefined })} /></Field>
    </div>
  );
}
