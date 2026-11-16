import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';

/** Booking terms (same text as the web /terms page; prototype terms describing current behaviour). */
export default function Terms() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('terms.title') }} />
      <Card><Text size="sm" style={{ color: '#92400E' }}>{t('terms.demo')}</Text></Card>
      {[1, 2, 3, 4, 5].map((n) => (
        <View key={n} style={{ gap: 4 }}>
          <Text weight="semibold">{t(`terms.h${n}`)}</Text>
          <Text tone="muted">{t(`terms.p${n}`)}</Text>
        </View>
      ))}
    </Screen>
  );
}
