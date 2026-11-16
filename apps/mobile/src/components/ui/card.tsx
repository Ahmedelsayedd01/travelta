import { palette } from '@travelta/design-tokens';
import { View, type ViewProps } from 'react-native';
import { useTheme } from '@/lib/theme';

export function Card({ style, ...props }: ViewProps) {
  const { c, radii, elevation, scheme } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: c.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: 16, gap: 8 },
        scheme === 'light' ? { ...elevation.sm, shadowColor: palette.slate[900] } : null,
        style,
      ]}
      {...props}
    />
  );
}
