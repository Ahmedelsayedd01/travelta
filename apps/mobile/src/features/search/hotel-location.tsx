import { useQuery } from '@tanstack/react-query';
import type { SearchResult } from '@travelta/schemas';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';
import { MapView } from '@/components/map/map-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Row, SectionTitle } from '@/components/ui/layout';
import { Skeleton } from '@/components/ui/feedback';
import { Text } from '@/components/ui/text';
import { useApi } from '@/lib/api-provider';
import { activeLocale } from '@/lib/i18n';

const KINDS = ['attraction', 'airport', 'transit', 'neighborhood'] as const;

/** Hotel location: map with the hotel pin and nearby places, address, coordinates, distances and directions. */
export function HotelLocation({ result }: { result: SearchResult }) {
  const { t } = useTranslation();
  const api = useApi();
  const d = result.details.serviceType === 'hotel' ? result.details : null;
  const loc = useQuery({
    queryKey: ['places', 'hotel', result.destinationId, result.geo?.lat, result.geo?.lng], enabled: d !== null,
    queryFn: () => api.call('places.hotelLocation', { destinationId: result.destinationId, geo: result.geo, address: d?.address ?? '', neighborhood: d?.neighborhood ?? null }),
  });
  if (!d) return null;
  if (!loc.data) return <Skeleton style={{ height: 260 }} />;
  const l = loc.data;
  return (
    <Card style={{ gap: 12 }} testID="m-hotel-location">
      <SectionTitle>{t('maps.location')}</SectionTitle>
      <MapView center={l.geo} zoom={14} label={t('maps.hotelMap', { name: result.name[activeLocale] })}
        markers={[{ id: 'hotel', geo: l.geo, kind: 'pin', title: result.name[activeLocale] }, ...l.nearby.map((p) => ({ id: p.id, geo: p.geo, kind: 'place' as const, placeKind: p.kind, title: p.name[activeLocale] }))]} />
      <Text size="sm">{[l.address, l.neighborhood, l.destination.name[activeLocale]].filter(Boolean).join(', ')}</Text>
      <Text size="xs" tone="muted" numeric>{t('maps.coordinates')}: {l.geo.lat.toFixed(5)}, {l.geo.lng.toFixed(5)} · {t('maps.fromCentre')}: {t('maps.km', { km: l.distanceFromCentreKm })}</Text>
      {KINDS.map((k) => {
        const rows = l.nearby.filter((p) => p.kind === k);
        return rows.length > 0 && (
          <View key={k} style={{ gap: 4 }}>
            <Text size="xs" weight="semibold" tone="muted">{t(`maps.kind_${k}`)}</Text>
            {rows.map((p) => <Row key={p.id} style={{ justifyContent: 'space-between' }}><Text size="sm" style={{ flex: 1 }}>{p.name[activeLocale]}</Text><Text size="sm" tone="muted" numeric>{t('maps.km', { km: p.distanceKm })}</Text></Row>)}
          </View>
        );
      })}
      <Button label={t('maps.directions')} variant="outline" onPress={() => void Linking.openURL(l.directionsUrl)} testID="m-directions" />
      <Text size="xs" tone="subtle">{t('maps.demoNotice')}</Text>
    </Card>
  );
}
