import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from './text';

/** Scrollable screen body with the standard 16px gutter and optional pull-to-refresh. */
export function Screen({ children, onRefresh, refreshing = false, style }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean; style?: ViewStyle }) {
  const { c } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.canvas }} contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: 40 }, style]} keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { rtl } = useTheme();
  return <View style={[{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}

/** Label/value line used in summaries (money aligned to the end). */
export function KeyValue({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text tone="muted" size="sm">{label}</Text>
      <Text numeric weight={strong ? 'bold' : 'medium'} size={strong ? 'lg' : 'sm'}>{value}</Text>
    </Row>
  );
}

/** Selectable chip (segmented choices: services, plans, filters). */
export function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" accessibilityState={{ selected }}
      style={{ minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c['primary-soft'] : c.surface }}>
      <Text size="sm" weight={selected ? 'semibold' : 'medium'} style={{ color: selected ? c['on-primary-soft'] : c.fg }}>{label}</Text>
    </Pressable>
  );
}

/** − value + stepper with 44pt hit targets (adults, children, rooms). */
export function Stepper({ label, value, min = 0, max = 9, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  const { c } = useTheme();
  const btn = (text: string, next: number, disabled: boolean) => (
    <Pressable onPress={() => !disabled && onChange(next)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label} ${text}`}
      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <Text size="lg" weight="semibold">{text}</Text>
    </Pressable>
  );
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text weight="medium">{label}</Text>
      <Row>{btn('−', value - 1, value <= min)}<Text numeric weight="semibold" style={{ minWidth: 24, textAlign: 'center' }}>{value}</Text>{btn('+', value + 1, value >= max)}</Row>
    </Row>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text size="lg" weight="semibold">{children}</Text>;
}
