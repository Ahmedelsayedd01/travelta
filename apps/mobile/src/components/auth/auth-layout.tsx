import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/text';
import { activeLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { imageAlt, imageSource, type TravelImageKey } from '@/lib/travel-images';

/**
 * Auth screens: a destination photo header (with a navy scrim for legible white text and a back control) and the form
 * on a rounded sheet that scrolls above the keyboard. Replaces the stack header on these routes.
 */
export function AuthLayout({ image, title, subtitle, children }: { image: TravelImageKey; title: string; subtitle: string; children: ReactNode }) {
  const { c, rtl } = useTheme();
  const { t } = useTranslation();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={{ height: 230 }}>
          <Image source={imageSource(image)} accessibilityLabel={imageAlt(image, activeLocale)} resizeMode="cover" style={{ width: '100%', height: '100%' }} testID="auth-photo" />
          <LinearGradient pointerEvents="none" colors={['rgba(16,42,67,0.55)', 'rgba(16,42,67,0.25)', 'rgba(16,42,67,0.85)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingBottom: 40, justifyContent: 'space-between' }}>
            <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 }}>
              {router.canGoBack() ? (
                <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text size="lg" weight="bold" style={{ color: '#FFFFFF' }}>{rtl ? '→' : '←'}</Text>
                </Pressable>
              ) : <View />}
              <Text weight="bold" size="lg" style={{ color: '#FFFFFF' }}>{t('common.appName')}</Text>
            </View>
            <View style={{ gap: 4 }}>
              <Text size="2xl" weight="bold" style={{ color: '#FFFFFF' }} accessibilityRole="header">{title}</Text>
              <Text style={{ color: '#E2E8F0' }}>{subtitle}</Text>
            </View>
          </SafeAreaView>
        </View>
        <SafeAreaView edges={['bottom']} style={{ flex: 1, marginTop: -24, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: c.canvas, padding: 20, gap: 16 }}>
          {children}
        </SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
