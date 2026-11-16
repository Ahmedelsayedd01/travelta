import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Row } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { useApi } from '@/lib/api-provider';
import { day, money } from '@/lib/format';
import { activeLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/store/session';

export const STATUS_TONE = { pending: 'warning', partially_confirmed: 'warning', confirmed: 'info', vouchered: 'primary', travelled: 'success', cancelled: 'danger' } as const;

/** Booking history (virtualised), newest first. */
export default function TripsTab() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const api = useApi();
  const session = useSession((s) => s.session);
  const q = useQuery({ queryKey: ['bookings', 'mobile', 'all', session?.token], queryFn: () => api.call('bookings.list', { page: 1, pageSize: 50, sort: 'createdAt:desc' }), enabled: session !== null });
  if (!session) return <View style={{ flex: 1, padding: 16, backgroundColor: c.canvas }}><EmptyState title={t('storefront.signInTitle')} body={t('storefront.signInBody')} actionLabel={t('auth.signIn')} onAction={() => router.push('/login')} /></View>;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data) return <View style={{ padding: 16, gap: 12 }}><Skeleton style={{ height: 80 }} /><Skeleton style={{ height: 80 }} /></View>;
  return (
    <FlatList style={{ backgroundColor: c.canvas }} data={q.data.items} keyExtractor={(b) => b.id} contentContainerStyle={{ padding: 12, gap: 12 }}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => void q.refetch()} tintColor={c.primary} />}
      ListEmptyComponent={<View style={{ gap: 12 }}><EmptyState title={t('store.noTrips')} body={t('store.noTripsBody')} /><Button label={t('store.bookTrip')} onPress={() => router.push('/search')} /></View>}
      renderItem={({ item: b }) => (
        <Pressable onPress={() => router.push(`/trip/${b.id}`)} accessibilityRole="button" testID="mobile-trip"
          style={{ backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}><Text size="xs" tone="muted">{b.ref}</Text><Badge label={t(`enums.bookingStatus.${b.status}`)} tone={STATUS_TONE[b.status]} /></Row>
          <Text weight="semibold">{b.title[activeLocale]}</Text>
          <Row style={{ justifyContent: 'space-between' }}><Text tone="muted" size="sm">{day(b.travelStart)}</Text><Text numeric weight="bold">{money(b.totalMinor, b.currency)}</Text></Row>
        </Pressable>
      )} />
  );
}
