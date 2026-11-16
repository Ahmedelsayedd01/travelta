import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useOnboarding } from '@/features/onboarding/state';

/** First launch → onboarding; afterwards straight to Home. */
export default function Index() {
  const status = useOnboarding((s) => s.status);
  const load = useOnboarding((s) => s.load);
  useEffect(() => { if (status === 'loading') void load(); }, [status, load]);
  if (status === 'loading') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  return <Redirect href={status === 'todo' ? '/onboarding' : '/home'} />;
}
