import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Image, PanResponder, Pressable, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { activeLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { imageAlt, imageSource, type TravelImageKey } from '@/lib/travel-images';
import { useOnboarding } from './state';

const SLIDES: { key: 'discover' | 'compare' | 'book' | 'enjoy'; image: TravelImageKey }[] = [
  { key: 'discover', image: 'dest-luxor' },
  { key: 'compare', image: 'hotel-pool' },
  { key: 'book', image: 'flight-wing' },
  { key: 'enjoy', image: 'activity-balloon' },
];

/**
 * First-launch introduction: four photo slides with progress, Skip / Previous / Next / Get started, swipe gestures
 * (direction follows the reading direction in Arabic) and a short fade-and-slide transition. One slide is rendered at a
 * time, so paging behaves the same on iOS, Android and Expo Web. Completion is persisted (shown once per install).
 */
export function OnboardingScreen() {
  const { t } = useTranslation();
  const { c, rtl } = useTheme();
  const { height } = useWindowDimensions();
  const finish = useOnboarding((s) => s.finish);
  const [index, setIndex] = useState(0);
  const [anim] = useState(() => new Animated.Value(1));
  const [dir, setDir] = useState(1);
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index]!;

  const done = async () => { await finish(); router.replace('/home'); };
  const go = (next: number) => {
    if (next < 0 || next >= SLIDES.length) return;
    setDir(next > index ? 1 : -1);
    anim.setValue(0);
    setIndex(next);
  };
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    AccessibilityInfo.announceForAccessibility?.(t(`onboardingMobile.${SLIDES[index]!.key}Title`));
  }, [index, anim, t]);

  // Swipe: towards the reading direction = next.
  const goRef = useRef(go);
  useEffect(() => { goRef.current = go; });
  const indexRef = useRef(index);
  const rtlRef = useRef(rtl);
  useEffect(() => { indexRef.current = index; rtlRef.current = rtl; }, [index, rtl]);
  // The refs below are read only inside gesture callbacks (after render), never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_e, g) => {
      if (Math.abs(g.dx) < 60) return;
      const forward = rtlRef.current ? g.dx > 0 : g.dx < 0;
      goRef.current(forward ? indexRef.current + 1 : indexRef.current - 1);
    },
  }));

  const shift = (rtl ? -1 : 1) * dir * 24;
  const imageHeight = Math.round(height * 0.64);
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }} testID="onboarding" {...pan.panHandlers}>
      <Animated.View style={{ height: imageHeight, opacity: anim }}>
        <Image source={imageSource(slide.image)} accessibilityLabel={imageAlt(slide.image, activeLocale)} resizeMode="cover" style={{ width: '100%', height: '100%' }} testID={`onboarding-image-${slide.key}`} />
        {/* Scrims keep the Skip control and the status bar readable on any photo. */}
        <LinearGradient pointerEvents="none" colors={['rgba(16,42,67,0.7)', 'rgba(16,42,67,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140 }} />
      </Animated.View>
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, minHeight: 48 }}>
          <Text weight="bold" size="lg" style={{ color: '#FFFFFF' }}>{t('common.appName')}</Text>
          {!last && (
            <Pressable onPress={() => void done()} accessibilityRole="button" testID="onboarding-skip" hitSlop={8}
              style={{ paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: 999, backgroundColor: 'rgba(16,42,67,0.6)' }}>
              <Text weight="semibold" style={{ color: '#FFFFFF' }}>{t('onboardingMobile.skip')}</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={{ flex: 1, marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: c.canvas, paddingHorizontal: 24, paddingTop: 24 }}>
        <Animated.View style={{ flex: 1, gap: 12, opacity: anim, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }] }}
          accessible accessibilityLiveRegion="polite">
          <Text size="3xl" weight="bold" testID="onboarding-title">{t(`onboardingMobile.${slide.key}Title`)}</Text>
          <Text tone="muted" size="lg">{t(`onboardingMobile.${slide.key}Body`)}</Text>
        </Animated.View>
        <View style={{ gap: 16, paddingBottom: 16 }}>
          <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', justifyContent: 'center', gap: 8 }} accessibilityRole="progressbar"
            accessibilityLabel={t('onboardingMobile.progress', { n: index + 1, total: SLIDES.length })} accessibilityValue={{ min: 1, max: SLIDES.length, now: index + 1 }}>
            {SLIDES.map((s, i) => <View key={s.key} style={{ width: i === index ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: i === index ? c.primary : c['border-strong'] }} />)}
          </View>
          <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 12 }}>
            {index > 0 && (
              <View style={{ flex: 1 }}><Button size="lg" variant="outline" label={t('onboardingMobile.previous')} onPress={() => go(index - 1)} testID="onboarding-previous" /></View>
            )}
            <View style={{ flex: index > 0 ? 1.4 : 1 }}>
              <Button size="lg" testID={last ? 'onboarding-start' : 'onboarding-next'} label={last ? t('onboardingMobile.getStarted') : t('onboardingMobile.next')}
                onPress={() => (last ? void done() : go(index + 1))} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
