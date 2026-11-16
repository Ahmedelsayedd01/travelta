'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { destinationInputSchema, PLACE_KINDS, placeInputSchema, type DestinationEntity, type DestinationInput, type PlaceEntity, type PlaceInput } from '@travelta/schemas';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/feedback/states';
import { MapView, type GeoPoint } from '@/components/map/map-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Sheet } from '@/components/ui/sheet';
import { Tab, Tabs, TabsList, TabsPanel } from '@/components/ui/tabs';
import { takeFieldErrors, useAction } from '@/lib/mutations';
import { useCan } from '@/lib/session';

type Errors = Record<string, string>;
const issuesOf = (issues: { path: PropertyKey[]; message: string }[]): Errors =>
  Object.fromEntries(issues.map((i) => [i.path.map(String).join('.'), i.message]));

/** Platform location management: destinations (map centre, zoom, visibility) and the places shown around hotels. */
export function LocationsPage() {
  const t = useTranslations('locations');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Tabs defaultValue="destinations">
        <TabsList><Tab value="destinations" data-testid="tab-destinations">{t('destinations')}</Tab><Tab value="places" data-testid="tab-places">{t('places')}</Tab></TabsList>
        <TabsPanel value="destinations"><DestinationsTab /></TabsPanel>
        <TabsPanel value="places"><PlacesTab /></TabsPanel>
      </Tabs>
    </>
  );
}

function DestinationsTab() {
  const t = useTranslations('locations');
  const tc = useTranslations('common');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const canManage = useCan('locations.manage');
  const state = useListState({ sort: 'name:asc', pageSize: 20 });
  const result = useQuery({ queryKey: ['reference', 'destinations', 'admin', state.query], queryFn: () => api.call('reference.destinations', state.query), placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<DestinationEntity | 'new' | null>(null);
  const [deleting, setDeleting] = useState<DestinationEntity | null>(null);
  const remove = useAction((id: string) => api.call('destinations.delete', { id }), { success: t('deleted'), invalidate: [['reference'], ['places']], onSuccess: () => setDeleting(null) });
  const toggle = useAction((d: DestinationEntity) => api.call('destinations.save', { ...d, active: !d.active }), { success: t('saved'), invalidate: [['reference']] });
  const columns: Column<DestinationEntity>[] = [
    { key: 'name', header: t('name'), sortKey: 'name', cell: (d) => <div><p className="font-medium">{d.name[locale]}</p><p className="text-xs text-fg-muted">{d.code} · {d.countryIso2}</p></div> },
    { key: 'geo', header: t('coordinates'), hideOnCard: true, cell: (d) => <span className="tabular text-xs" dir="ltr">{d.geo.lat.toFixed(4)}, {d.geo.lng.toFixed(4)}</span> },
    { key: 'popular', header: t('popular'), cell: (d) => (d.popular ? <Badge tone="highlight">{t('popular')}</Badge> : '—') },
    { key: 'status', header: t('status'), cell: (d) => <Badge tone={d.active ? 'success' : 'neutral'} dot>{d.active ? t('active') : t('inactive')}</Badge> },
  ];
  return (
    <>
      <DataTable label={t('destinations')} testId="destinations-table" state={state} result={result} columns={columns} rowKey={(d) => d.id}
        toolbar={canManage && <Button onClick={() => setEditing('new')} data-testid="new-destination"><Plus aria-hidden />{t('newDestination')}</Button>}
        filters={[{ key: 'active', label: t('status'), options: [{ value: 'true', label: t('active') }, { value: 'false', label: t('inactive') }] }]}
        onRowClick={canManage ? (d) => setEditing(d) : undefined}
        rowActions={canManage ? (d) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" aria-label={tc('edit')} onClick={() => setEditing(d)}><Pencil aria-hidden /></Button>
            <Button variant="ghost" size="sm" onClick={() => toggle.mutate(d)} data-testid="toggle-destination">{d.active ? t('deactivate') : t('activate')}</Button>
            <Button variant="ghost" size="sm" className="text-danger" aria-label={tc('delete')} onClick={() => setDeleting(d)}><Trash2 aria-hidden /></Button>
          </div>
        ) : undefined}
        empty={<EmptyState title={t('destinations')} body={t('description')} />} />
      {editing && <DestinationEditor destination={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }} loading={remove.isPending}
        title={t('deleteTitle', { name: deleting?.name[locale] ?? '' })} description={t('deleteDestinationBody')} confirmLabel={tc('delete')}
        onConfirm={() => { if (deleting) remove.mutate(deleting.id); }} />
    </>
  );
}

function GeoFields({ geo, onChange, errors, center, zoom, title }: { geo: GeoPoint | null; onChange: (g: GeoPoint) => void; errors: Errors; center: GeoPoint; zoom: number; title: string }) {
  const tm = useTranslations('maps');
  const num = (v: string) => (v === '' ? Number.NaN : Number(v));
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tm('latitude')} required error={errors['geo.lat'] ?? errors['geo']}><Input name="lat" type="number" step="0.000001" dir="ltr" value={geo && Number.isFinite(geo.lat) ? geo.lat : ''} onChange={(e) => onChange({ lat: num(e.target.value), lng: geo?.lng ?? center.lng })} /></Field>
        <Field label={tm('longitude')} required error={errors['geo.lng']}><Input name="lng" type="number" step="0.000001" dir="ltr" value={geo && Number.isFinite(geo.lng) ? geo.lng : ''} onChange={(e) => onChange({ lat: geo?.lat ?? center.lat, lng: num(e.target.value) })} /></Field>
      </div>
      <p className="text-xs text-fg-muted">{tm('pickOnMap')}</p>
      <MapView center={geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng) ? geo : center} zoom={zoom} label={tm('mapPreview')} className="h-60" testId="location-picker" tilesUnavailableText={tm('tilesUnavailable')}
        markers={geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng) ? [{ id: 'pick', geo, kind: 'pin', title }] : []} onPick={onChange} />
    </>
  );
}

function DestinationEditor({ destination, onClose }: { destination: DestinationEntity | null; onClose: () => void }) {
  const t = useTranslations('locations');
  const tc = useTranslations('common');
  const tv = useTranslations();
  const api = useApi();
  const countries = useQuery({ queryKey: ['reference', 'countries'], queryFn: () => api.call('reference.countries') });
  const [d, setD] = useState<DestinationInput>(destination
    ? { id: destination.id, code: destination.code, name: destination.name, countryIso2: destination.countryIso2, kind: destination.kind, timezone: destination.timezone, popular: destination.popular, geo: destination.geo, zoom: destination.zoom, active: destination.active }
    : { code: '', name: { en: '', ar: '' }, countryIso2: 'EG', kind: 'city', timezone: 'Africa/Cairo', popular: false, geo: { lat: 30.0444, lng: 31.2357 }, zoom: 12, active: true });
  const [errors, setErrors] = useState<Errors>({});
  const save = useAction((input: DestinationInput) => api.call('destinations.save', input), { success: t('saved'), invalidate: [['reference'], ['places']], onSuccess: onClose });
  const msg = (k: string) => (errors[k] ? (tv.has(errors[k] as never) ? tv(errors[k] as never) : errors[k]) : undefined);
  const submit = () => {
    const parsed = destinationInputSchema.safeParse(d);
    if (!parsed.success) { setErrors(issuesOf(parsed.error.issues)); return; }
    setErrors({});
    save.mutate(d, { onError: (err) => { const f = takeFieldErrors(err); if (f) setErrors(f); } });
  };
  const e = Object.fromEntries(Object.keys(errors).map((k) => [k, msg(k)!]));
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} size="lg" title={destination ? t('editDestination') : t('newDestination')}
      footer={<><Button variant="outline" onClick={onClose}>{tc('cancel')}</Button><Button loading={save.isPending} onClick={submit} data-testid="destination-save">{tc('save')}</Button></>}>
      <div className="flex flex-col gap-4" data-testid="destination-editor">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('code')} required error={e.code}><Input name="code" dir="ltr" value={d.code} onChange={(ev) => setD({ ...d, code: ev.target.value.toUpperCase() })} /></Field>
          <Field label={t('country')} required error={e.countryIso2}>
            <Select name="countryIso2" value={d.countryIso2} onChange={(ev) => setD({ ...d, countryIso2: ev.target.value })}>{countries.data?.map((c) => <option key={c.iso2} value={c.iso2}>{c.name.en}</option>)}</Select>
          </Field>
          <Field label={t('nameEn')} required error={e['name.en']}><Input name="nameEn" value={d.name.en} onChange={(ev) => setD({ ...d, name: { ...d.name, en: ev.target.value } })} /></Field>
          <Field label={t('nameAr')} required error={e['name.ar']}><Input name="nameAr" dir="rtl" value={d.name.ar} onChange={(ev) => setD({ ...d, name: { ...d.name, ar: ev.target.value } })} /></Field>
          <Field label={t('timezone')} required error={e.timezone}><Input name="timezone" dir="ltr" value={d.timezone} onChange={(ev) => setD({ ...d, timezone: ev.target.value })} /></Field>
          <Field label={t('zoom')}><Input name="zoom" type="number" min={3} max={18} value={d.zoom} onChange={(ev) => setD({ ...d, zoom: Number(ev.target.value) })} /></Field>
        </div>
        <div className="flex flex-wrap gap-6">
          <Checkbox label={t('popular')} checked={d.popular} onCheckedChange={(v) => setD({ ...d, popular: v })} />
          <Checkbox label={t('active')} checked={d.active} onCheckedChange={(v) => setD({ ...d, active: v })} />
        </div>
        <GeoFields geo={d.geo} onChange={(g) => setD({ ...d, geo: g })} errors={e} center={d.geo} zoom={d.zoom ?? 12} title={d.name.en || t('newDestination')} />
      </div>
    </Sheet>
  );
}

function PlacesTab() {
  const t = useTranslations('locations');
  const tm = useTranslations('maps');
  const tc = useTranslations('common');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const canManage = useCan('locations.manage');
  const destinations = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const [destId, setDestId] = useState<string>('');
  const [kind, setKind] = useState<string>('');
  const dest = destinations.data?.items.find((d) => d.id === destId) ?? destinations.data?.items[0];
  const places = useQuery({ queryKey: ['places', 'admin', dest?.id], enabled: Boolean(dest), queryFn: () => api.call('places.list', { destinationId: dest!.id, includeInactive: true }) });
  const [editing, setEditing] = useState<PlaceEntity | 'new' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PlaceEntity | null>(null);
  const remove = useAction((id: string) => api.call('places.delete', { id }), { success: t('deleted'), invalidate: [['places']], onSuccess: () => setDeleting(null) });
  const rows = (places.data ?? []).filter((p) => !kind || p.kind === kind);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('destination')} className="w-56">
          <Select name="placesDestination" value={dest?.id ?? ''} onChange={(e) => { setDestId(e.target.value); setSelected(null); }}>
            {destinations.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name[locale]}</option>)}
          </Select>
        </Field>
        <Field label={t('kind')} className="w-48">
          <Select name="placesKind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{t('allKinds')}</option>{PLACE_KINDS.map((k) => <option key={k} value={k}>{tm(`kind_${k}`)}</option>)}
          </Select>
        </Field>
        {canManage && dest && <Button className="ms-auto" onClick={() => setEditing('new')} data-testid="new-place"><Plus aria-hidden />{t('newPlace')}</Button>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden p-0">
          {rows.length === 0 ? <EmptyState icon={<MapPin aria-hidden />} title={t('noPlaces')} body={t('placesHelp')} /> : (
            <ul className="divide-y divide-border" data-testid="places-list">
              {rows.map((p) => (
                <li key={p.id} className={`flex items-center gap-3 px-4 py-3 ${selected === p.id ? 'bg-primary-soft/40' : ''}`} data-place-id={p.id}>
                  <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setSelected(p.id)}>
                    <span className="block truncate font-medium text-fg">{p.name[locale]}</span>
                    <span className="block text-xs text-fg-muted">{tm(`kind_${p.kind}`)} · <span dir="ltr" className="tabular">{p.geo.lat.toFixed(4)}, {p.geo.lng.toFixed(4)}</span></span>
                  </button>
                  {!p.active && <Badge>{t('inactive')}</Badge>}
                  {canManage && <>
                    <Button variant="ghost" size="sm" aria-label={`${tc('edit')} ${p.name[locale]}`} onClick={() => setEditing(p)}><Pencil aria-hidden /></Button>
                    <Button variant="ghost" size="sm" className="text-danger" aria-label={`${tc('delete')} ${p.name[locale]}`} onClick={() => setDeleting(p)}><Trash2 aria-hidden /></Button>
                  </>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {dest && (
          <MapView center={dest.geo} zoom={dest.zoom} label={t('placesMap', { name: dest.name[locale] })} className="h-[28rem]" testId="places-map" tilesUnavailableText={tm('tilesUnavailable')}
            selectedId={selected} onSelect={setSelected}
            markers={rows.map((p) => ({ id: p.id, geo: p.geo, kind: 'price' as const, label: `${{ attraction: '★', airport: '✈', transit: '⇄', neighborhood: '◎' }[p.kind]} ${p.name[locale]}`, title: p.name[locale] }))} />
        )}
      </div>
      {editing && dest && <PlaceEditor place={editing === 'new' ? null : editing} destination={dest} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }} loading={remove.isPending}
        title={t('deleteTitle', { name: deleting?.name[locale] ?? '' })} description={t('deletePlaceBody')} confirmLabel={tc('delete')}
        onConfirm={() => { if (deleting) remove.mutate(deleting.id); }} />
    </div>
  );
}

function PlaceEditor({ place, destination, onClose }: { place: PlaceEntity | null; destination: DestinationEntity; onClose: () => void }) {
  const t = useTranslations('locations');
  const tm = useTranslations('maps');
  const tc = useTranslations('common');
  const tv = useTranslations();
  const api = useApi();
  const [p, setP] = useState<PlaceInput>(place
    ? { id: place.id, destinationId: place.destinationId, kind: place.kind, name: place.name, geo: place.geo, active: place.active }
    : { destinationId: destination.id, kind: 'attraction', name: { en: '', ar: '' }, geo: destination.geo, active: true });
  const [errors, setErrors] = useState<Errors>({});
  const save = useAction((input: PlaceInput) => api.call('places.save', input), { success: t('saved'), invalidate: [['places']], onSuccess: onClose });
  const e = Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, tv.has(v as never) ? tv(v as never) : v]));
  const submit = () => {
    const parsed = placeInputSchema.safeParse(p);
    if (!parsed.success) { setErrors(issuesOf(parsed.error.issues)); return; }
    setErrors({});
    save.mutate(p, { onError: (err) => { const f = takeFieldErrors(err); if (f) setErrors(f); } });
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} size="lg" title={place ? t('editPlace') : t('newPlace')} description={destination.name.en}
      footer={<><Button variant="outline" onClick={onClose}>{tc('cancel')}</Button><Button loading={save.isPending} onClick={submit} data-testid="place-save">{tc('save')}</Button></>}>
      <div className="flex flex-col gap-4" data-testid="place-editor">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('kind')}><Select name="kind" value={p.kind} onChange={(ev) => setP({ ...p, kind: ev.target.value as PlaceInput['kind'] })}>{PLACE_KINDS.map((k) => <option key={k} value={k}>{tm(`kind_${k}`)}</option>)}</Select></Field>
          <div className="flex items-end pb-2"><Checkbox label={t('active')} checked={p.active} onCheckedChange={(v) => setP({ ...p, active: v })} /></div>
          <Field label={t('nameEn')} required error={e['name.en']}><Input name="nameEn" value={p.name.en} onChange={(ev) => setP({ ...p, name: { ...p.name, en: ev.target.value } })} /></Field>
          <Field label={t('nameAr')} required error={e['name.ar']}><Input name="nameAr" dir="rtl" value={p.name.ar} onChange={(ev) => setP({ ...p, name: { ...p.name, ar: ev.target.value } })} /></Field>
        </div>
        <GeoFields geo={p.geo} onChange={(g) => setP({ ...p, geo: g })} errors={e} center={destination.geo} zoom={destination.zoom} title={p.name.en || t('newPlace')} />
      </div>
    </Sheet>
  );
}
