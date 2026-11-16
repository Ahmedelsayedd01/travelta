import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LoginScreen } from '@/features/auth/login-screen';
import { useSession } from '@/store/session';

export default function LoginRoute() {
  const { t } = useTranslation();
  const signedIn = useSession((s) => s.status === 'signedIn');
  if (signedIn) return <Redirect href="/" />;
  return (
    <>
      <Stack.Screen options={{ title: t('auth.customerTitle') }} />
      <LoginScreen />
    </>
  );
}
