import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, Row, Screen, SectionTitle } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useLogout } from '@/features/auth/hooks';
import { VerifyEmailCard } from '@/features/auth/forgot-screen';
import { useOnboarding } from '@/features/onboarding/state';
import { useApi } from '@/lib/api-provider';
import { activeLocale, switchLocale } from '@/lib/i18n';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { useAction } from '@/lib/use-action';
import { useSession } from '@/store/session';

/** Profile & settings: contact details, language, theme, support, demo tools, sign out. */
export default function ProfileTab() {
  const { t } = useTranslation();
  const api = useApi();
  const { preference, setPreference } = useTheme();
  const session = useSession((s) => s.session);
  const signIn = useSession((s) => s.signIn);
  const logout = useLogout();
  const resetOnboarding = useOnboarding((s) => s.reset);
  const [name, setName] = useState(session?.user.name ?? '');
  const [phone, setPhone] = useState(session?.user.phone ?? '');
  const save = useAction(() => api.call('account.updateProfile', { name, phone, locale: activeLocale, nationalityIso2: 'EG' }), {
    success: t('store.profileSaved'),
    onSuccess: (p) => { if (session) void signIn({ ...session, user: { ...session.user, name: p.name, phone: p.phone || null } }); },
  });
  return (
    <Screen>
      <VerifyEmailCard />
      {session ? (
        <Card style={{ gap: 10 }}>
          <SectionTitle>{t('store.profile')}</SectionTitle>
          <Text tone="muted" size="sm">{session.user.email} · {session.organization.name[activeLocale]}</Text>
          <TextField label={t('store.name')} value={name} onChangeText={setName} testID="m-profile-name" />
          <TextField label={t('store.phone')} value={phone} keyboardType="phone-pad" onChangeText={setPhone} />
          <Button label={t('store.save')} loading={save.isPending} disabled={name.trim().length < 2} onPress={() => save.mutate(undefined)} testID="m-profile-save" />
        </Card>
      ) : (
        <Card style={{ gap: 10 }}>
          <Text>{t('storefront.signInBody')}</Text>
          <Button label={t('auth.signIn')} onPress={() => router.push('/login')} />
          <Button label={t('auth.register')} variant="secondary" onPress={() => router.push('/register')} />
        </Card>
      )}
      <Card style={{ gap: 10 }}>
        <SectionTitle>{t('mobile.settings')}</SectionTitle>
        <Text weight="medium">{t('store.language')}</Text>
        <Row><Chip label="English" selected={activeLocale === 'en'} onPress={() => void switchLocale('en')} /><Chip label="العربية" selected={activeLocale === 'ar'} onPress={() => void switchLocale('ar')} /></Row>
        <Text weight="medium">{t('mobile.appearance')}</Text>
        <Row>{(['system', 'light', 'dark'] as ThemePreference[]).map((p) => <Chip key={p} label={t(`mobile.theme_${p}`)} selected={preference === p} onPress={() => setPreference(p)} />)}</Row>
      </Card>
      <View style={{ gap: 8 }}>
        <Button label={t('store.support')} variant="outline" onPress={() => router.push('/support')} />
        <Button label={t('demo.open')} variant="outline" onPress={() => router.push('/demo')} />
        <Button label={t('designSystem.title')} variant="ghost" onPress={() => router.push('/design-system')} />
        <Button label={t('onboardingMobile.replay')} variant="ghost" onPress={() => void resetOnboarding().then(() => router.replace('/onboarding'))} testID="m-replay-onboarding" />
        {session && <Button label={t('auth.signOut')} variant="danger" loading={logout.isPending} onPress={() => logout.mutate(undefined)} />}
      </View>
    </Screen>
  );
}
