import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DemoScreen } from '@/features/demo/demo-screen';

export default function DemoRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('demo.panelTitle') }} />
      <DemoScreen />
    </>
  );
}
