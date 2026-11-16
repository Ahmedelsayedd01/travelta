import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';
import { controlHeight } from '@travelta/design-tokens';
import { useTheme } from '@/lib/theme';
import { Text } from './text';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  size?: 'md' | 'lg';
  loading?: boolean;
}

export function Button({ label, variant = 'primary', size = 'md', loading, disabled, style, ...props }: ButtonProps) {
  const { c, radii, scheme } = useTheme();
  const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.primary, fg: c['on-primary'] },
    secondary: { bg: c.secondary, fg: c['on-secondary'] },
    outline: { bg: c.surface, fg: c.fg, border: c['border-strong'] },
    ghost: { bg: 'transparent', fg: c.primary },
    danger: { bg: c.danger, fg: scheme === 'dark' ? c.canvas : c['on-primary'] },
  };
  const p = palette[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        {
          minHeight: size === 'lg' ? controlHeight.lg : Math.max(controlHeight.md, controlHeight.touchMin),
          backgroundColor: p.bg,
          borderRadius: radii.md,
          borderColor: p.border ?? 'transparent',
          opacity: isDisabled ? 0.5 : state.pressed ? 0.85 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading && <ActivityIndicator color={p.fg} size="small" />}
      <Text weight="semibold" size={size === 'lg' ? 'lg' : 'base'} style={{ color: p.fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, borderWidth: 1 },
});
