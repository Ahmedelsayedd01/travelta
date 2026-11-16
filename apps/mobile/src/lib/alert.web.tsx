import { useEffect } from 'react';
import { Pressable, View, type AlertButton } from 'react-native';
import { create } from 'zustand';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/lib/theme';

/**
 * Expo Web: react-native-web's Alert.alert is an empty function, so messages and confirmations would silently vanish.
 * Plain messages become an accessible toast; alerts with a choice (e.g. "Reset demo data?") use the browser's confirm
 * dialog and run the chosen button's handler.
 */
type Toast = { id: number; title: string; message?: string };
const useToasts = create<{ items: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>()((set) => ({
  items: [],
  push: (t) => set((s) => ({ items: [...s.items.slice(-2), { ...t, id: Date.now() + Math.random() }] })),
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  const cancel = (buttons ?? []).find((b) => b.style === 'cancel');
  if (actions.length > 0 && cancel) {
    const ok = window.confirm(message ? `${title}\n\n${message}` : title);
    (ok ? actions[0] : cancel)?.onPress?.();
    return;
  }
  useToasts.getState().push({ title, message });
  buttons?.[0]?.onPress?.();
}

function ToastItem({ t }: { t: Toast }) {
  const { c } = useTheme();
  const drop = useToasts((s) => s.drop);
  useEffect(() => { const id = setTimeout(() => drop(t.id), 4500); return () => clearTimeout(id); }, [t.id, drop]);
  return (
    <Pressable onPress={() => drop(t.id)} accessibilityRole="alert" testID="web-toast"
      style={{ backgroundColor: c.secondary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, gap: 2, maxWidth: 420, width: '100%', boxShadow: '0 6px 20px rgba(0,0,0,0.25)' }}>
      <Text weight="semibold" style={{ color: c['on-secondary'] }}>{t.title}</Text>
      {t.message ? <Text size="sm" style={{ color: c['on-secondary'], opacity: 0.9 }}>{t.message}</Text> : null}
    </Pressable>
  );
}

export function WebToaster() {
  const items = useToasts((s) => s.items);
  if (items.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 16, left: 16, right: 16, alignItems: 'center', gap: 8, zIndex: 9999 }}>
      {items.map((t) => <ToastItem key={t.id} t={t} />)}
    </View>
  );
}
