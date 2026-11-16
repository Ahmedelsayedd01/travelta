import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { MapView } from '@/components/map/map-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/layout';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Text } from '@/components/ui/text';
import { Heart } from '@/features/favorites/heart';
import { useSearchState } from '@/features/search/store';
import { useApi } from '@/lib/api-provider';
import { money } from '@/lib/format';
import { activeLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

/** Full-screen hotel map: price markers; tapping one shows a preview card; "Show list" goes back. Filters come from the list. */
export default function ResultsMap() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const api = useApi();
  const input = useSearchState((s) => s.input);
  const filters = useSearchState((s) => s.filters);
  const select = useSearchState((s) => s.select);
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['search', 'mobile', input, filters], queryFn: () => api.call('search.run', { ...input!, sort: filters.sort, filters: filters.refundable ? { refundableOnly: true } : {} }), enabled: input !== null });
  const destinations = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const dest = destinations.data?.items.find((d) => d.id === input?.destinationId);
  const items = (q.data?.items ?? []).filter((r) => r.geo);
  const current = items.find((r) => r.key === selected) ?? null;
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }} testID="m-results-map">
      <Stack.Screen options={{ title: t('maps.viewMap') }} />
      {!q.data ? <View style={{ padding: 16 }}><Skeleton style={{ height: 400 }} /></View> : (
        <View style={{ flex: 1 }}>
          <MapView style={{ flex: 1, height: undefined, borderRadius: 0, borderWidth: 0 }} label={t('maps.resultsMap')} fit
            center={dest?.geo ?? items[0]?.geo ?? { lat: 30.0444, lng: 31.2357 }} zoom={dest?.zoom ?? 12} selectedId={selected} onSelect={setSelected}
            markers={items.map((r) => ({ id: r.key, geo: r.geo!, kind: 'price' as const, label: money(r.cheapest.priceMinor, r.cheapest.currency), title: r.name[activeLocale] }))} />
          {items.length === 0 && <View style={{ position: 'absolute', top: 16, left: 16, right: 16 }}><EmptyState title={t('maps.noHotelsHere')} /></View>}
          <View style={{ position: 'absolute', left: 12, right: 12, bottom: 16, gap: 10 }}>
            {current ? (
              <Pressable onPress={() => { select(current); router.push('/search/product'); }} accessibilityRole="button" testID="m-map-preview"
                style={{ backgroundColor: c.surface, borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: c.border }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text weight="semibold" style={{ flex: 1 }}>{current.name[activeLocale]}</Text>
                  <Heart result={current} />
                </Row>
                <Text tone="muted" size="sm">{'★'.repeat(current.stars ?? 0)} · {current.rating.toFixed(1)} ({current.reviews}){current.distanceKm !== null ? ` · ${t('maps.kmFromCentre', { km: current.distanceKm })}` : ''}</Text>
                <Row style={{ justifyContent: 'space-between' }}>
                  {current.cheapest.refundable ? <Badge label={t('search.refundable')} tone="success" /> : <Badge label={t('search.nonRefundable')} tone="warning" />}
                  <Text numeric weight="bold">{money(current.cheapest.priceMinor, current.cheapest.currency)}</Text>
                </Row>
              </Pressable>
            ) : <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 10 }}><Text size="sm" tone="muted" style={{ textAlign: 'center' }}>{t('maps.tapMarker')}</Text></View>}
            <Button label={t('maps.showList')} variant="secondary" onPress={() => router.back()} testID="m-show-list" />
          </View>
        </View>
      )}
    </View>
  );
}
