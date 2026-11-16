import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/lib/theme';
import { useOnboarding } from './state';

const SLIDES = [
  { key: 'discover', glyph: '🧭', tint: 'hero' },
  { key: 'compare', glyph: '⚖', tint: 'secondary' },
  { key: 'book', glyph: '✓', tint: 'primary' },
  { key: 'enjoy', glyph: '☀', tint: 'accent' },
] as const;

/** Four swipeable intro screens with progress dots, Skip / Next / Get started; shown once (persisted). */
export function OnboardingScreen() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const finish = useOnboarding((s) => s.finish);
  const list = useRef<FlatList<(typeof SLIDES)[number]>>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const done = async () => { await finish(); router.replace('/home'); };
  // FlatList needs a callback that never changes identity: create it once.
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: { index?: number | null }[] }) => { const i = viewableItems[0]?.index; if (typeof i === 'number') setIndex(i); });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} testID="onboarding">
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, minHeight: 48 }}>
        {!last && <Pressable onPress={() => void done()} accessibilityRole="button" testID="onboarding-skip" style={{ padding: 12 }}><Text weight="semibold" tone="primary">{t('onboardingMobile.skip')}</Text></Pressable>}
      </View>
      <FlatList ref={list} data={SLIDES} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(s) => s.key}
        onViewableItemsChanged={onViewable} viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: 28, justifyContent: 'center', gap: 20 }} accessible accessibilityLabel={`${t(`onboardingMobile.${item.key}Title`)}. ${t(`onboardingMobile.${item.key}Body`)}`}>
            <View style={{ alignSelf: 'center', width: 180, height: 180, borderRadius: 90, backgroundColor: c[item.tint], alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 72, color: c['on-primary'] }}>{item.glyph}</Text>
            </View>
            <Text size="2xl" weight="bold" style={{ textAlign: 'center' }}>{t(`onboardingMobile.${item.key}Title`)}</Text>
            <Text tone="muted" style={{ textAlign: 'center' }}>{t(`onboardingMobile.${item.key}Body`)}</Text>
          </View>
        )} />
      <View style={{ padding: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: SLIDES.length, now: index + 1 }}>
          {SLIDES.map((s, i) => <View key={s.key} style={{ width: i === index ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === index ? c.primary : c['border-strong'] }} />)}
        </View>
        <Button size="lg" testID="onboarding-next" label={last ? t('onboardingMobile.getStarted') : t('onboardingMobile.next')}
          onPress={() => (last ? void done() : list.current?.scrollToIndex({ index: index + 1, animated: true }))} />
      </View>
    </SafeAreaView>
  );
}
