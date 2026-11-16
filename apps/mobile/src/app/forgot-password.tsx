import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ForgotScreen } from '@/features/auth/forgot-screen';

export default function ForgotPassword() {
  const { t } = useTranslation();
  return (<><Stack.Screen options={{ title: t('auth.forgotTitle') }} /><ForgotScreen /></>);
}
