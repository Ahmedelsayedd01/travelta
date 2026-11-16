import { useQuery } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useApi } from '@/lib/api-provider';
import { activeLocale } from '@/lib/i18n';
import { useSession } from '@/store/session';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

let permission: Promise<boolean> | null = null;
/** Ask once; a refusal keeps notifications in the in-app centre only. */
export function ensurePermission(): Promise<boolean> {
  permission ??= (async () => {
    if (Platform.OS === 'web') return false;
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  })().catch(() => false);
  return permission;
}

/**
 * MOBILE_ARCHITECTURE §6: mock-server events land in the in-app centre; new unread ones also fire a LOCAL notification
 * when permission is granted. No push token is ever registered. Returns the unread count for the tab badge.
 */
export function useNotificationBadge(): number {
  const api = useApi();
  const token = useSession((s) => s.token);
  const seen = useRef<Set<string> | null>(null);
  const q = useQuery({ queryKey: ['notifications', 'badge', token], queryFn: () => api.call('notifications.list', { page: 1, pageSize: 10, filters: { unread: 'true' } }), enabled: token !== null, refetchInterval: 30_000 });
  useEffect(() => {
    if (!q.data) return;
    const ids = q.data.items.map((n) => n.id);
    if (seen.current === null) { seen.current = new Set(ids); return; } // first load: don't replay history
    const fresh = q.data.items.filter((n) => !seen.current!.has(n.id));
    fresh.forEach((n) => seen.current!.add(n.id));
    if (fresh.length === 0) return;
    void ensurePermission().then((ok) => {
      if (!ok) return;
      for (const n of fresh.slice(0, 3)) {
        void Notifications.scheduleNotificationAsync({ content: { title: n.title[activeLocale], body: n.body[activeLocale], data: { link: n.link } }, trigger: null });
      }
    });
    void Notifications.setBadgeCountAsync(q.data.unread).catch(() => undefined);
  }, [q.data]);
  return q.data?.unread ?? 0;
}
