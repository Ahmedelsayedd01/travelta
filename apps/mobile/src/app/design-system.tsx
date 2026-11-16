import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DesignSystemScreen } from '@/features/design-system/design-system-screen';

export default function DesignSystemRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('designSystem.title') }} />
      <DesignSystemScreen />
    </>
  );
}
