import { useQuery } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { KeyValue, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { useApi } from '@/lib/api-provider';
import { day } from '@/lib/format';
import { activeLocale, isRtl } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** Voucher (BKG-6) with PDF share (expo-print + expo-sharing). */
export default function VoucherScreen() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const api = useApi();
  const { id, item } = useLocalSearchParams<{ id: string; item: string }>();
  const q = useQuery({ queryKey: ['bookings', 'mobile', id], queryFn: () => api.call('bookings.get', { id }) });
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data) return <View style={{ padding: 16 }}><Skeleton style={{ height: 200 }} /></View>;
  const b = q.data;
  const i = b.items.find((x) => x.id === item);
  if (!i?.voucherNo) return <ErrorState />;
  const share = async () => {
    const html = `<!doctype html><html dir="${isRtl ? 'rtl' : 'ltr'}"><body style="font-family:-apple-system,Roboto,sans-serif;padding:24px">
      <h1 style="color:${c.primary}">${esc(t('bookings.voucherTitle'))} ${esc(i.voucherNo!)}</h1><p>${esc(b.sellerName)} · ${esc(b.ref)}</p>
      <h2>${esc(i.title[activeLocale])}</h2><p>${esc(i.subtitle[activeLocale])}</p>
      <p>${esc(day(i.from))}${i.to ? ` → ${esc(day(i.to))}` : ''}</p><p>${esc(t('bookings.supplierRef'))}: ${esc(i.supplierRef ?? '')}</p>
      <ul>${i.travellers.map((tr) => `<li>${esc(tr.firstName)} ${esc(tr.lastName)}</li>`).join('')}</ul><p style="color:#64748b">${esc(t('bookings.voucherPresent'))}</p></body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: i.voucherNo! });
      else Alert.alert(t('mobile.shareUnavailable'));
    } catch {
      Alert.alert(t('errors.INTERNAL'));
    }
  };
  return (
    <Screen>
      <Stack.Screen options={{ title: i.voucherNo }} />
      <Card style={{ gap: 8 }} testID="mobile-voucher-card">
        <Text size="xs" tone="primary" weight="semibold">{t('bookings.voucherTitle')}</Text>
        <Text size="2xl" weight="bold">{i.voucherNo}</Text>
        <Text weight="semibold">{i.title[activeLocale]}</Text>
        <Text tone="muted">{i.subtitle[activeLocale]}</Text>
        <KeyValue label={t('search.date')} value={`${day(i.from)}${i.to ? ` → ${day(i.to)}` : ''}`} />
        <KeyValue label={t('bookings.supplier')} value={i.supplierName} />
        <KeyValue label={t('bookings.supplierRef')} value={i.supplierRef ?? '—'} />
        {i.travellers.map((tr, k) => <Text key={k}>{tr.firstName} {tr.lastName}{tr.lead ? ` (${t('checkout.leadTraveller')})` : ''}</Text>)}
        <Text tone="subtle" size="xs">{t('bookings.voucherPresent')}</Text>
      </Card>
      <Button label={t('mobile.shareVoucher')} onPress={() => void share()} testID="mobile-share" />
    </Screen>
  );
}
