import type { FontSizeKey } from '@travelta/design-tokens';
import { Text as RNText, type TextProps } from 'react-native';
import { useTheme } from '@/lib/theme';

type Tone = 'default' | 'muted' | 'subtle' | 'primary' | 'danger' | 'success' | 'onPrimary';

interface AppTextProps extends TextProps {
  size?: FontSizeKey;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  tone?: Tone;
  numeric?: boolean;
}

export function Text({ size = 'base', weight = 'regular', tone = 'default', numeric, style, ...props }: AppTextProps) {
  const { c, font } = useTheme();
  const color = {
    default: c.fg, muted: c['fg-muted'], subtle: c['fg-subtle'], primary: c.primary, danger: c.danger, success: c.success, onPrimary: c['on-primary'],
  }[tone];
  return (
    <RNText
      style={[font(size, weight), { color, textAlign: 'auto', writingDirection: 'auto' }, numeric && { fontVariant: ['tabular-nums'] }, style]}
      {...props}
    />
  );
}
