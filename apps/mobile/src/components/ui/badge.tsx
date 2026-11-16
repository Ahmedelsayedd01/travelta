import { View } from 'react-native';
import type { ColorRole } from '@travelta/design-tokens';
import { useTheme } from '@/lib/theme';
import { Text } from './text';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'highlight';

const map: Record<BadgeTone, [bg: ColorRole, fg: ColorRole]> = {
  neutral: ['neutral-bg', 'neutral'],
  primary: ['primary-soft', 'on-primary-soft'],
  success: ['success-bg', 'success'],
  warning: ['warning-bg', 'warning'],
  danger: ['danger-bg', 'danger'],
  info: ['info-bg', 'info'],
  highlight: ['highlight', 'on-highlight'],
};

export function Badge({ label, tone = 'neutral', dot = true }: { label: string; tone?: BadgeTone; dot?: boolean }) {
  const { c, radii } = useTheme();
  const [bg, fg] = map[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.sm, backgroundColor: c[bg] }}>
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c[fg] }} />}
      <Text size="xs" weight="semibold" style={{ color: c[fg] }}>{label}</Text>
    </View>
  );
}
