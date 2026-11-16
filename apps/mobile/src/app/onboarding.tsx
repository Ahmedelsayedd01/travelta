import { Stack } from 'expo-router';
import { OnboardingScreen } from '@/features/onboarding/onboarding-screen';

export default function Onboarding() {
  return (<><Stack.Screen options={{ headerShown: false }} /><OnboardingScreen /></>);
}
