import { zodResolver } from '@hookform/resolvers/zod';
import { BOOKING_ITEM_STATUSES, type BookingItemStatus } from '@travelta/contracts';
import { emailSchema, requiredText, z } from '@travelta/schemas';
import { formatMoney, money } from '@travelta/shared';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { activeLocale } from '@/lib/i18n';
import { useTheme, type ThemePreference } from '@/lib/theme';

const statusTone: Record<BookingItemStatus, BadgeTone> = {
  pending: 'warning', confirmed: 'info', vouchered: 'primary', travelled: 'success', cancelled: 'danger', rejected: 'danger', no_show: 'neutral',
};

const formSchema = z.object({ name: requiredText(120), email: emailSchema });
type FormValues = z.input<typeof formSchema>;

export function DesignSystemScreen() {
  const { t } = useTranslation();
  const { c, preference, setPreference } = useTheme();
  const { control, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: '', email: '' } });

  const swatches = [
    ['primary', c.primary, c['on-primary']],
    ['secondary', c.secondary, c['on-secondary']],
    ['accent', c.accent, c['on-accent']],
    ['highlight', c.highlight, c['on-highlight']],
  ] as const;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} style={{ backgroundColor: c.canvas }}>
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={t('common.theme')}>
        {(['light', 'dark', 'system'] as ThemePreference[]).map((p) => (
          <Pressable
            key={p}
            accessibilityRole="radio"
            accessibilityState={{ checked: preference === p }}
            onPress={() => setPreference(p)}
            style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: preference === p ? c.primary : c.border, backgroundColor: preference === p ? c['primary-soft'] : c.surface }}
          >
            <Text size="sm" weight="medium">{t(`common.${p}Theme`)}</Text>
          </Pressable>
        ))}
      </View>

      <Text size="xl" weight="semibold">{t('designSystem.colors')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {swatches.map(([name, bg, fg]) => (
          <View key={name} style={{ width: '48%', height: 64, borderRadius: 12, backgroundColor: bg, justifyContent: 'flex-end', padding: 10 }}>
            <Text size="sm" weight="semibold" style={{ color: fg }}>{name}</Text>
          </View>
        ))}
      </View>

      <Text size="xl" weight="semibold">{t('designSystem.typography')}</Text>
      <Card>
        <Text size="3xl" weight="bold">{t('common.appName')}</Text>
        <Text size="lg" weight="semibold">{t('common.tagline')}</Text>
        <Text tone="muted">{t('common.simulatedHint')}</Text>
        <Text size="lg" weight="semibold" numeric>{formatMoney(money(85_600, 'EGP'), activeLocale)}</Text>
      </Card>

      <Text size="xl" weight="semibold">{t('designSystem.buttons')}</Text>
      <View style={{ gap: 8 }}>
        <Button label={t('common.confirm')} />
        <Button label={t('common.save')} variant="secondary" />
        <Button label={t('common.cancel')} variant="outline" />
        <Button label={t('common.delete')} variant="danger" onPress={() => Alert.alert(t('designSystem.dialogTitle'), t('designSystem.dialogBody'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.confirm'), style: 'destructive' }])} />
        <Button label={t('common.loading')} loading />
      </View>

      <Text size="xl" weight="semibold">{t('designSystem.forms')}</Text>
      <Card style={{ gap: 12 }}>
        <Controller control={control} name="name" render={({ field }) => (
          <TextField label={t('designSystem.sampleName')} required value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={formState.errors.name?.message} autoComplete="name" />
        )} />
        <Controller control={control} name="email" render={({ field }) => (
          <TextField label={t('designSystem.sampleEmail')} required value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={formState.errors.email?.message} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        )} />
        <Button label={t('common.submit')} onPress={() => void handleSubmit(() => Alert.alert(t('designSystem.sampleSubmitted')))()} />
      </Card>

      <Text size="xl" weight="semibold">{t('designSystem.badges')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {BOOKING_ITEM_STATUSES.map((s) => <Badge key={s} tone={statusTone[s]} label={t(`enums.bookingItemStatus.${s}`)} />)}
        <Badge tone="highlight" label={t('common.demo')} dot={false} />
      </View>

      <Text size="xl" weight="semibold">{t('designSystem.feedback')}</Text>
      <Card><Skeleton style={{ width: '70%' }} /><Skeleton style={{ width: '45%' }} /></Card>
      <EmptyState />
      <ErrorState onRetry={() => undefined} />
    </ScrollView>
  );
}
