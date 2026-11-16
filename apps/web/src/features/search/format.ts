import type { CancellationPolicy, OfferOption, ProductDetails, SearchResult } from '@travelta/schemas';
import { formatMoney, money } from '@travelta/shared';

type T = (key: string, values?: Record<string, string | number>) => string;
type Locale = 'en' | 'ar';

export const priceOf = (minor: number, currency: string, locale: string) => formatMoney(money(minor, currency as never), locale);

/** One-line, service-specific summary shown under a result's name. */
export function detailLine(d: ProductDetails, t: T, locale: Locale): string[] {
  switch (d.serviceType) {
    case 'hotel': return [d.address, ...d.amenities.slice(0, 3)];
    case 'flight': return [`${d.carrier} · ${d.flightNo}`, `${d.fromCode} → ${d.toCode}`, t('departs', { time: d.departTime }), t('durationMin', { min: d.durationMin }), `${d.baggageKg} kg`];
    case 'tour': return [t('days', { count: d.durationDays }), d.transport, ...d.inclusions.slice(0, 2).map((x) => x[locale])];
    case 'visa': return [d.visaType, t('processing', { count: d.processingDays }), t('validity', { count: d.validityDays })];
    case 'umrah': return [
      t('makkahMadinah', { makkah: d.makkahNights, madinah: d.madinahNights }),
      d.makkahHotel[locale],
      [d.includesFlight && t('flight'), d.includesVisa && t('visa'), d.includesTransport && t('transport')].filter(Boolean).join(' · '),
    ].filter(Boolean);
    case 'activity': return [t('duration', { hours: d.durationHours }), d.languages.join(' / ').toUpperCase(), ...d.highlights.slice(0, 1).map((x) => x[locale])];
    case 'transfer': return [`${d.fromPlace[locale]} → ${d.toPlace[locale]}`, t('durationMin', { min: d.durationMin }), d.mode === 'private' ? t('privateTransfer') : t('sharedBus')];
  }
}

/** What the headline price covers — total stay, all travellers or one vehicle. */
export function priceBasis(r: SearchResult, o: OfferOption, t: T): string {
  if (r.serviceType === 'hotel') return t('perStay', { nights: o.nights });
  if (r.details.serviceType === 'transfer' && r.details.mode === 'private') return t('perVehicle');
  return t('perPax', { count: o.quantity });
}

export function policyLines(p: CancellationPolicy, t: T, tc: T): string[] {
  if (p.nonRefundable) return [t('policyNonRef')];
  // Zero-fee tiers are part of the free window, not a penalty worth listing.
  const sorted = p.rules.filter((r) => r.value > 0).sort((a, b) => b.daysBefore - a.daysBefore);
  if (sorted.length === 0) return [t('policyFreeAlways')];
  const fee = (r: CancellationPolicy['rules'][number]) =>
    r.feeType === 'percent' ? `${r.value}%` : r.feeType === 'nights' ? `${r.value} × ${tc('feeNights')}` : `${tc('feeFixed')} ${r.value}`;
  return [t('policyFree', { days: sorted[0]!.daysBefore + 1 }), ...sorted.map((r) => r.daysBefore === 0 ? t('policySameDay', { fee: fee(r) }) : t('policyRule', { days: r.daysBefore, fee: fee(r) }))];
}

export const SOURCE_GROUP = (o: OfferOption): 'groupExtranet' | 'groupB2b' | 'groupGlobal' =>
  o.ownership === 'api' ? 'groupGlobal' : o.ownership === 'network' ? 'groupB2b' : 'groupExtranet';
