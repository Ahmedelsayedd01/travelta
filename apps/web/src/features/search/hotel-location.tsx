'use client';

import { useQuery } from '@tanstack/react-query';
import type { NearbyPlace } from '@travelta/schemas';
import { Navigation } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useApi } from '@/components/api-provider';
import { MapView, type GeoPoint, type MapMarker } from '@/components/map/map-view';
import { Skeleton } from '@/components/ui/skeleton';

const KIND_ORDER = ['attraction', 'airport', 'transit', 'neighborhood'] as const;

/** Hotel location: interactive map with the hotel pin and nearby places, address, coordinates, distances, directions. */
export function HotelLocation({ destinationId, geo, address, neighborhood, name }: { destinationId: string; geo: GeoPoint | null; address: string; neighborhood: string | null; name: string }) {
  const t = useTranslations('maps');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const loc = useQuery({
    queryKey: ['places', 'hotel', destinationId, geo?.lat, geo?.lng],
    queryFn: () => api.call('places.hotelLocation', { destinationId, geo, address, neighborhood }),
    staleTime: 300_000,
  });
  if (!loc.data) return <Skeleton className="h-72 w-full" />;
  const d = loc.data;
  const markers: MapMarker[] = [
    { id: 'hotel', geo: d.geo, kind: 'pin', title: name },
    ...d.nearby.map((p): MapMarker => ({ id: p.id, geo: p.geo, kind: 'place', placeKind: p.kind, title: `${p.name[locale]} · ${t('km', { km: p.distanceKm })}` })),
  ];
  const byKind = (k: (typeof KIND_ORDER)[number]) => d.nearby.filter((p: NearbyPlace) => p.kind === k);
  return (
    <section className="flex flex-col gap-3" data-testid="hotel-location">
      <h3 className="text-sm font-semibold text-fg">{t('location')}</h3>
      <MapView center={d.geo} zoom={14} markers={markers} label={t('hotelMap', { name })} className="h-64" testId="hotel-map" tilesUnavailableText={t('tilesUnavailable')} />
      <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <p><span className="text-fg-muted">{t('address')}: </span><span className="text-fg" data-testid="hotel-address">{[d.address, d.neighborhood, d.destination.name[locale]].filter(Boolean).join(', ')}</span></p>
        <p><span className="text-fg-muted">{t('coordinates')}: </span><span className="tabular text-fg" dir="ltr" data-testid="hotel-coords">{d.geo.lat.toFixed(5)}, {d.geo.lng.toFixed(5)}</span></p>
        <p><span className="text-fg-muted">{t('fromCentre')}: </span><span className="tabular text-fg">{t('km', { km: d.distanceFromCentreKm })}</span></p>
        <p><a className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline" href={d.directionsUrl} target="_blank" rel="noreferrer" data-testid="directions-link"><Navigation className="size-3.5" aria-hidden />{t('directions')}</a></p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2" data-testid="nearby-places">
        {KIND_ORDER.map((k) => byKind(k).length > 0 && (
          <div key={k}>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">{t(`kind_${k}`)}</h4>
            <ul className="flex flex-col gap-0.5 text-sm">
              {byKind(k).map((p) => (
                <li key={p.id} className="flex justify-between gap-3"><span className="text-fg">{p.name[locale]}</span><span className="tabular shrink-0 text-fg-muted">{t('km', { km: p.distanceKm })}</span></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-xs text-fg-muted">{t('demoNotice')}</p>
    </section>
  );
}
