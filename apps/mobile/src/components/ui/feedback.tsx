import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Button } from './button';
import { Text } from './text';

export function Skeleton({ style }: { style?: ViewStyle }) {
  const { c, radii } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View accessibilityElementsHidden style={[{ height: 14, borderRadius: radii.md, backgroundColor: c.subtle, opacity }, style]} />;
}

export function EmptyState({ title, body, actionLabel, onAction }: { title?: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  const { t } = useTranslation();
  const { c, radii } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 8, padding: 24, borderRadius: radii.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: c['border-strong'], backgroundColor: c.surface }}>
      <Text weight="semibold">{title ?? t('common.emptyTitle')}</Text>
      <Text size="sm" tone="muted" style={{ textAlign: 'center' }}>{body ?? t('common.emptyBody')}</Text>
      {actionLabel && onAction ? <Button label={actionLabel} variant="outline" onPress={onAction} /> : null}
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  const { c, radii } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ alignItems: 'center', gap: 8, padding: 24, borderRadius: radii.lg, backgroundColor: c['danger-bg'] }}>
      <Text weight="semibold">{t('common.errorTitle')}</Text>
      <Text size="sm" tone="muted" style={{ textAlign: 'center' }}>{t('common.errorBody')}</Text>
      {onRetry ? <Button label={t('common.retry')} variant="outline" onPress={onRetry} /> : null}
    </View>
  );
}
