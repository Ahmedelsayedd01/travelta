'use client';

import type { ServiceType } from '@travelta/contracts';
import type { SearchResult } from '@travelta/schemas';
import { SERVICE_IMAGES } from '@travelta/shared';
import { BadgeCheck, Bus, CalendarClock, Car, Clock, FileText, Languages, MapPin, Plane, PlaneTakeoff, Star, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ProductThumb } from '@/components/brand/product-thumb';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/navigation';
import { priceOf } from '../format';

type L = 'en' | 'ar';
const hm = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
const addMinutes = (time: string, min: number) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const total = h * 60 + m + min;
  return { time: `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`, nextDay: total >= 24 * 60 };
};

/**
 * Category cards. Each category shows the information a traveller compares for that service — hotels: stars,
 * location, amenities, price per night; flights: airline, times, airports, duration, stops; visas: processing,
 * validity, documents; and so on — with the product's own service photo. Data is a `search.run` result.
 */
function Shell({ r, href, index, children, price, priceNote, badge, testId }: {
  r: SearchResult; href: string; index: number; children: ReactNode; price: string; priceNote: string; badge?: ReactNode; testId: string;
}) {
  const ts = useTranslations('search');
  const list = SERVICE_IMAGES[r.serviceType];
  return (
    <Link href={href} className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs transition-shadow hover:shadow-md focus-visible:outline-offset-2"
      data-testid={testId} data-service={r.serviceType}>
      <div className="relative">
        <ProductThumb serviceType={r.serviceType} seed={r.imageSeed} image={list[index % list.length]} className="aspect-[16/10] w-full rounded-none" sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw" />
        {badge && <span className="absolute end-2 top-2">{badge}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {children}
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-border pt-3">
          <span className="text-xs text-fg-muted">{priceNote}</span>
          <span className="text-end"><span className="block text-[11px] text-fg-muted">{ts('from')}</span><span className="tabular text-lg font-bold text-fg" data-testid="card-price">{price}</span></span>
        </div>
      </div>
    </Link>
  );
}

const Meta = ({ icon: Icon, children }: { icon: typeof Clock; children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted"><Icon className="size-4 shrink-0" aria-hidden />{children}</span>
);
const Rating = ({ r }: { r: SearchResult }) => {
  const ts = useTranslations('search');
  return <span className="inline-flex items-center gap-1 text-xs text-fg-muted"><Star className="size-3.5 fill-highlight text-highlight" aria-hidden /><span className="tabular font-semibold text-fg">{r.rating.toFixed(1)}</span>· {ts('reviews', { count: r.reviews })}</span>;
};

function HotelCard({ r, href, index }: { r: SearchResult; href: string; index: number }) {
  const ts = useTranslations('search');
  const tc = useTranslations('cards');
  const locale = useLocale() as L;
  const d = r.details.serviceType === 'hotel' ? r.details : null;
  const o = r.cheapest;
  const perNight = o.nights > 0 ? Math.round(o.priceMinor / o.nights) : o.priceMinor;
  return (
    <Shell r={r} href={href} index={index} testId="category-card" price={priceOf(perNight, o.currency, locale)} priceNote={tc('perNightTotal', { total: priceOf(o.priceMinor, o.currency, locale), nights: o.nights })}
      badge={o.available <= 5 ? <Badge tone="warning">{ts('available', { count: o.available })}</Badge> : undefined}>
      <div className="flex items-center gap-0.5 text-highlight" role="img" aria-label={tc('stars', { n: d?.stars ?? 0 })}>{Array.from({ length: d?.stars ?? 0 }, (_, i) => <Star key={i} className="size-3.5 fill-current" aria-hidden />)}</div>
      <h3 className="line-clamp-2 font-semibold text-fg">{r.name[locale]}</h3>
      <Meta icon={MapPin}>{[d?.neighborhood, r.destinationName[locale]].filter(Boolean).join(', ')}{r.distanceKm !== null ? ` · ${tc('kmCentre', { km: r.distanceKm })}` : ''}</Meta>
      <Rating r={r} />
      <ul className="flex flex-wrap gap-1" aria-label={tc('amenities')}>{(d?.amenities ?? []).slice(0, 4).map((a) => <li key={a}><Badge>{tc.has(`amenity_${a}` as never) ? tc(`amenity_${a}` as never) : a}</Badge></li>)}</ul>
      <div className="flex flex-wrap gap-1">{o.refundable ? <Badge tone="success">{ts('refundable')}</Badge> : <Badge>{ts('nonRefundable')}</Badge>}{o.mealPlan && <Badge tone="info">{ts(`meal_${o.mealPlan}`)}</Badge>}</div>
    </Shell>
  );
}

function FlightCard({ r, href, index }: { r: SearchResult; href: string; index: number }) {
  const tc = useTranslations('cards');
  const locale = useLocale() as L;
  const d = r.details.serviceType === 'flight' ? r.details : null;
  const o = r.cheapest;
  if (!d) return null;
  const arrive = addMinutes(d.departTime, d.durationMin);
  return (
    <Shell r={r} href={href} index={index} testId="category-card" price={priceOf(o.priceMinor, o.currency, locale)} priceNote={tc('travellersTotal', { n: o.quantity })}
      badge={<Badge tone="primary">{tc(`cabin_${d.cabin}` as never)}</Badge>}>
      <p className="flex items-center gap-2 text-sm font-semibold text-fg"><Plane className="size-4 text-primary" aria-hidden />{d.carrier} <span className="font-normal text-fg-muted">{d.flightNo}</span></p>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2" dir="ltr" data-testid="flight-times">
        <span><span className="tabular block text-xl font-bold text-fg">{d.departTime}</span><span className="text-xs font-semibold text-fg-muted">{d.fromCode}</span></span>
        <span className="flex flex-col items-center text-[11px] text-fg-muted"><span>{hm(d.durationMin)}</span><span className="my-1 h-px w-full bg-border-strong" aria-hidden /><span>{tc('nonstop')}</span></span>
        <span className="text-end"><span className="tabular block text-xl font-bold text-fg">{arrive.time}{arrive.nextDay && <sup className="ms-0.5 text-xs text-warning">+1</sup>}</span><span className="text-xs font-semibold text-fg-muted">{d.toCode}</span></span>
      </div>
      <p className="text-sm text-fg-muted">{d.fromCity[locale]} → {d.toCity[locale]}</p>
      <div className="flex flex-wrap gap-1"><Badge>{tc('baggage', { kg: d.baggageKg })}</Badge>{o.refundable ? <Badge tone="success">{tc('refundable')}</Badge> : <Badge>{tc('nonRefundable')}</Badge>}</div>
    </Shell>
  );
}

function TourCard({ r, href, index }: { r: SearchResult; href: string; index: number }) {
  const tc = useTranslations('cards');
  const locale = useLocale() as L;
  const d = r.details.serviceType === 'tour' ? r.details : null;
  const o = r.cheapest;
  if (!d) return null;
  return (
    <Shell r={r} href={href} index={index} testId="category-card" price={priceOf(o.priceMinor, o.currency, locale)} priceNote={tc('travellersTotal', { n: o.quantity })}
      badge={<Badge tone="primary">{tc(`tour_${d.tourType}` as never)}</Badge>}>
      <h3 className="line-clamp-2 font-semibold text-fg">{r.name[locale]}</h3>
      <div className="flex flex-wrap gap-x-4 gap-y-1"><Meta icon={MapPin}>{r.destinationName[locale]}</Meta><Meta icon={CalendarClock}>{tc('days', { n: d.durationDays })}</Meta></div>
      <Rating r={r} />
      <ul className="flex flex-col gap-1 text-sm text-fg" aria-label={tc('highlights')}>
        {(d.inclusions.length ? d.inclusions : d.itinerary).slice(0, 3).map((x) => <li key={x.en} className="flex gap-1.5"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /><span className="line-clamp-1">{x[locale]}</span></li>)}
      </ul>
    </Shell>
  );
}

function VisaCard({ r, href, index }: { r: SearchResult; href: string; index: number }) {
  const tc = useTranslations('cards');
  const locale = useLocale() as L;
  const d = r.details.serviceType === 'visa' ? r.details : null;
  const o = r.cheapest;
  if (!d) return null;
  const country = new Intl.DisplayNames([locale], { type: 'region' }).of(d.countryIso2) ?? d.countryIso2;
  return (
    <Shell r={r} href={href} index={index} testId="category-card" price={priceOf(o.priceMinor, o.currency, locale)} priceNote={tc('perApplicantTotal', { n: o.quantity })}
      badge={<Badge tone="primary">{tc(`visa_${d.visaType}` as never)}</Badge>}>
      <h3 className="font-semibold text-fg">{tc('visaFor', { country })}</h3>
      <div className="flex flex-wrap gap-x-4 gap-y-1"><Meta icon={Clock}>{tc('processing', { n: d.processingDays })}</Meta><Meta icon={CalendarClock}>{tc('validity', { n: d.validityDays })}</Meta></div>
      <div>
        <p className="mb-1 text-xs font-semibold text-fg-muted uppercase">{tc('requirements', { n: d.requiredDocs.length })}</p>
        <ul className="flex flex-col gap-1 text-sm text-fg">{d.requiredDocs.slice(0, 3).map((x) => <li key={x.en} className="flex gap-1.5"><FileText className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden /><span className="line-clamp-1">{x[locale]}</span></li>)}</ul>
      </div>
    </Shell>
  );
}

function UmrahCard({ r, href, index }: { r: SearchResult; href: string; index: number }) {
  const tc = useTranslations('cards');
  const locale = useLocale() as L;
  const d = r.details.serviceType === 'umrah' ? r.details : null;
  const o = r.cheapest;
  if (!d) return null;
  const included = [d.includesFlight && tc('incFlight'), d.includesVisa && tc('incVisa'), d.includesTransport && tc('incTransport')].filter(Boolean) as string[];
  return (
    <Shell r={r} href={href} index={index} testId="category-card" price={priceOf(o.priceMinor, o.currency, locale)} priceNote={tc('pilgrimsTotal', { n: o.quantity })}
      badge={<Badge tone="primary">{tc('nights', { n: d.makkahNights + d.madinahNights })}</Badge>}>
      <h3 className="line-clamp-2 font-semibold text-fg">{r.name[locale]}</h3>
      <Meta icon={PlaneTakeoff}>{tc('departsFrom', { city: d.departureCity[locale] })} · {d.season[locale]}</Meta>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-fg-muted">{tc('makkah', { n: d.makkahNights })}</dt><dd className="truncate text-fg">{d.makkahHotel[locale]}</dd>
        <dt className="text-fg-muted">{tc('madinah', { n: d.madinahNights })}</dt><dd className="truncate text-fg">{d.madinahHotel[locale]}</dd>
      </dl>
      <div className="flex flex-wrap gap-1" aria-label={tc('included')}>{included.map((x) => <Badge key={x} tone="success">{x}</Badge>)}</div>
    </Shell>
  );
}

function ActivityCard({ r, href, index }: { r: SearchResult; href: string; index: number }) {
  const tc = useTranslations('cards');
  const locale = useLocale() as L;
  const d = r.details.serviceType === 'activity' ? r.details : null;
  const o = r.cheapest;
  if (!d) return null;
  return (
    <Shell r={r} href={href} index={index} testId="category-card" price={priceOf(o.priceMinor, o.currency, locale)} priceNote={tc('participantsTotal', { n: o.quantity })}
      badge={d.tags[0] ? <Badge tone="primary">{tc.has(`tag_${d.tags[0]}` as never) ? tc(`tag_${d.tags[0]}` as never) : d.tags[0]}</Badge> : undefined}>
      <h3 className="line-clamp-2 font-semibold text-fg">{r.name[locale]}</h3>
      <div className="flex flex-wrap gap-x-4 gap-y-1"><Meta icon={MapPin}>{r.destinationName[locale]}</Meta><Meta icon={Clock}>{tc('hours', { n: d.durationHours })}</Meta></div>
      <Rating r={r} />
      <Meta icon={Languages}>{d.languages.map((l) => l.toUpperCase()).join(' · ')}</Meta>
      {d.oldPriceMinor !== null && d.oldPriceMinor > o.priceMinor && <p className="text-xs text-fg-muted">{tc('was')} <s className="tabular">{priceOf(d.oldPriceMinor, o.currency, locale)}</s></p>}
    </Shell>
  );
}

function TransferCard({ r, href, index }: { r: SearchResult; href: string; index: number }) {
  const tc = useTranslations('cards');
  const locale = useLocale() as L;
  const d = r.details.serviceType === 'transfer' ? r.details : null;
  const o = r.cheapest;
  if (!d) return null;
  const isPrivate = d.mode === 'private';
  return (
    <Shell r={r} href={href} index={index} testId="category-card" price={priceOf(o.priceMinor, o.currency, locale)} priceNote={isPrivate ? tc('perVehicle') : tc('passengersTotal', { n: o.quantity })}
      badge={<Badge tone="primary">{isPrivate ? tc('private') : tc('shared')}</Badge>}>
      <p className="flex items-center gap-2 font-semibold text-fg">{isPrivate ? <Car className="size-4 text-primary" aria-hidden /> : <Bus className="size-4 text-primary" aria-hidden />}{o.unitName[locale]}</p>
      <p className="text-sm text-fg">{d.fromPlace[locale]} <span className="flip-rtl inline-block" aria-hidden>→</span> <span className="sr-only">{tc('to')}</span>{d.toPlace[locale]}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Meta icon={Clock}>{hm(d.durationMin)}</Meta>
        <Meta icon={Users}>{o.capacity !== null ? tc('upTo', { n: o.capacity }) : tc('seatsLeft', { n: o.available })}</Meta>
      </div>
      <div className="flex flex-wrap gap-1">{!isPrivate && o.times.length > 0 && <Badge>{tc('departures', { times: o.times.slice(0, 3).join(' · ') })}</Badge>}{o.refundable && <Badge tone="success">{tc('freeCancel')}</Badge>}</div>
    </Shell>
  );
}

type CardComponent = (p: { r: SearchResult; href: string; index: number }) => ReactNode;
const CARDS: Record<ServiceType, CardComponent> = { hotel: HotelCard, flight: FlightCard, tour: TourCard, visa: VisaCard, umrah: UmrahCard, activity: ActivityCard, transfer: TransferCard };

/** The right card for a result's category. */
export function CategoryCard({ result, href, index }: { result: SearchResult; href: string; index: number }) {
  const Card = CARDS[result.serviceType];
  return <Card r={result} href={href} index={index} />;
}


/** Compact, category-specific facts for result rows (the search results list keeps its own layout). */
export function CategoryFacts({ r }: { r: SearchResult }) {
  const tc = useTranslations('cards');
  const locale = useLocale() as L;
  const d = r.details;
  const o = r.cheapest;
  const chips = (xs: (string | false | null | undefined)[]) => (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-fg-muted" data-testid="category-facts" data-service={r.serviceType}>
      {xs.filter(Boolean).map((x) => <li key={x as string}>{x}</li>)}
    </ul>
  );
  switch (d.serviceType) {
    case 'hotel': return chips([d.neighborhood, ...d.amenities.slice(0, 3).map((a) => (tc.has(`amenity_${a}` as never) ? tc(`amenity_${a}` as never) : a)), o.capacity !== null && tc('upTo', { n: o.capacity })]);
    case 'flight': {
      const arrive = addMinutes(d.departTime, d.durationMin);
      return chips([`${d.carrier} ${d.flightNo}`, `${d.fromCode} ${d.departTime} → ${d.toCode} ${arrive.time}${arrive.nextDay ? ' +1' : ''}`, hm(d.durationMin), tc('nonstop'), tc(`cabin_${d.cabin}` as never), tc('baggage', { kg: d.baggageKg })]);
    }
    case 'tour': return chips([tc(`tour_${d.tourType}` as never), tc('days', { n: d.durationDays }), d.transport, d.inclusions[0]?.[locale]]);
    case 'visa': return chips([tc(`visa_${d.visaType}` as never), tc('processing', { n: d.processingDays }), tc('validity', { n: d.validityDays }), tc('requirements', { n: d.requiredDocs.length })]);
    case 'umrah': return chips([tc('makkah', { n: d.makkahNights }), tc('madinah', { n: d.madinahNights }), tc('departsFrom', { city: d.departureCity[locale] }), [d.includesFlight && tc('incFlight'), d.includesVisa && tc('incVisa'), d.includesTransport && tc('incTransport')].filter(Boolean).join(' · ')]);
    case 'activity': return chips([tc('hours', { n: d.durationHours }), d.languages.map((l) => l.toUpperCase()).join(' · '), d.highlights[0]?.[locale]]);
    case 'transfer': return chips([`${d.fromPlace[locale]} → ${d.toPlace[locale]}`, d.mode === 'private' ? tc('private') : tc('shared'), hm(d.durationMin), o.capacity !== null ? tc('upTo', { n: o.capacity }) : tc('seatsLeft', { n: o.available })]);
  }
}
