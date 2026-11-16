'use client';

import type { SearchResult } from '@travelta/schemas';
import { MapPinOff } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { MapView, type GeoPoint, type MapBounds, type MapMarker } from '@/components/map/map-view';
import { Checkbox } from '@/components/ui/checkbox';
import { priceOf } from './format';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Hotel results on the map: price pills linked both ways with the result cards, plus "search as I move the map". */
export function HotelResultsMap({ items, center, zoom, selected, hovered, onSelect, onHover, followMap, onFollowMap, onBounds, className }: {
  items: SearchResult[]; center: GeoPoint; zoom: number; selected: string | null; hovered: string | null;
  onSelect: (key: string) => void; onHover: (key: string | null) => void;
  followMap: boolean; onFollowMap: (on: boolean) => void; onBounds: (b: MapBounds) => void; className?: string;
}) {
  const t = useTranslations('maps');
  const locale = useLocale() as 'en' | 'ar';
  const markers: MapMarker[] = items.filter((r) => r.geo).map((r) => {
    const price = priceOf(r.cheapest.priceMinor, r.cheapest.currency, locale);
    return {
      id: r.key, geo: r.geo!, kind: 'price', label: price, title: `${r.name[locale]} · ${price}`,
      preview: `<strong>${esc(r.name[locale])}</strong><br>${'★'.repeat(r.stars ?? 0)} · ${r.rating.toFixed(1)} (${r.reviews})<br>${esc(price)}${r.distanceKm !== null ? ` · ${esc(t('kmFromCentre', { km: r.distanceKm }))}` : ''}`,
    };
  });
  return (
    <div className={className} data-testid="results-map-panel">
      <div className="relative size-full">
        <MapView center={center} zoom={zoom} markers={markers} selectedId={selected} hoveredId={hovered} onSelect={onSelect} onHover={onHover}
          onBoundsChange={onBounds} fitMarkers={!followMap} label={t('resultsMap')} className="size-full min-h-80" testId="results-map" tilesUnavailableText={t('tilesUnavailable')} />
        <div className="absolute start-3 bottom-3 z-[1000] rounded-md bg-surface/95 px-3 py-2 shadow-md">
          <Checkbox label={t('searchAsIMove')} checked={followMap} onCheckedChange={onFollowMap} />
        </div>
        {markers.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[999] grid place-items-center" data-testid="map-empty">
            <p className="flex items-center gap-2 rounded-md bg-surface px-4 py-3 text-sm font-medium text-fg shadow-md"><MapPinOff className="size-4" aria-hidden />{t('noHotelsHere')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
