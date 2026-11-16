import type { SearchResult } from '@travelta/schemas';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { activeLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { favoriteOf, useFavorites } from './hooks';

/** Save / unsave a result; guests are sent to sign in. 44pt touch target. */
export function Heart({ result }: { result: SearchResult }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { signedIn, keys, toggle } = useFavorites();
  const on = keys.has(result.key);
  const name = result.name[activeLocale];
  return (
    <Pressable hitSlop={8} accessibilityRole="button" accessibilityState={{ selected: on }} testID="m-favorite"
      accessibilityLabel={on ? t('favorites.remove', { name }) : t('favorites.add', { name })}
      onPress={() => (signedIn ? toggle.mutate(favoriteOf(result)) : router.push('/login'))}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, color: on ? c.danger : c['fg-muted'] }}>{on ? '♥' : '♡'}</Text>
    </Pressable>
  );
}
