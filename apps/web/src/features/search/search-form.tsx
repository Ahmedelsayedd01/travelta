'use client';

import { useQuery } from '@tanstack/react-query';
import type { ServiceType } from '@travelta/contracts';
import type { CustomerType, SearchInput } from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import { ArrowLeftRight, Minus, Plus, Search, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useApi } from '@/components/api-provider';
import { SERVICE_ICONS } from '@/components/brand/brand';
import { FormDatePicker, FormSelect } from '@/components/form/form-controls';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useDemoToday } from '@/features/demo/hooks';
import { cn } from '@/lib/cn';
import { AIRPORTS, CATEGORY_CONFIG, PEOPLE_LIMITS, SEARCH_CATEGORIES } from './categories/config';
import { validateSearch } from './categories/schemas';
import { switchCategory } from './categories/switch';

export { switchCategory };

export const SERVICES: ServiceType[] = SEARCH_CATEGORIES;
const CUSTOMER_TYPES: CustomerType[] = ['individual', 'corporate', 'vip'];

export interface SearchCriteria {
  serviceType: ServiceType;
  destinationCode: string;
  from: string;
  to: string;
  rooms: { adults: number; childAges: number[] }[];
  adults: number;
  children: number;
  infants: number;
  fromCode: string;
  toCode: string;
  nationalityIso2: string;
  customerType: CustomerType;
  channel: 'b2c' | 'b2b';
}

export function defaultCriteria(serviceType: ServiceType = 'hotel', today = new Date().toISOString().slice(0, 10)): SearchCriteria {
  const from = addDays(today, 21);
  return {
    serviceType, destinationCode: CATEGORY_CONFIG[serviceType].defaultDestination, from, to: addDays(from, 3), rooms: [{ adults: 2, childAges: [] }],
    adults: 2, children: 0, infants: 0, fromCode: 'CAI', toCode: 'DXB', nationalityIso2: '', customerType: 'individual', channel: 'b2c',
  };
}

/** Criteria → the `search.run` input (destination codes resolved to ids by the caller's destination list). */
export function toSearchInput(c: SearchCriteria, destinationId: string | undefined, staff: boolean): SearchInput {
  const hotel = c.serviceType === 'hotel';
  const flight = c.serviceType === 'flight';
  return {
    serviceType: c.serviceType,
    destinationId: flight ? undefined : destinationId,
    from: c.from,
    to: hotel ? c.to : undefined,
    rooms: hotel ? c.rooms : undefined,
    adults: hotel ? c.rooms.reduce((a, r) => a + r.adults, 0) : c.adults,
    children: hotel ? c.rooms.reduce((a, r) => a + r.childAges.length, 0) : c.children,
    infants: hotel ? 0 : c.infants,
    fromCode: flight ? c.fromCode : undefined,
    toCode: flight ? c.toCode : undefined,
    nationalityIso2: c.nationalityIso2 || undefined,
    customerType: c.customerType,
    channel: staff ? c.channel : undefined,
  };
}

function Stepper({ label, value, min, max, onChange, name, error }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; name: string; error?: string }) {
  const ts = useTranslations('search');
  return (
    <Field label={label} error={error}>
      <div role="group" className={cn('flex h-10 items-center justify-between rounded-md border bg-surface px-1', error ? 'border-danger' : 'border-border-strong')} data-testid={`stepper-${name}`}>
        <button type="button" aria-label={ts('decrease', { label })} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className="rounded p-1.5 text-fg-muted hover:bg-subtle disabled:opacity-40"><Minus className="size-4" aria-hidden /></button>
        <output name={name} aria-live="polite" className="tabular min-w-6 text-center text-sm font-semibold text-fg">{value}</output>
        <button type="button" aria-label={ts('increase', { label })} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className="rounded p-1.5 text-fg-muted hover:bg-subtle disabled:opacity-40"><Plus className="size-4" aria-hidden /></button>
      </div>
    </Field>
  );
}

/**
 * One search form for all seven services. Each category brings its own fields, labels, limits and validation schema
 * (categories/config.ts, categories/schemas.ts). Errors appear after a field is left or the form is submitted, sit
 * next to their field and clear as soon as the value is fixed. Prices always come from the server (`onSearch`).
 */
export function SearchForm({ initial, staff, onSearch, busy, onServiceChange }: {
  initial: SearchCriteria; staff: boolean; onSearch: (c: SearchCriteria) => void; busy?: boolean; onServiceChange?: (s: ServiceType) => void;
}) {
  const t = useTranslations();
  const ts = useTranslations('search');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const today = useDemoToday();
  const [c, setC] = useState(initial);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const destinations = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const countries = useQuery({ queryKey: ['reference', 'countries'], queryFn: () => api.call('reference.countries', undefined) });
  const cfg = CATEGORY_CONFIG[c.serviceType];
  const errors = useMemo(() => validateSearch(c.serviceType, today, c), [c, today]);
  const errorFor = (path: string) => (submitted || touched.has(path) ? errors[path] : undefined);
  const touch = (...paths: string[]) => setTouched((prev) => new Set([...prev, ...paths]));
  const set = (patch: Partial<SearchCriteria>) => setC((prev) => ({ ...prev, ...patch }));
  const minDate = addDays(today, cfg.minLeadDays);
  const maxDate = addDays(today, cfg.maxAheadDays);

  const pick = (s: ServiceType) => {
    if (s === c.serviceType) return;
    setC((prev) => switchCategory(prev, s, today));
    setTouched(new Set());
    setSubmitted(false);
    onServiceChange?.(s);
  };
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // WAI-ARIA tabs: move from the tab that has focus (not necessarily the selected one).
    const focused = (e.target as HTMLElement).closest('[data-service]')?.getAttribute('data-service') as ServiceType | null;
    const i = SERVICES.indexOf(focused ?? c.serviceType);
    const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (dir === undefined) return;
    e.preventDefault();
    const next = SERVICES[(i + (locale === 'ar' ? -dir : dir) + SERVICES.length) % SERVICES.length]!;
    pick(next);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLButtonElement>(`[role=tab][data-service="${next}"]`)?.focus());
  };

  const destinationOptions = (destinations.data?.items ?? [])
    .filter((d) => !cfg.destinations || cfg.destinations.includes(d.code))
    .map((d) => ({ value: d.code, label: d.name[locale], hint: cfg.location === 'visaCountry' ? countries.data?.find((x) => x.iso2 === d.countryIso2)?.name[locale] : undefined }));
  const airportName = (code: string) => (code === 'JED' ? ts('airportJED') : destinations.data?.items.find((d) => d.code === code)?.name[locale] ?? code);
  const airportOptions = AIRPORTS.map((a) => ({ value: a, label: `${airportName(a)} (${a})` }));
  const countryOptions = (countries.data ?? []).map((x) => ({ value: x.iso2, label: x.name[locale] }));
  const nights = cfg.dates === 'range' && c.to > c.from ? Math.round((Date.parse(c.to) - Date.parse(c.from)) / 86_400_000) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    onSearch(c);
  };

  const peopleTitle = ts(`people_${cfg.people}` as never);
  return (
    <form ref={formRef} onSubmit={submit} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm" data-testid="search-form" data-service={c.serviceType} noValidate>
      <div role="tablist" aria-label={t('nav.search')} onKeyDown={onTabKey} className="flex gap-1 overflow-x-auto border-b border-border bg-subtle/60 px-2 pt-2">
        {SERVICES.map((s) => {
          const Icon = SERVICE_ICONS[s];
          const on = s === c.serviceType;
          return (
            <button key={s} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} data-service={s} aria-controls="search-fields"
              onClick={() => pick(s)}
              className={cn('flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors duration-200',
                on ? 'border-primary bg-surface text-primary' : 'border-transparent text-fg-muted hover:bg-surface/60 hover:text-fg')}>
              <Icon className="size-4" aria-hidden />{t(`enums.serviceType.${s}` as never)}
            </button>
          );
        })}
      </div>

      {/* Keyed by category: the fields re-mount with a short fade/slide (disabled by prefers-reduced-motion). */}
      <div key={c.serviceType} id="search-fields" role="tabpanel" className="tv-enter">
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-start">
          {cfg.location === 'route' ? (
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-[1fr_auto_1fr] sm:items-start lg:col-span-6">
              <FormSelect label={ts('fromAirport')} name="fromCode" required value={c.fromCode} options={airportOptions} onValueChange={(v) => set({ fromCode: v })} onBlur={() => touch('fromCode')} error={errorFor('fromCode')} placeholder={ts('chooseAirport')} />
              <Button type="button" variant="ghost" size="icon" className="mt-6 self-start justify-self-center" aria-label={ts('swapRoute')} data-testid="swap-route"
                onClick={() => { set({ fromCode: c.toCode, toCode: c.fromCode }); touch('fromCode', 'toCode'); }}>
                <ArrowLeftRight className="flip-rtl" aria-hidden />
              </Button>
              <FormSelect label={ts('toAirport')} name="toCode" required value={c.toCode} options={airportOptions} onValueChange={(v) => { set({ toCode: v }); touch('toCode'); }} onBlur={() => touch('toCode')} error={errorFor('toCode')} placeholder={ts('chooseAirport')} />
            </div>
          ) : (
            <FormSelect className={cfg.dates === 'range' ? 'lg:col-span-3' : 'lg:col-span-5'} name="destination" required
              label={cfg.location === 'visaCountry' ? ts('travellingTo') : c.serviceType === 'umrah' ? ts('umrahCity') : ts('destination')}
              value={c.destinationCode} options={destinationOptions} disabled={!destinations.data} placeholder={ts('chooseDestination')}
              onValueChange={(v) => set({ destinationCode: v })} onBlur={() => touch('destinationCode')} error={errorFor('destinationCode')} />
          )}

          <FormDatePicker className={cfg.dates === 'range' ? 'lg:col-span-2' : 'lg:col-span-3'} name="from" required label={ts(cfg.dateLabel as never)}
            value={c.from} min={minDate} max={maxDate} placeholder={ts('chooseDate')} error={errorFor('from')}
            onBlur={() => touch('from')}
            onChange={(v) => {
              // Dependent date: keep check-out valid (after check-in, at most 30 nights) and revalidate it.
              const patch: Partial<SearchCriteria> = { from: v };
              if (cfg.dates === 'range' && (c.to <= v || c.to > addDays(v, PEOPLE_LIMITS.maxNights))) patch.to = addDays(v, Math.max(1, nights ?? 1));
              set(patch); touch('from');
            }} />
          {cfg.dates === 'range' && (
            <FormDatePicker className="lg:col-span-2" name="to" required label={ts('checkOut')} value={c.to} rangeStart={c.from}
              min={addDays(c.from, 1)} max={addDays(c.from, PEOPLE_LIMITS.maxNights)} error={errorFor('to')} placeholder={ts('chooseDate')}
              help={nights ? ts('nights', { count: nights }) : undefined}
              onBlur={() => touch('to')} onChange={(v) => { set({ to: v }); touch('to'); }} />
          )}

          {cfg.nationality !== 'hidden' && (
            <FormSelect className="lg:col-span-3" name="nationality" label={ts('nationality')} required={cfg.nationality === 'required'} optional={cfg.nationality === 'optional'}
              value={c.nationalityIso2} placeholder={ts('anyNationality')} error={errorFor('nationalityIso2')}
              options={[...(cfg.nationality === 'optional' ? [{ value: '', label: ts('anyNationality') }] : []), ...countryOptions]}
              onValueChange={(v) => set({ nationalityIso2: v })} onBlur={() => touch('nationalityIso2')}
              help={c.serviceType === 'visa' ? ts('visaNationalityHelp') : undefined} />
          )}

          {cfg.people !== 'rooms' && (
            <fieldset className={cn('grid grid-cols-3 gap-2 sm:col-span-2', cfg.nationality === 'hidden' ? 'lg:col-span-4' : 'lg:col-span-12')} data-testid="people">
              <legend className="sr-only">{peopleTitle}</legend>
              <Stepper name="adults" label={ts('adults')} value={c.adults} min={PEOPLE_LIMITS.adults[0]} max={PEOPLE_LIMITS.adults[1]} onChange={(n) => { set({ adults: n }); touch('adults', 'infants'); }} error={errorFor('adults')} />
              <Stepper name="children" label={ts('children')} value={c.children} min={0} max={PEOPLE_LIMITS.children[1]} onChange={(n) => { set({ children: n }); touch('children'); }} error={errorFor('children')} />
              <Stepper name="infants" label={ts('infants')} value={c.infants} min={0} max={PEOPLE_LIMITS.infants[1]} onChange={(n) => { set({ infants: n }); touch('infants'); }} error={errorFor('infants')} />
            </fieldset>
          )}

          <Button type="submit" size="lg" loading={busy} data-testid="search-submit"
            className={cn('w-full sm:col-span-2 lg:mt-6', cfg.people === 'rooms' ? 'lg:col-span-2' : 'lg:col-span-12 lg:mt-0 lg:w-auto lg:justify-self-end')}>
            <Search aria-hidden />{ts('searchButton')}
          </Button>
        </div>

        {cfg.people === 'rooms' && (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3" data-testid="rooms">
            {c.rooms.map((room, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3">
                <span className="w-20 pb-2.5 text-sm font-semibold text-fg">{ts('room', { n: i + 1 })}</span>
                <div className="w-32"><Stepper name={`room${i}Adults`} label={ts('adults')} value={room.adults} min={PEOPLE_LIMITS.roomAdults[0]} max={PEOPLE_LIMITS.roomAdults[1]}
                  onChange={(n) => set({ rooms: c.rooms.map((r, j) => (j === i ? { ...r, adults: n } : r)) })} /></div>
                <div className="w-32"><Stepper name={`room${i}Children`} label={ts('children')} value={room.childAges.length} min={0} max={PEOPLE_LIMITS.roomChildren[1]}
                  onChange={(n) => set({ rooms: c.rooms.map((r, j) => (j === i ? { ...r, childAges: n > r.childAges.length ? [...r.childAges, 6] : r.childAges.slice(0, n) } : r)) })} /></div>
                {room.childAges.map((age, k) => (
                  <FormSelect key={k} className="w-28" name={`room${i}Child${k}Age`} label={ts('childAge', { n: k + 1 })} value={String(age)}
                    options={Array.from({ length: 18 }, (_, n) => ({ value: String(n), label: ts('years', { count: n }) }))}
                    onValueChange={(v) => set({ rooms: c.rooms.map((r, j) => (j === i ? { ...r, childAges: r.childAges.map((a, m) => (m === k ? Number(v) : a)) } : r)) })} />
                ))}
                {c.rooms.length > 1 && (
                  <Button variant="ghost" size="icon" aria-label={ts('removeRoom')} onClick={() => set({ rooms: c.rooms.filter((_, j) => j !== i) })}><Trash2 aria-hidden /></Button>
                )}
              </div>
            ))}
            {c.rooms.length < PEOPLE_LIMITS.rooms[1] && (
              <Button variant="link" size="sm" className="self-start" onClick={() => set({ rooms: [...c.rooms, { adults: 2, childAges: [] }] })}><Plus aria-hidden />{ts('addRoom')}</Button>
            )}
          </div>
        )}
      </div>

      {staff && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border bg-subtle/40 px-4 py-3">
          <FormSelect className="w-44" name="channel" label={ts('sellingTo')} value={c.channel} onValueChange={(v) => set({ channel: v as 'b2c' | 'b2b' })}
            options={[{ value: 'b2c', label: ts('sellB2c') }, { value: 'b2b', label: ts('sellB2b') }]} />
          <FormSelect className="w-44" name="customerType" label={ts('customerType')} value={c.customerType} onValueChange={(v) => set({ customerType: v as CustomerType })}
            options={CUSTOMER_TYPES.map((x) => ({ value: x, label: t(`enums.customerType.${x}` as never) }))} />
          {cfg.nationality === 'hidden' && (
            <FormSelect className="w-52" name="nationality" label={ts('nationality')} optional value={c.nationalityIso2} onValueChange={(v) => set({ nationalityIso2: v })}
              options={[{ value: '', label: ts('anyNationality') }, ...countryOptions]} />
          )}
        </div>
      )}
      {submitted && Object.keys(errors).length > 0 && (
        <p role="alert" className="border-t border-border bg-danger-bg/50 px-4 py-2 text-sm text-danger" data-testid="search-errors">{ts('fixErrors', { count: Object.keys(errors).length })}</p>
      )}
    </form>
  );
}
