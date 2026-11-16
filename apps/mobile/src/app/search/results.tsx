import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, Pressable, View } from 'react-native';
import { imageForProduct, imageSource } from '@/lib/travel-images';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Heart } from '@/features/favorites/heart';
import { Chip, Row } from '@/components/ui/layout';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Text } from '@/components/ui/text';
import { useSearchState } from '@/features/search/store';
import { useApi } from '@/lib/api-provider';
import { money } from '@/lib/format';
import { activeLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

const SORTS = ['price_asc', 'price_desc', 'rating', 'distance'] as const;
const SORT_LABEL = { price_asc: 'search.sortPriceAsc', price_desc: 'search.sortPriceDesc', rating: 'search.sortRating', distance: 'maps.sortDistance' } as const;

/** Results for the last search: virtualised list, sort and refundable filter, priced for this customer. */
export default function Results() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const api = useApi();
  const input = useSearchState((s) => s.input);
  const select = useSearchState((s) => s.select);
  const filters = useSearchState((s) => s.filters);
  const setFilters = useSearchState((s) => s.setFilters);
  const { sort, refundable } = filters;
  const hotel = input?.serviceType === 'hotel';
  const q = useQuery({ queryKey: ['search', 'mobile', input, filters], queryFn: () => api.call('search.run', { ...input!, sort, filters: refundable ? { refundableOnly: true } : {} }), enabled: input !== null });
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <Stack.Screen options={{ title: t('mobile.results') }} />
      <Row style={{ padding: 12, flexWrap: 'wrap' }}>
        {SORTS.filter((s) => hotel || s !== 'distance').map((s) => <Chip key={s} label={t(SORT_LABEL[s])} selected={sort === s} onPress={() => setFilters({ sort: s })} />)}
        <Chip label={t('search.refundableOnly')} selected={refundable} onPress={() => setFilters({ refundable: !refundable })} />
      </Row>
      {hotel && <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}><Button label={t('maps.showMap')} variant="outline" onPress={() => router.push('/search/map')} testID="m-show-map" /></View>}
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : !q.data ? <View style={{ padding: 16, gap: 12 }}><Skeleton style={{ height: 96 }} /><Skeleton style={{ height: 96 }} /></View> : (
        <FlatList data={q.data.items} keyExtractor={(r) => r.key} contentContainerStyle={{ padding: 12, gap: 12 }}
          ListEmptyComponent={<EmptyState title={t('search.noResultsTitle')} body={t('search.noResultsBody')} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => { select(item); router.push('/search/product'); }} accessibilityRole="button" testID="mobile-result"
              style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
              <Image source={imageSource(imageForProduct(item.serviceType, item.imageSeed))} resizeMode="cover" style={{ width: '100%', height: 140 }} />
              <View style={{ padding: 14, gap: 6 }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text weight="semibold" style={{ flex: 1 }}>{item.name[activeLocale]}</Text>
                <Heart result={item} />
              </Row>
              <Text tone="muted" size="sm">{item.destinationName[activeLocale]} · ★ {item.rating.toFixed(1)} ({item.reviews}){item.distanceKm !== null ? ` · ${t('maps.kmFromCentre', { km: item.distanceKm })}` : ''}</Text>
              <Row style={{ justifyContent: 'space-between' }}>
                {item.cheapest.refundable ? <Badge label={t('search.refundable')} tone="success" /> : <Badge label={t('search.nonRefundable')} tone="warning" />}
                <Text numeric weight="bold">{t('search.from')} {money(item.cheapest.priceMinor, item.cheapest.currency)}</Text>
              </Row>
              </View>
            </Pressable>
          )} />
      )}
    </View>
  );
}
