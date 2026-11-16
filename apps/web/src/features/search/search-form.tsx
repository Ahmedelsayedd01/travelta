'use client';

import { useQuery } from '@tanstack/react-query';
import type { ServiceType } from '@travelta/contracts';
import type { CustomerType, SearchInput } from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import { Minus, Plus, Search, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useApi } from '@/components/api-provider';
import { SERVICE_ICONS } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { cn } from '@/lib/cn';

export const SERVICES: ServiceType[] = ['hotel', 'flight', 'tour', 'activity', 'transfer', 'visa', 'umrah'];
const DEFAULT_DEST: Record<ServiceType, string> = { hotel: 'CAI', flight: 'DXB', tour: 'LXR', activity: 'HRG', transfer: 'HRG', visa: 'DXB', umrah: 'MKX' };
const AIRPORTS = ['CAI', 'LXR', 'ASW', 'HRG', 'SSH', 'JED', 'MED', 'RUH', 'DXB', 'IST'];
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
    serviceType, destinationCode: DEFAULT_DEST[serviceType], from, to: addDays(from, 3), rooms: [{ adults: 2, childAges: [] }],
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

function Stepper({ label, value, min, max, onChange, name }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; name: string }) {
  return (
    <Field label={label}>
      <div className="flex h-10 items-center justify-between rounded-md border border-border-strong bg-surface px-1">
        <button type="button" aria-label={`${label} −`} disabled={value <= min} onClick={() => onChange(value - 1)} className="rounded p-1.5 text-fg-muted hover:bg-subtle disabled:opacity-40"><Minus className="size-4" aria-hidden /></button>
        <output name={name} className="tabular min-w-6 text-center text-sm font-semibold text-fg">{value}</output>
        <button type="button" aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(value + 1)} className="rounded p-1.5 text-fg-muted hover:bg-subtle disabled:opacity-40"><Plus className="size-4" aria-hidden /></button>
      </div>
    </Field>
  );
}

export function SearchForm({ initial, staff, onSearch, busy }: { initial: SearchCriteria; staff: boolean; onSearch: (c: SearchCriteria) => void; busy?: boolean }) {
  const t = useTranslations();
  const ts = useTranslations('search');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const [c, setC] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const destinations = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const countries = useQuery({ queryKey: ['reference', 'countries'], queryFn: () => api.call('reference.countries', undefined) });
  const set = (patch: Partial<SearchCriteria>) => { setError(null); setC((prev) => ({ ...prev, ...patch })); };
  const hotel = c.serviceType === 'hotel';
  const flight = c.serviceType === 'flight';
  const airportName = (code: string) => code === 'JED' ? ts('airportJED') : destinations.data?.items.find((d) => d.code === code)?.name[locale] ?? code;
  const dateLabel = { hotel: ts('checkIn'), flight: ts('departure'), tour: ts('startDate'), activity: ts('date'), transfer: ts('date'), visa: ts('applicationDate'), umrah: ts('departure') }[c.serviceType];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (hotel && c.to <= c.from) return setError(ts('invalidDates'));
    if (flight && c.fromCode === c.toCode) return setError(ts('chooseRoute'));
    onSearch(c);
  };

  return (
    <form onSubmit={submit} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm" data-testid="search-form" noValidate>
      <div role="tablist" aria-label={t('nav.search')} className="flex gap-1 overflow-x-auto border-b border-border bg-subtle/60 px-2 pt-2">
        {SERVICES.map((s) => {
          const Icon = SERVICE_ICONS[s];
          const on = s === c.serviceType;
          return (
            <button key={s} type="button" role="tab" aria-selected={on} data-service={s}
              onClick={() => set({ serviceType: s, destinationCode: DEFAULT_DEST[s] })}
              className={cn('flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
                on ? 'border-primary bg-surface text-primary' : 'border-transparent text-fg-muted hover:text-fg')}>
              <Icon className="size-4" aria-hidden />{t(`enums.serviceType.${s}` as never)}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
        {flight ? (
          <>
            <Field label={ts('fromAirport')} className="lg:col-span-3">
              <Select name="fromCode" value={c.fromCode} onChange={(e) => set({ fromCode: e.target.value })}>{AIRPORTS.map((a) => <option key={a} value={a}>{airportName(a)} ({a})</option>)}</Select>
            </Field>
            <Field label={ts('toAirport')} className="lg:col-span-3">
              <Select name="toCode" value={c.toCode} onChange={(e) => set({ toCode: e.target.value })}>{AIRPORTS.map((a) => <option key={a} value={a}>{airportName(a)} ({a})</option>)}</Select>
            </Field>
          </>
        ) : (
          <Field label={ts('destination')} className={hotel ? 'lg:col-span-3' : 'lg:col-span-6'}>
            <Select name="destination" value={c.destinationCode} onChange={(e) => set({ destinationCode: e.target.value })} disabled={!destinations.data}>
              {destinations.data?.items.map((d) => <option key={d.id} value={d.code}>{d.name[locale]}</option>)}
            </Select>
          </Field>
        )}
        <Field label={dateLabel} className={hotel ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Input type="date" name="from" value={c.from} onChange={(e) => set({ from: e.target.value, ...(hotel && e.target.value >= c.to ? { to: addDays(e.target.value, 1) } : {}) })} />
        </Field>
        {hotel && (
          <Field label={ts('checkOut')} className="lg:col-span-2" error={error === ts('invalidDates') ? error : undefined}>
            <Input type="date" name="to" min={addDays(c.from, 1)} value={c.to} onChange={(e) => set({ to: e.target.value })} />
          </Field>
        )}
        {hotel ? (
          <Field label={ts('nationality')} className="lg:col-span-3" optional>
            <Select name="nationality" value={c.nationalityIso2} onChange={(e) => set({ nationalityIso2: e.target.value })}>
              <option value="">{ts('anyNationality')}</option>
              {countries.data?.map((x) => <option key={x.iso2} value={x.iso2}>{x.name[locale]}</option>)}
            </Select>
          </Field>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:col-span-2 lg:col-span-3">
            <Stepper name="adults" label={ts('adults')} value={c.adults} min={1} max={9} onChange={(n) => set({ adults: n })} />
            <Stepper name="children" label={ts('children')} value={c.children} min={0} max={8} onChange={(n) => set({ children: n })} />
            <Stepper name="infants" label={ts('infants')} value={c.infants} min={0} max={4} onChange={(n) => set({ infants: n })} />
          </div>
        )}
        <Button type="submit" size="lg" loading={busy} className={cn('w-full sm:col-span-2', hotel ? 'lg:col-span-2' : flight ? 'lg:col-span-12 lg:w-auto lg:justify-self-end' : 'lg:col-span-12 lg:w-auto lg:justify-self-end')} data-testid="search-submit">
          <Search aria-hidden />{ts('searchButton')}
        </Button>
      </div>

      {hotel && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3" data-testid="rooms">
          {c.rooms.map((room, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <span className="w-20 pb-2.5 text-sm font-semibold text-fg">{ts('room', { n: i + 1 })}</span>
              <div className="w-32"><Stepper name={`room${i}Adults`} label={ts('adults')} value={room.adults} min={1} max={6}
                onChange={(n) => set({ rooms: c.rooms.map((r, j) => j === i ? { ...r, adults: n } : r) })} /></div>
              <div className="w-32"><Stepper name={`room${i}Children`} label={ts('children')} value={room.childAges.length} min={0} max={4}
                onChange={(n) => set({ rooms: c.rooms.map((r, j) => j === i ? { ...r, childAges: n > r.childAges.length ? [...r.childAges, 6] : r.childAges.slice(0, n) } : r) })} /></div>
              {room.childAges.map((age, k) => (
                <Field key={k} label={ts('childAge', { n: k + 1 })} className="w-28">
                  <Select value={age} onChange={(e) => set({ rooms: c.rooms.map((r, j) => j === i ? { ...r, childAges: r.childAges.map((a, m) => m === k ? Number(e.target.value) : a) } : r) })}>
                    {Array.from({ length: 18 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </Field>
              ))}
              {c.rooms.length > 1 && (
                <Button variant="ghost" size="icon" aria-label={ts('removeRoom')} onClick={() => set({ rooms: c.rooms.filter((_, j) => j !== i) })}><Trash2 aria-hidden /></Button>
              )}
            </div>
          ))}
          {c.rooms.length < 5 && (
            <Button variant="link" size="sm" className="self-start" onClick={() => set({ rooms: [...c.rooms, { adults: 2, childAges: [] }] })}><Plus aria-hidden />{ts('addRoom')}</Button>
          )}
        </div>
      )}

      {(staff || error) && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border bg-subtle/40 px-4 py-3">
          {staff && (
            <>
              <Field label={ts('sellingTo')} className="w-44">
                <Select name="channel" value={c.channel} onChange={(e) => set({ channel: e.target.value as 'b2c' | 'b2b' })}>
                  <option value="b2c">{ts('sellB2c')}</option><option value="b2b">{ts('sellB2b')}</option>
                </Select>
              </Field>
              <Field label={ts('customerType')} className="w-44">
                <Select name="customerType" value={c.customerType} onChange={(e) => set({ customerType: e.target.value as CustomerType })}>
                  {CUSTOMER_TYPES.map((x) => <option key={x} value={x}>{t(`enums.customerType.${x}` as never)}</option>)}
                </Select>
              </Field>
              {!hotel && (
                <Field label={ts('nationality')} className="w-52" optional>
                  <Select name="nationality" value={c.nationalityIso2} onChange={(e) => set({ nationalityIso2: e.target.value })}>
                    <option value="">{ts('anyNationality')}</option>
                    {countries.data?.map((x) => <option key={x.iso2} value={x.iso2}>{x.name[locale]}</option>)}
                  </Select>
                </Field>
              )}
            </>
          )}
          {error && error !== ts('invalidDates') && <p role="alert" className="pb-2 text-sm text-danger">{error}</p>}
        </div>
      )}
    </form>
  );
}
