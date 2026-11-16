import { useQuery } from '@tanstack/react-query';
import { SERVICE_TYPES } from '@travelta/contracts';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, Row, Screen, SectionTitle } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { useApi } from '@/lib/api-provider';
import { addDays, day, money } from '@/lib/format';
import { useNotificationBadge } from '@/features/notifications/local';
import { useSearchState } from '@/features/search/store';
import { activeLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/store/session';

/** Home & discovery: services, the welcome promo and the next trip. */
export default function HomeTab() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const api = useApi();
  const session = useSession((s) => s.session);
  const trips = useQuery({ queryKey: ['bookings', 'mobile', 'next', session?.token], queryFn: () => api.call('bookings.list', { page: 1, pageSize: 1, sort: 'travelStart:asc', filters: { when: ['upcoming', 'current'] } }), enabled: session !== null });
  const next = trips.data?.items[0];
  const unread = useNotificationBadge();
  const recent = useSearchState((s) => s.recent);
  const setInput = useSearchState((s) => s.setInput);
  const select = useSearchState((s) => s.select);
  const destinations = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const featured = (destinations.data?.items ?? []).filter((d) => d.popular);
  const pickDest = featured[0];
  const from = addDays(new Date().toISOString().slice(0, 10), 21);
  const recInput = pickDest ? { serviceType: 'hotel' as const, destinationId: pickDest.id, from, to: addDays(from, 3), rooms: [{ adults: 2, childAges: [] }], adults: 2, children: 0, infants: 0, customerType: 'individual' as const, sort: 'rating' as const, pageSize: 6 } : null;
  const recommended = useQuery({ queryKey: ['search', 'mobile', 'recommended', recInput], enabled: recInput !== null, queryFn: () => api.call('search.run', recInput!) });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={['top']}>
      <Screen>
        <Row style={{ justifyContent: 'flex-end' }}>
          <Pressable onPress={() => router.push('/notifications')} accessibilityRole="button" testID="home-bell" hitSlop={8}
            accessibilityLabel={unread > 0 ? t('notifications.bell', { count: unread }) : t('notifications.title')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22, color: c.fg }}>🔔</Text>
            {unread > 0 && <View style={{ position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text size="xs" weight="bold" style={{ color: c.canvas }}>{unread}</Text></View>}
          </Pressable>
        </Row>
        <View style={{ backgroundColor: c.hero, borderRadius: 16, padding: 20, gap: 8 }}>
          <Text size="2xl" weight="bold" style={{ color: c['on-hero'] }}>{session ? t('store.hello', { name: session.user.name.split(' ')[0] }) : t('common.appName')}</Text>
          <Text style={{ color: c['hero-muted'] }}>{t('store.heroBody')}</Text>
          <Button label={t('store.bookTrip')} onPress={() => router.push('/search')} testID="home-search" />
        </View>
        <SectionTitle>{t('home.servicesTitle')}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {SERVICE_TYPES.map((s) => (
            <Pressable key={s} onPress={() => router.push({ pathname: '/search', params: { service: s } })} accessibilityRole="button" testID={`service-${s}`}
              style={{ width: '30.5%', minHeight: 72, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
              <Text size="sm" weight="semibold" style={{ textAlign: 'center' }}>{t(`enums.serviceType.${s}`)}</Text>
            </Pressable>
          ))}
        </View>
        {recent.length > 0 && (
          <View style={{ gap: 8 }} testID="home-recent">
            <SectionTitle>{t('mobile.recentSearches')}</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {recent.map((r) => <Chip key={`${r.serviceType}-${r.destinationCode}`} label={`${t(`enums.serviceType.${r.serviceType}`)} · ${destinations.data?.items.find((d) => d.code === r.destinationCode)?.name[activeLocale] ?? r.destinationCode}`} selected={false}
                onPress={() => router.push({ pathname: '/search', params: { service: r.serviceType, dest: r.destinationCode } })} />)}
            </ScrollView>
          </View>
        )}
        <View style={{ gap: 8 }} testID="home-featured">
          <SectionTitle>{t('mobile.featuredDestinations')}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {featured.map((d, i) => (
              <Pressable key={d.id} onPress={() => router.push({ pathname: '/search', params: { service: 'hotel', dest: d.code } })} accessibilityRole="button" testID={`featured-${d.code}`}
                style={{ width: 140, height: 96, borderRadius: 14, padding: 12, justifyContent: 'flex-end', backgroundColor: [c.hero, c.secondary, c.primary, c.accent][i % 4] }}>
                <Text weight="bold" style={{ color: i % 4 === 3 ? c['on-accent'] : c['on-primary'] }}>{d.name[activeLocale]}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        {pickDest && (
          <View style={{ gap: 8 }} testID="home-recommended">
            <SectionTitle>{t('mobile.recommended', { place: pickDest.name[activeLocale] })}</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {(recommended.data?.items ?? []).map((r) => (
                <Pressable key={r.key} accessibilityRole="button" onPress={() => { if (recInput) setInput(recInput); select(r); router.push('/search/product'); }}
                  style={{ width: 200, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 12, gap: 4 }}>
                  <Text weight="semibold" numberOfLines={2}>{r.name[activeLocale]}</Text>
                  <Text tone="muted" size="xs">★ {r.rating.toFixed(1)} · {r.reviews}</Text>
                  <Text numeric weight="bold">{money(r.cheapest.priceMinor, r.cheapest.currency)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        <Card>
          <Row style={{ justifyContent: 'space-between' }}><Text weight="semibold">{t('store.promoTitle')}</Text><Badge label="WELCOME10" tone="primary" dot={false} /></Row>
          <Text tone="muted" size="sm">{t('store.promoBody')}</Text>
        </Card>
        {session && (
          <Card>
            <SectionTitle>{t('store.upcoming')}</SectionTitle>
            {next ? (
              <Pressable onPress={() => router.push(`/trip/${next.id}`)} accessibilityRole="button" testID="next-trip">
                <Text weight="semibold">{next.title[activeLocale]}</Text>
                <Text tone="muted" size="sm">{day(next.travelStart)} · {money(next.totalMinor, next.currency)}</Text>
              </Pressable>
            ) : <Text tone="muted">{t('store.noTrips')}</Text>}
          </Card>
        )}
        {!session && (
          <Row>
            <View style={{ flex: 1 }}><Button label={t('auth.signIn')} variant="outline" onPress={() => router.push('/login')} /></View>
            <View style={{ flex: 1 }}><Button label={t('auth.register')} variant="secondary" onPress={() => router.push('/register')} /></View>
          </Row>
        )}
      </Screen>
    </SafeAreaView>
  );
}
