import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { KeyValue, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useApi } from '@/lib/api-provider';
import { day, money } from '@/lib/format';
import { activeLocale } from '@/lib/i18n';
import { useAction } from '@/lib/use-action';

/** Cart with quotes valid 15 minutes, promo code and checkout. */
export default function Cart() {
  const { t } = useTranslation();
  const api = useApi();
  const [code, setCode] = useState('');
  const cart = useQuery({ queryKey: ['cart', 'mobile'], queryFn: () => api.call('cart.get', {}) });
  const remove = useAction((itemId: string) => api.call('cart.removeItem', { itemId }));
  const promo = useAction((value: string | null) => api.call('cart.applyPromo', { code: value }), { success: t('cart.promoApplied'), onSuccess: () => setCode('') });
  if (cart.isError) return <ErrorState onRetry={() => void cart.refetch()} />;
  if (!cart.data) return <View style={{ padding: 16 }}><Skeleton style={{ height: 120 }} /></View>;
  const c = cart.data;
  return (
    <Screen>
      <Stack.Screen options={{ title: t('cart.title') }} />
      {c.items.length === 0 ? <EmptyState title={t('cart.empty')} body={t('cart.emptyBody')} actionLabel={t('cart.searchNow')} onAction={() => router.push('/search')} /> : (
        <>
          {c.items.map((i) => (
            <Card key={i.id} style={{ gap: 6 }} testID="mobile-cart-line">
              <Text weight="semibold">{i.title[activeLocale]}</Text>
              <Text tone="muted" size="sm">{i.subtitle[activeLocale]} · {day(i.from)}{i.to ? ` → ${day(i.to)}` : ''}</Text>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text numeric weight="bold">{money(i.priceMinor, c.currency)}</Text>
                <Button label={t('cart.remove')} variant="ghost" onPress={() => remove.mutate(i.id)} />
              </Row>
            </Card>
          ))}
          <Card style={{ gap: 10 }}>
            {c.promoCode ? (
              <Row style={{ justifyContent: 'space-between' }}><Text weight="semibold">{c.promoCode}</Text><Button label={t('cart.removePromo')} variant="ghost" onPress={() => promo.mutate(null)} /></Row>
            ) : (
              <Row>
                <View style={{ flex: 1 }}><TextField label={t('cart.promoPlaceholder')} value={code} autoCapitalize="characters" onChangeText={(v) => setCode(v.toUpperCase())} testID="mobile-promo" /></View>
                <Button label={t('cart.apply')} variant="outline" disabled={code.length < 3} loading={promo.isPending} onPress={() => promo.mutate(code)} />
              </Row>
            )}
            {c.discountMinor > 0 && <KeyValue label={t('cart.discountIncluded', { code: c.promoCode ?? '' })} value={`−${money(c.discountMinor, c.currency)}`} />}
            <KeyValue label={t('cart.total')} value={money(c.totalMinor, c.currency)} strong />
            <Button label={t('cart.checkout')} size="lg" onPress={() => router.push('/checkout')} testID="mobile-go-checkout" />
          </Card>
        </>
      )}
    </Screen>
  );
}
