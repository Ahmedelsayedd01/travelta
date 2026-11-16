import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, View } from 'react-native';
import { imageForProduct, imageSource } from '@/lib/travel-images';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Row, Screen } from '@/components/ui/layout';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Text } from '@/components/ui/text';
import { useFavorites } from '@/features/favorites/hooks';
import { activeLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

/** Saved products (same list as the web account). Prices are re-searched, never stored with the favorite. */
export default function FavoritesTab() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { signedIn, list, toggle } = useFavorites();
  if (!signedIn) {
    return <Screen><Card style={{ gap: 10 }}><Text>{t('favorites.emptyBody')}</Text><Button label={t('auth.signIn')} onPress={() => router.push('/login')} /></Card></Screen>;
  }
  return (
    <Screen onRefresh={() => void list.refetch()} refreshing={list.isFetching}>
      {!list.data ? <Skeleton style={{ height: 96 }} /> : list.data.length === 0 ? <EmptyState title={t('favorites.emptyTitle')} body={t('favorites.emptyBody')} /> : list.data.map((f) => (
        <Card key={f.id} style={{ gap: 6 }} testID="m-favorite-row">
          <Image source={imageSource(imageForProduct(f.serviceType, f.imageSeed))} resizeMode="cover" style={{ width: '100%', height: 120, borderRadius: 10 }} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text weight="semibold" style={{ flex: 1 }}>{f.name[activeLocale]}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('favorites.remove', { name: f.name[activeLocale] })} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => toggle.mutate({ key: f.key, serviceType: f.serviceType, name: f.name, destinationId: f.destinationId, destinationName: f.destinationName, imageSeed: f.imageSeed, rating: f.rating })}>
              <Text style={{ fontSize: 22, color: c.danger }}>♥</Text>
            </Pressable>
          </Row>
          <Text tone="muted" size="sm">{t(`enums.serviceType.${f.serviceType}`)} · {f.destinationName[activeLocale]} · ★ {f.rating.toFixed(1)}</Text>
          <View><Button label={t('favorites.checkPrices')} variant="outline" onPress={() => router.push({ pathname: '/search', params: { service: f.serviceType } })} /></View>
        </Card>
      ))}
    </Screen>
  );
}
