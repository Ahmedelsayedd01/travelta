import '@/lib/i18n';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider } from '@/lib/api-provider';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { WebToaster } from '@/lib/alert';

function ThemedStack() {
  const { c, scheme } = useTheme();
  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.primary,
          headerTitleStyle: { color: c.fg },
          contentStyle: { backgroundColor: c.canvas },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <WebToaster />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ApiProvider>
          <ThemedStack />
        </ApiProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
