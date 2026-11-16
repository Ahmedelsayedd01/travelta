import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Text } from '@/components/ui/text';
import { ensurePermission } from '@/features/notifications/local';
import { useApi } from '@/lib/api-provider';
import { dayTime } from '@/lib/format';
import { activeLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useAction } from '@/lib/use-action';
import { useSession } from '@/store/session';

/** Notification centre: booking, payment and travel updates; tapping opens the trip. */
export default function NotificationsTab() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const api = useApi();
  const token = useSession((s) => s.token);
  const q = useQuery({ queryKey: ['notifications', 'mobile', token], queryFn: () => api.call('notifications.list', { page: 1, pageSize: 50 }), enabled: token !== null });
  const read = useAction((ids?: string[]) => api.call('notifications.markRead', ids ? { ids } : { all: true }));
  if (!token) return <View style={{ flex: 1, padding: 16, backgroundColor: c.canvas }}><EmptyState title={t('storefront.signInTitle')} actionLabel={t('auth.signIn')} onAction={() => router.push('/login')} /></View>;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data) return <View style={{ padding: 16 }}><Skeleton style={{ height: 80 }} /></View>;
  const open = (link: string | null, id: string, unread: boolean) => {
    if (unread) read.mutate([id]);
    const m = link ? /\/bookings\/([^/]+)/.exec(link) : null;
    if (m) router.push(`/trip/${m[1]}`);
  };
  return (
    <FlatList style={{ backgroundColor: c.canvas }} data={q.data.items} keyExtractor={(n) => n.id} contentContainerStyle={{ padding: 12, gap: 10 }}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => void q.refetch()} tintColor={c.primary} />}
      ListHeaderComponent={<View style={{ gap: 8, marginBottom: 4 }}>
        {q.data.unread > 0 && <Button label={t('notifications.markAll')} variant="outline" onPress={() => read.mutate(undefined)} />}
        <Button label={t('mobile.enableAlerts')} variant="ghost" onPress={() => void ensurePermission()} />
      </View>}
      ListEmptyComponent={<EmptyState title={t('notifications.empty')} />}
      renderItem={({ item: n }) => (
        <Pressable onPress={() => open(n.link, n.id, n.readAt === null)} accessibilityRole="button" testID="mobile-notification"
          style={{ backgroundColor: n.readAt === null ? c['primary-soft'] : c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, gap: 4 }}>
          <Text weight={n.readAt === null ? 'semibold' : 'medium'}>{n.title[activeLocale]}</Text>
          <Text tone="muted" size="sm">{n.body[activeLocale]}</Text>
          <Text tone="subtle" size="xs">{dayTime(n.at)}</Text>
        </Pressable>
      )} />
  );
}
