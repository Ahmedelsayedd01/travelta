import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Row, Screen } from '@/components/ui/layout';
import { EmptyState } from '@/components/ui/feedback';
import { Text } from '@/components/ui/text';
import { useSearchState } from '@/features/search/store';
import { HotelLocation } from '@/features/search/hotel-location';
import { Heart } from '@/features/favorites/heart';
import { useApi } from '@/lib/api-provider';
import { money } from '@/lib/format';
import { activeLocale } from '@/lib/i18n';
import { useAction } from '@/lib/use-action';
import { useSession } from '@/store/session';

/** Product: every offer for it (room types, slots, fares) with policy; add to cart needs a signed-in customer. */
export default function Product() {
  const { t } = useTranslation();
  const api = useApi();
  const r = useSearchState((s) => s.selected);
  const input = useSearchState((s) => s.input);
  const session = useSession((s) => s.session);
  const add = useAction((offerId: string) => api.call('cart.addOffer', { offerId, customerType: input?.customerType ?? 'individual' }), { success: t('cart.added'), onSuccess: () => router.push('/cart') });
  if (!r) return <EmptyState title={t('search.noResultsTitle')} />;
  return (
    <Screen>
      <Stack.Screen options={{ title: r.name[activeLocale] }} />
      <View style={{ gap: 4 }}>
        <Text size="xl" weight="bold">{r.name[activeLocale]}</Text>
        <Text tone="muted">{r.destinationName[activeLocale]} · ★ {r.rating.toFixed(1)}</Text>
        <Text size="sm">{r.description[activeLocale]}</Text>
      </View>
      <View style={{ position: 'absolute', top: 8, right: 8 }}><Heart result={r} /></View>
      {r.options.map((o) => (
        <Card key={o.offerId} style={{ gap: 8 }} testID="mobile-option">
          <Text weight="semibold">{o.unitName[activeLocale]}</Text>
          <Row style={{ flexWrap: 'wrap' }}>
            {o.mealPlan && <Badge label={t(`search.meal_${o.mealPlan}`)} tone="info" />}
            <Badge label={o.refundable ? t('search.refundable') : t('search.nonRefundable')} tone={o.refundable ? 'success' : 'warning'} />
            {o.nights > 0 && <Badge label={t('mobile.nightsCount', { n: o.nights })} tone="neutral" dot={false} />}
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <View><Text numeric size="lg" weight="bold">{money(o.priceMinor, o.currency)}</Text><Text tone="subtle" size="xs">{t('mobile.inclTax')}</Text></View>
            {session ? <Button label={t('cart.addToCart')} loading={add.isPending} disabled={o.available < 1} onPress={() => add.mutate(o.offerId)} testID="mobile-add" />
              : <Button label={t('store.signInToBook')} variant="outline" onPress={() => router.push('/login')} />}
          </Row>
        </Card>
      ))}
      <HotelLocation result={r} />
    </Screen>
  );
}
