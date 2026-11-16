import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, type ColorValue } from 'react-native';
import { useNotificationBadge } from '@/features/notifications/local';
import { useTheme } from '@/lib/theme';

function TabGlyph({ g, color }: { g: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18 }} accessibilityElementsHidden>{g}</Text>;
}

/** Home · Explore · Bookings · Favorites · Profile. Notifications open from the bell on Home (badge kept). */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const unread = useNotificationBadge();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c['fg-muted'], tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border }, headerStyle: { backgroundColor: c.surface }, headerTitleStyle: { color: c.fg }, sceneStyle: { backgroundColor: c.canvas } }}>
      <Tabs.Screen name="home" options={{ title: t('mobile.home'), tabBarIcon: ({ color }) => <TabGlyph g="⌂" color={color} />, headerShown: false, tabBarBadge: unread > 0 ? unread : undefined }} />
      <Tabs.Screen name="search" options={{ title: t('mobile.explore'), tabBarIcon: ({ color }) => <TabGlyph g="⌕" color={color} /> }} />
      <Tabs.Screen name="trips" options={{ title: t('mobile.bookings'), tabBarIcon: ({ color }) => <TabGlyph g="✈" color={color} /> }} />
      <Tabs.Screen name="favorites" options={{ title: t('nav.favorites'), tabBarIcon: ({ color }) => <TabGlyph g="♡" color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('store.profile'), tabBarIcon: ({ color }) => <TabGlyph g="☺" color={color} /> }} />
      <Tabs.Screen name="notifications" options={{ title: t('notifications.title'), href: null }} />
    </Tabs>
  );
}
