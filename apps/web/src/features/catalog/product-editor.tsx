'use client';

import { useQuery } from '@tanstack/react-query';
import { CURRENCY_CODES, SERVICE_TYPES, type ServiceType } from '@travelta/contracts';
import { MEAL_PLANS, productInputSchema, type ProductDetails, type ProductInput, type RateUnit } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { useApi } from '@/components/api-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { MapView } from '@/components/map/map-view';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';

const L = (en = '', ar = '') => ({ en, ar });
const lines = (v: { en: string; ar: string }[]) => v.map((x) => x.en).join('\n');
const fromLines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => L(x, x));
const csv = (v: string[]) => v.join(', ');
const fromCsv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const toMinorNum = (v: string) => Math.round(Number(v || 0) * 100);
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function defaultDetails(serviceType: ServiceType): ProductDetails {
  switch (serviceType) {
    case 'hotel': return { serviceType, stars: 4, address: '', amenities: ['wifi'], checkIn: '14:00', checkOut: '12:00', geo: null, neighborhood: null };
    case 'flight': return { serviceType, carrier: '', flightNo: '', fromCode: 'CAI', toCode: '', fromCity: L('Cairo', 'القاهرة'), toCity: L(), departTime: '10:00', durationMin: 120, cabin: 'economy', baggageKg: 23 };
    case 'tour': return { serviceType, durationDays: 1, tourType: 'day', itinerary: [], inclusions: [], exclusions: [], transport: 'coach' };
    case 'visa': return { serviceType, countryIso2: 'SA', visaType: 'tourist', processingDays: 5, validityDays: 90, requiredDocs: [] };
    case 'umrah': return { serviceType, season: L('Year-round', 'طوال العام'), makkahHotel: L(), makkahNights: 5, madinahHotel: L(), madinahNights: 3, includesFlight: true, includesVisa: true, includesTransport: true, departureCity: L('Cairo', 'القاهرة') };
    case 'activity': return { serviceType, durationHours: 2, languages: ['en', 'ar'], highlights: [], pickupPoints: [], oldPriceMinor: null, tags: [] };
    case 'transfer': return { serviceType, fromPlace: L(), toPlace: L(), durationMin: 45, mode: 'private' };
  }
}

function defaultUnit(serviceType: ServiceType): RateUnit {
  return {
    id: createId('unit'), name: L(serviceType === 'hotel' ? 'Standard room' : 'Standard', serviceType === 'hotel' ? 'غرفة قياسية' : 'قياسي'), baseNetMinor: 100_000, childNetMinor: null,
    weekendUpliftPct: 0, defaultAllotment: 10, minStay: 1, policy: { nonRefundable: false, rules: [{ daysBefore: 7, feeType: 'percent', value: 0 }, { daysBefore: 0, feeType: 'percent', value: 100 }] },
    mealPlan: serviceType === 'hotel' ? 'BB' : null, maxAdults: serviceType === 'hotel' ? 2 : null, maxChildren: serviceType === 'hotel' ? 1 : null, times: [], weekdays: [],
  };
}

function Section({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div><h3 className="font-semibold text-fg">{title}</h3>{help && <p className="text-sm text-fg-muted">{help}</p>}</div>
      {children}
    </section>
  );
}

/** Product editor for all seven services (the hotel flow follows the "Create new hotel" benchmark: details → location → amenities → rooms & rates → policies). */
export function ProductEditor({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const t = useTranslations();
  const tm = useTranslations('maps');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const sessionOrg = useSession((s) => s.session?.organization);
  const isPlatform = sessionOrg?.type === 'platform';
  const owners = useQuery({ queryKey: ['orgs', 'owners'], enabled: isPlatform, queryFn: () => api.call('orgs.list', { page: 1, pageSize: 100 }) });
  const existing = useQuery({ queryKey: ['catalog', 'product', productId], enabled: productId !== null, queryFn: () => api.call('catalog.get', { id: productId! }) });
  const destinations = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const ownSuppliers = useQuery({ queryKey: ['suppliers', 'own'], enabled: sessionOrg?.type === 'agency', queryFn: () => api.call('suppliers.list', { page: 1, pageSize: 100, filters: { kind: 'own' } }) });
  const profile = useQuery({ queryKey: ['orgs', 'me'], queryFn: () => api.call('orgs.myProfile') });
  const [draft, setDraft] = useState<ProductInput | null>(null);
  // The organization whose rules apply: the session org, or (platform) the product's owner / the owner chosen for a new product.
  const ownerId = isPlatform ? (existing.data?.ownerTenantId ?? draft?.ownerTenantId ?? null) : sessionOrg?.id ?? null;
  const ownerOrg = isPlatform ? owners.data?.items.find((o) => o.id === ownerId) : profile.data;
  const org = isPlatform ? (ownerOrg ? { id: ownerOrg.id, type: ownerOrg.type } : sessionOrg) : sessionOrg;
  const isSupplier = org?.type === 'supplier';
  const orgId = org?.id;
  const orgType = org?.type;
  const hasSession = Boolean(sessionOrg);
  const places = useQuery({ queryKey: ['places', draft?.destinationId], enabled: Boolean(draft?.destinationId), queryFn: () => api.call('places.list', { destinationId: draft!.destinationId, kinds: ['neighborhood'] }) });
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (draft || !hasSession) return;
    if (isPlatform && !productId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time initialisation (draft is null until then)
      setDraft({ source: 'extranet', supplier: { kind: 'own', id: '' }, name: L(), description: L(), destinationId: '', currency: 'EGP', status: 'draft', details: defaultDetails('hotel'), units: [defaultUnit('hotel')], seasons: [], ownerTenantId: '' });
      return;
    }
    if (!orgId) return;
    if (productId && existing.data) {
      const p = existing.data;
      setDraft({ id: p.id, source: p.source === 'manual' ? 'manual' : 'extranet', supplier: p.supplier, name: p.name, description: p.description, destinationId: p.destinationId, currency: p.currency, status: p.status === 'archived' ? 'draft' : p.status, details: p.details, units: p.units, seasons: p.seasons });
    } else if (!productId && profile.data) {
      const serviceType: ServiceType = isSupplier ? (profile.data.serviceTypes[0] ?? 'hotel') : 'hotel';
      setDraft({
        source: 'extranet', supplier: isSupplier ? { kind: 'network', id: orgId } : { kind: 'own', id: orgId }, name: L(), description: L(), destinationId: '',
        currency: orgType === 'supplier' && profile.data.baseCurrency ? profile.data.baseCurrency : 'EGP', status: 'draft', details: defaultDetails(serviceType), units: [defaultUnit(serviceType)], seasons: [],
      });
    }
  }, [draft, orgId, orgType, hasSession, isPlatform, productId, existing.data, profile.data, isSupplier]);

  const save = useAction((input: ProductInput) => api.call('catalog.save', input), { success: t('catalog.saved'), invalidate: [['catalog'], ['search']], onSuccess: onClose });
  /** Platform: choosing the owner sets the supply relationship the server will enforce. */
  const chooseOwner = (id: string) => {
    const o = owners.data?.items.find((x) => x.id === id);
    if (!o || !draft) return;
    const st: ServiceType = o.type === 'supplier' ? (o.serviceTypes.includes(draft.details.serviceType) ? draft.details.serviceType : (o.serviceTypes[0] ?? 'hotel')) : draft.details.serviceType;
    setDraft({ ...draft, ownerTenantId: id, supplier: o.type === 'supplier' ? { kind: 'network', id } : { kind: 'own', id }, source: 'extranet', currency: o.baseCurrency,
      ...(st !== draft.details.serviceType ? { details: defaultDetails(st), units: [defaultUnit(st)] } : {}) });
  };

  if (!draft) return <Sheet open onOpenChange={(o) => !o && onClose()} title="…" size="lg"><Skeleton className="h-96 w-full" /></Sheet>;
  const d = draft.details;
  const set = (patch: Partial<ProductInput>) => setDraft({ ...draft, ...patch });
  const setDetails = (patch: Partial<ProductDetails>) => set({ details: { ...d, ...patch } as ProductDetails });
  const setUnit = (i: number, patch: Partial<RateUnit>) => set({ units: draft.units.map((u, k) => (k === i ? { ...u, ...patch } : u)) });
  const allowedServices = isSupplier ? ((isPlatform ? ownerOrg?.serviceTypes : profile.data?.serviceTypes) ?? []) : [...SERVICE_TYPES];
  const destination = destinations.data?.items.find((x) => x.id === draft.destinationId);
  const hotelGeo = d.serviceType === 'hotel' ? d.geo ?? null : null;

  const submit = () => {
    const parsed = productInputSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors([...new Set(parsed.error.issues.map((i) => `${i.path.join('.')}: ${t.has(i.message as never) ? t(i.message as never) : i.message}`))].slice(0, 6));
      return;
    }
    if (isPlatform && !productId && !draft.ownerTenantId) { setErrors([t('catalog.chooseOwner')]); return; }
    setErrors([]);
    save.mutate(draft);
  };

  const num = (label: string, value: number, onChange: (v: number) => void, step = '1') => (
    <Field label={label}><Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></Field>
  );
  const text = (label: string, value: string, onChange: (v: string) => void, dir?: 'ltr' | 'rtl') => (
    <Field label={label}><Input dir={dir} value={value} onChange={(e) => onChange(e.target.value)} /></Field>
  );
  const area = (label: string, value: string, onChange: (v: string) => void) => (
    <Field className="sm:col-span-2" label={label}><Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} /></Field>
  );

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} size="lg" title={productId ? t('catalog.editProduct') : t('catalog.newProduct')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={submit} data-testid="product-save">{t('common.save')}</Button></>}>
      <div className="flex flex-col gap-8" data-testid="product-editor">
        {errors.length > 0 && <ul role="alert" className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}

        <Section title={t('catalog.basics')}>
          <div className="grid gap-4 sm:grid-cols-2">
            {isPlatform && (
              <Field className="sm:col-span-2" label={t('catalog.owner')} required help={t('catalog.ownerHelp')}>
                <Select name="ownerTenantId" value={ownerId ?? ''} disabled={productId !== null} onChange={(e) => chooseOwner(e.target.value)} data-testid="product-owner">
                  <option value="">—</option>
                  {owners.data?.items.filter((o) => o.type !== 'platform').map((o) => <option key={o.id} value={o.id}>{o.name[locale]} · {t(`enums.orgType.${o.type}` as never)}</option>)}
                </Select>
              </Field>
            )}
            <Field label={t('catalog.service')}>
              <Select value={d.serviceType} disabled={productId !== null} name="serviceType"
                onChange={(e) => { const st = e.target.value as ServiceType; set({ details: defaultDetails(st), units: [defaultUnit(st)] }); }}>
                {allowedServices.map((s) => <option key={s} value={s}>{t(`enums.serviceType.${s}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('catalog.status')}>
              <Select value={draft.status} onChange={(e) => set({ status: e.target.value as ProductInput['status'] })}>
                <option value="draft">{t('catalog.statusDraft')}</option><option value="live">{t('catalog.statusLive')}</option><option value="paused">{t('catalog.statusPaused')}</option>
              </Select>
            </Field>
            <Field label={t('catalog.nameEn')} required><Input name="nameEn" value={draft.name.en} onChange={(e) => set({ name: { ...draft.name, en: e.target.value } })} /></Field>
            <Field label={t('catalog.nameAr')} required><Input name="nameAr" dir="rtl" value={draft.name.ar} onChange={(e) => set({ name: { ...draft.name, ar: e.target.value } })} /></Field>
            <Field label={t('catalog.destination')} required>
              <Select name="destinationId" value={draft.destinationId} onChange={(e) => set({ destinationId: e.target.value })}>
                <option value="">—</option>{destinations.data?.items.map((x) => <option key={x.id} value={x.id}>{x.name[locale]}</option>)}
              </Select>
            </Field>
            <Field label={t('catalog.currency')}><Select value={draft.currency} onChange={(e) => set({ currency: e.target.value as ProductInput['currency'] })}>{CURRENCY_CODES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            {!isSupplier && !isPlatform && (
              <>
                <Field label={t('catalog.supplier')}>
                  <Select value={draft.supplier.id} onChange={(e) => set({ supplier: { kind: 'own', id: e.target.value } })}>
                    <option value={org!.id}>{t('catalog.directContract')}</option>
                    {ownSuppliers.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name[locale]}</option>)}
                  </Select>
                </Field>
                <Field label={t('catalog.source')}>
                  <Select value={draft.source} onChange={(e) => set({ source: e.target.value as 'extranet' | 'manual' })}>
                    <option value="extranet">{t('enums.inventorySource.extranet')}</option><option value="manual">{t('enums.inventorySource.manual')}</option>
                  </Select>
                </Field>
              </>
            )}
            <Field className="sm:col-span-2" label={t('catalog.descEn')}><Textarea rows={2} name="descEn" value={draft.description.en} onChange={(e) => set({ description: { ...draft.description, en: e.target.value } })} /></Field>
            <Field className="sm:col-span-2" label={t('catalog.descAr')}><Textarea rows={2} dir="rtl" name="descAr" value={draft.description.ar} onChange={(e) => set({ description: { ...draft.description, ar: e.target.value } })} /></Field>
          </div>
        </Section>

        <Section title={t('catalog.serviceDetails')}>
          <div className="grid gap-4 sm:grid-cols-2">
            {d.serviceType === 'hotel' && (<>
              {num(t('catalog.stars'), d.stars, (v) => setDetails({ stars: Math.min(5, Math.max(1, v)) }))}
              {text(t('catalog.address'), d.address, (v) => setDetails({ address: v }))}
              {text(t('catalog.checkIn'), d.checkIn, (v) => setDetails({ checkIn: v }), 'ltr')}
              {text(t('catalog.checkOut'), d.checkOut, (v) => setDetails({ checkOut: v }), 'ltr')}
              {text(t('catalog.amenities'), csv(d.amenities), (v) => setDetails({ amenities: fromCsv(v) }), 'ltr')}
            </>)}
          </div>
          {d.serviceType === 'hotel' && (
            <div className="flex flex-col gap-4 rounded-lg border border-border p-4" data-testid="hotel-location-editor">
              <h4 className="text-sm font-semibold text-fg">{tm('location')}</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('catalog.country')}><Input readOnly value={destination ? `${destination.countryIso2} · ${destination.name[locale]}` : '—'} /></Field>
                <Field label={tm('neighborhood')} optional>
                  <Select name="neighborhood" value={d.neighborhood ?? ''} onChange={(e) => setDetails({ neighborhood: e.target.value || null })}>
                    <option value="">—</option>
                    {places.data?.map((p) => <option key={p.id} value={p.name.en}>{p.name[locale]}</option>)}
                  </Select>
                </Field>
                <Field label={tm('latitude')}><Input name="lat" type="number" step="0.000001" min={-90} max={90} dir="ltr" value={hotelGeo?.lat ?? ''}
                  onChange={(e) => setDetails({ geo: e.target.value === '' ? null : { lat: Number(e.target.value), lng: hotelGeo?.lng ?? destination?.geo.lng ?? 0 } })} /></Field>
                <Field label={tm('longitude')}><Input name="lng" type="number" step="0.000001" min={-180} max={180} dir="ltr" value={hotelGeo?.lng ?? ''}
                  onChange={(e) => setDetails({ geo: e.target.value === '' ? null : { lat: hotelGeo?.lat ?? destination?.geo.lat ?? 0, lng: Number(e.target.value) } })} /></Field>
              </div>
              {destination ? (
                <>
                  <p className="text-xs text-fg-muted">{tm('pickOnMap')}</p>
                  <MapView center={hotelGeo ?? destination.geo} zoom={hotelGeo ? 15 : destination.zoom} label={tm('mapPreview')} className="h-64" testId="location-picker" tilesUnavailableText={tm('tilesUnavailable')}
                    markers={hotelGeo ? [{ id: 'hotel', geo: hotelGeo, kind: 'pin', title: draft.name[locale] || tm('location') }] : []}
                    onPick={(g) => setDetails({ geo: g })} />
                  {!hotelGeo && <Button variant="outline" size="sm" className="self-start" onClick={() => setDetails({ geo: destination.geo })} data-testid="use-centre">{tm('useCentre')}</Button>}
                </>
              ) : <p className="text-sm text-fg-muted">{t('catalog.pickDestinationFirst')}</p>}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {d.serviceType === 'flight' && (<>
              {text(t('catalog.carrier'), d.carrier, (v) => setDetails({ carrier: v }))}
              {text(t('catalog.flightNo'), d.flightNo, (v) => setDetails({ flightNo: v }), 'ltr')}
              {text(t('catalog.fromCode'), d.fromCode, (v) => setDetails({ fromCode: v.toUpperCase() }), 'ltr')}
              {text(t('catalog.toCode'), d.toCode, (v) => setDetails({ toCode: v.toUpperCase() }), 'ltr')}
              {text(`${t('catalog.fromPlace')} (EN)`, d.fromCity.en, (v) => setDetails({ fromCity: { ...d.fromCity, en: v } }))}
              {text(`${t('catalog.toPlace')} (EN)`, d.toCity.en, (v) => setDetails({ toCity: { en: v, ar: d.toCity.ar || v } }))}
              {text(t('catalog.departTime'), d.departTime, (v) => setDetails({ departTime: v }), 'ltr')}
              {num(t('catalog.durationMin'), d.durationMin, (v) => setDetails({ durationMin: v }))}
              <Field label={t('catalog.cabin')}><Select value={d.cabin} onChange={(e) => setDetails({ cabin: e.target.value as 'economy' | 'business' })}><option value="economy">Economy</option><option value="business">Business</option></Select></Field>
              {num(t('catalog.baggage'), d.baggageKg, (v) => setDetails({ baggageKg: v }))}
            </>)}
            {d.serviceType === 'tour' && (<>
              {num(t('catalog.durationDays'), d.durationDays, (v) => setDetails({ durationDays: Math.max(1, v), tourType: v > 1 ? 'multi_day' : 'day' }))}
              {text(t('catalog.transport'), d.transport, (v) => setDetails({ transport: v }))}
              {area(t('catalog.itinerary'), lines(d.itinerary), (v) => setDetails({ itinerary: fromLines(v) }))}
              {area(t('catalog.inclusions'), lines(d.inclusions), (v) => setDetails({ inclusions: fromLines(v) }))}
              {area(t('catalog.exclusions'), lines(d.exclusions), (v) => setDetails({ exclusions: fromLines(v) }))}
            </>)}
            {d.serviceType === 'visa' && (<>
              {text(t('catalog.country'), d.countryIso2, (v) => setDetails({ countryIso2: v.toUpperCase().slice(0, 2) }), 'ltr')}
              <Field label={t('catalog.visaType')}><Select value={d.visaType} onChange={(e) => setDetails({ visaType: e.target.value as 'tourist' })}>{['tourist', 'business', 'umrah', 'transit'].map((v) => <option key={v}>{v}</option>)}</Select></Field>
              {num(t('catalog.processingDays'), d.processingDays, (v) => setDetails({ processingDays: v }))}
              {num(t('catalog.validityDays'), d.validityDays, (v) => setDetails({ validityDays: v }))}
              {area(t('catalog.requiredDocs'), lines(d.requiredDocs), (v) => setDetails({ requiredDocs: fromLines(v) }))}
            </>)}
            {d.serviceType === 'umrah' && (<>
              {text(t('catalog.makkahHotel'), d.makkahHotel.en, (v) => setDetails({ makkahHotel: { en: v, ar: d.makkahHotel.ar || v } }))}
              {num(t('catalog.makkahNights'), d.makkahNights, (v) => setDetails({ makkahNights: v }))}
              {text(t('catalog.madinahHotel'), d.madinahHotel.en, (v) => setDetails({ madinahHotel: { en: v, ar: d.madinahHotel.ar || v } }))}
              {num(t('catalog.madinahNights'), d.madinahNights, (v) => setDetails({ madinahNights: v }))}
              <Checkbox checked={d.includesFlight} onCheckedChange={(v) => setDetails({ includesFlight: v })} label={t('catalog.includesFlight')} />
              <Checkbox checked={d.includesVisa} onCheckedChange={(v) => setDetails({ includesVisa: v })} label={t('catalog.includesVisa')} />
              <Checkbox checked={d.includesTransport} onCheckedChange={(v) => setDetails({ includesTransport: v })} label={t('catalog.includesTransport')} />
            </>)}
            {d.serviceType === 'activity' && (<>
              {num(t('catalog.durationHours'), d.durationHours, (v) => setDetails({ durationHours: Math.max(0.5, v) }), '0.5')}
              {text(t('catalog.languages'), csv(d.languages), (v) => setDetails({ languages: fromCsv(v) }), 'ltr')}
              {text(t('catalog.pickupPoints'), csv(d.pickupPoints), (v) => setDetails({ pickupPoints: fromCsv(v) }))}
              {area(t('catalog.highlights'), lines(d.highlights), (v) => setDetails({ highlights: fromLines(v) }))}
            </>)}
            {d.serviceType === 'transfer' && (<>
              {text(t('catalog.fromPlace'), d.fromPlace.en, (v) => setDetails({ fromPlace: { en: v, ar: d.fromPlace.ar || v } }))}
              {text(t('catalog.toPlace'), d.toPlace.en, (v) => setDetails({ toPlace: { en: v, ar: d.toPlace.ar || v } }))}
              {num(t('catalog.durationMin'), d.durationMin, (v) => setDetails({ durationMin: v }))}
              <Field label={t('catalog.transferMode')}><Select value={d.mode} onChange={(e) => setDetails({ mode: e.target.value as 'private' | 'shared_bus' })}><option value="private">{t('catalog.private')}</option><option value="shared_bus">{t('catalog.sharedBus')}</option></Select></Field>
            </>)}
          </div>
        </Section>

        <Section title={t('catalog.unitsTitle')} help={t('catalog.unitsHelp')}>
          {draft.units.map((u, i) => (
            <Card key={u.id} className="flex flex-col gap-4 p-4" data-unit-index={i}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('catalog.unitNameEn')} required><Input name={`unit${i}NameEn`} value={u.name.en} onChange={(e) => setUnit(i, { name: { ...u.name, en: e.target.value } })} /></Field>
                <Field label={t('catalog.unitNameAr')} required><Input dir="rtl" name={`unit${i}NameAr`} value={u.name.ar} onChange={(e) => setUnit(i, { name: { ...u.name, ar: e.target.value } })} /></Field>
                <Field label={`${t('catalog.baseNet')} (${draft.currency})`}><Input name={`unit${i}Net`} type="number" step="0.01" min={0} value={u.baseNetMinor / 100} onChange={(e) => setUnit(i, { baseNetMinor: toMinorNum(e.target.value) })} /></Field>
                <Field label={`${t('catalog.childNet')} (${draft.currency})`} optional><Input type="number" step="0.01" min={0} value={u.childNetMinor === null ? '' : u.childNetMinor / 100} onChange={(e) => setUnit(i, { childNetMinor: e.target.value === '' ? null : toMinorNum(e.target.value) })} /></Field>
                <Field label={t('catalog.weekendUplift')}><Input type="number" min={0} max={200} value={u.weekendUpliftPct} onChange={(e) => setUnit(i, { weekendUpliftPct: Number(e.target.value) })} /></Field>
                <Field label={t('catalog.allotment')}><Input type="number" min={0} value={u.defaultAllotment} onChange={(e) => setUnit(i, { defaultAllotment: Number(e.target.value) })} /></Field>
                {d.serviceType === 'hotel' && (<>
                  <Field label={t('catalog.mealPlan')}><Select value={u.mealPlan ?? 'RO'} onChange={(e) => setUnit(i, { mealPlan: e.target.value as RateUnit['mealPlan'] })}>{MEAL_PLANS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
                  <Field label={t('catalog.minStay')}><Input type="number" min={1} max={30} value={u.minStay} onChange={(e) => setUnit(i, { minStay: Math.max(1, Number(e.target.value)) })} /></Field>
                  <Field label={t('catalog.maxAdults')}><Input type="number" min={1} max={12} value={u.maxAdults ?? 2} onChange={(e) => setUnit(i, { maxAdults: Number(e.target.value) })} /></Field>
                  <Field label={t('catalog.maxChildren')}><Input type="number" min={0} max={8} value={u.maxChildren ?? 0} onChange={(e) => setUnit(i, { maxChildren: Number(e.target.value) })} /></Field>
                </>)}
                {d.serviceType !== 'hotel' && <Field className="sm:col-span-2" label={t('catalog.times')} optional><Input dir="ltr" value={csv(u.times)} onChange={(e) => setUnit(i, { times: fromCsv(e.target.value).filter((x) => /^\d{2}:\d{2}$/.test(x)) })} /></Field>}
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-fg">{t('catalog.weekdays')} <span className="text-xs text-fg-muted">({u.weekdays.length === 0 ? t('catalog.everyDay') : u.weekdays.length})</span></legend>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_LABELS.map((w, wd) => {
                    const on = u.weekdays.includes(wd);
                    return <button key={w} type="button" aria-pressed={on} onClick={() => setUnit(i, { weekdays: on ? u.weekdays.filter((x) => x !== wd) : [...u.weekdays, wd].sort() })}
                      className={cn('rounded-md border px-2.5 py-1 text-xs font-medium', on ? 'border-primary bg-primary text-on-primary' : 'border-border-strong text-fg hover:bg-subtle')}>{w}</button>;
                  })}
                </div>
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-fg">{t('catalog.policy')}</legend>
                <Checkbox checked={u.policy.nonRefundable} onCheckedChange={(v) => setUnit(i, { policy: { ...u.policy, nonRefundable: v } })} label={t('catalog.nonRefundable')} />
                {!u.policy.nonRefundable && u.policy.rules.map((r, k) => (
                  <div key={k} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                    <Field label={t('catalog.daysBefore')}><Input type="number" min={0} value={r.daysBefore} onChange={(e) => setUnit(i, { policy: { ...u.policy, rules: u.policy.rules.map((x, j) => (j === k ? { ...x, daysBefore: Number(e.target.value) } : x)) } })} /></Field>
                    <Field label={t('catalog.feeType')}><Select value={r.feeType} onChange={(e) => setUnit(i, { policy: { ...u.policy, rules: u.policy.rules.map((x, j) => (j === k ? { ...x, feeType: e.target.value as 'percent' } : x)) } })}><option value="percent">{t('catalog.feePercent')}</option><option value="fixed">{t('catalog.feeFixed')}</option><option value="nights">{t('catalog.feeNights')}</option></Select></Field>
                    <Field label={t('catalog.feeValue')}><Input type="number" min={0} value={r.value} onChange={(e) => setUnit(i, { policy: { ...u.policy, rules: u.policy.rules.map((x, j) => (j === k ? { ...x, value: Number(e.target.value) } : x)) } })} /></Field>
                    <Button variant="ghost" size="icon" aria-label={t('catalog.removeUnit')} onClick={() => setUnit(i, { policy: { ...u.policy, rules: u.policy.rules.filter((_, j) => j !== k) } })}><Trash2 aria-hidden /></Button>
                  </div>
                ))}
                {!u.policy.nonRefundable && <Button variant="link" size="sm" className="self-start" onClick={() => setUnit(i, { policy: { ...u.policy, rules: [...u.policy.rules, { daysBefore: 0, feeType: 'percent', value: 100 }] } })}><Plus aria-hidden />{t('catalog.addPolicyRule')}</Button>}
              </fieldset>
              {draft.units.length > 1 && <Button variant="ghost" size="sm" className="self-end text-danger" onClick={() => set({ units: draft.units.filter((_, k) => k !== i) })}><Trash2 aria-hidden />{t('catalog.removeUnit')}</Button>}
            </Card>
          ))}
          <Button variant="outline" className="self-start" onClick={() => set({ units: [...draft.units, defaultUnit(d.serviceType)] })}><Plus aria-hidden />{t('catalog.addUnit')}</Button>
        </Section>

        <Section title={t('catalog.seasons')}>
          {draft.seasons.map((s, k) => (
            <div key={k} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <Field label={t('catalog.seasonName')}><Input value={s.name} onChange={(e) => set({ seasons: draft.seasons.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} /></Field>
              <Field label={t('catalog.from')}><Input type="date" value={s.from} onChange={(e) => set({ seasons: draft.seasons.map((x, j) => (j === k ? { ...x, from: e.target.value } : x)) })} /></Field>
              <Field label={t('catalog.to')}><Input type="date" value={s.to} onChange={(e) => set({ seasons: draft.seasons.map((x, j) => (j === k ? { ...x, to: e.target.value } : x)) })} /></Field>
              <Field label={t('catalog.uplift')}><Input type="number" value={s.upliftPct} onChange={(e) => set({ seasons: draft.seasons.map((x, j) => (j === k ? { ...x, upliftPct: Number(e.target.value) } : x)) })} /></Field>
              <Button variant="ghost" size="icon" aria-label={t('catalog.removeUnit')} onClick={() => set({ seasons: draft.seasons.filter((_, j) => j !== k) })}><Trash2 aria-hidden /></Button>
            </div>
          ))}
          <Button variant="outline" className="self-start" onClick={() => set({ seasons: [...draft.seasons, { name: 'Peak', from: new Date().toISOString().slice(0, 10), to: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), upliftPct: 20 }] })}><Plus aria-hidden />{t('catalog.addSeason')}</Button>
        </Section>
      </div>
    </Sheet>
  );
}
