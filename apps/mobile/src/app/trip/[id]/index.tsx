import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { KeyValue, Row, Screen, SectionTitle } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useApi } from '@/lib/api-provider';
import { day, money } from '@/lib/format';
import { activeLocale } from '@/lib/i18n';
import { useAction } from '@/lib/use-action';
import { STATUS_TONE } from '../../(tabs)/trips';

/** Trip: items and statuses, money, pay now (pay later), self-service cancellation with fee preview, vouchers. */
export default function Trip() {
  const { t } = useTranslation();
  const api = useApi();
  const { id, confirmed } = useLocalSearchParams<{ id: string; confirmed?: string }>();
  const b = useQuery({ queryKey: ['bookings', 'mobile', id], queryFn: () => api.call('bookings.get', { id }) });
  const fin = useQuery({ queryKey: ['finance', 'mobile', id], queryFn: () => api.call('bookings.finance', { bookingId: id }) });
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [card, setCard] = useState<{ number: string; expiry: string; cvc: string; holder: string } | null>(null);
  const quote = useQuery({ queryKey: ['cancellations', 'quote', cancelFor], queryFn: () => api.call('cancellations.quote', { bookingId: id, itemId: cancelFor! }), enabled: cancelFor !== null });
  const cancel = useAction(() => api.call('cancellations.request', { bookingId: id, itemId: cancelFor!, reason, refundMethod: quote.data!.defaultRefundMethod }), { success: t('finance.cancelDone'), onSuccess: () => { setCancelFor(null); setReason(''); } });
  const pay = useAction(() => api.call('account.payByCard', { bookingId: id, card: card! }), { success: t('finance.paidOnline'), onSuccess: () => setCard(null) });
  if (b.isError) return <ErrorState onRetry={() => void b.refetch()} />;
  if (!b.data || !fin.data) return <View style={{ padding: 16 }}><Skeleton style={{ height: 200 }} /></View>;
  const bk = b.data;
  const f = fin.data;
  return (
    <Screen onRefresh={() => { void b.refetch(); void fin.refetch(); }}>
      <Stack.Screen options={{ title: bk.ref }} />
      {confirmed && <Card><Text weight="semibold" tone="success">{t('mobile.bookingPlaced', { ref: bk.ref })}</Text></Card>}
      <Row style={{ justifyContent: 'space-between' }}><Text size="xl" weight="bold">{bk.ref}</Text><Badge label={t(`enums.bookingStatus.${bk.status}`)} tone={STATUS_TONE[bk.status]} /></Row>
      {bk.items.map((i) => (
        <Card key={i.id} style={{ gap: 6 }} testID="mobile-trip-item">
          <Row style={{ justifyContent: 'space-between' }}><Text weight="semibold" style={{ flex: 1 }}>{i.title[activeLocale]}</Text><Badge label={t(`enums.bookingItemStatus.${i.status}`)} tone="neutral" /></Row>
          <Text tone="muted" size="sm">{day(i.from)}{i.to ? ` → ${day(i.to)}` : ''} · {i.supplierName}</Text>
          {i.supplierRef && <Text size="sm">{t('bookings.supplierRef')}: {i.supplierRef}</Text>}
          <Row style={{ flexWrap: 'wrap' }}>
            {i.voucherNo && <Button label={t('bookings.viewVoucher')} variant="outline" onPress={() => router.push(`/trip/${bk.id}/voucher?item=${i.id}`)} testID="mobile-voucher" />}
            {i.actions.includes('cancel') && <Button label={t('finance.cancelItem')} variant="ghost" onPress={() => setCancelFor(i.id)} testID="mobile-cancel" />}
          </Row>
          {cancelFor === i.id && (
            <View style={{ gap: 8 }}>
              {quote.data ? (
                <>
                  <KeyValue label={t('finance.policyFee', { days: quote.data.daysBefore })} value={money(quote.data.retainedMinor, quote.data.currency)} />
                  <KeyValue label={t('finance.refundToCustomer')} value={money(quote.data.refundMinor, quote.data.currency)} strong />
                  <TextField label={t('bookings.reason')} value={reason} onChangeText={setReason} />
                  <Button label={t('finance.confirmCancel')} variant="danger" disabled={reason.trim().length < 3} loading={cancel.isPending} onPress={() => cancel.mutate(undefined)} testID="mobile-cancel-confirm" />
                </>
              ) : <Skeleton style={{ height: 60 }} />}
            </View>
          )}
        </Card>
      ))}
      <Card style={{ gap: 8 }}>
        <SectionTitle>{t('finance.moneyTitle')}</SectionTitle>
        <KeyValue label={t('finance.due')} value={money(f.dueMinor, f.currency)} />
        <KeyValue label={t('finance.paid')} value={money(f.paidMinor - f.refundedMinor, f.currency)} />
        <KeyValue label={t('finance.outstanding')} value={money(Math.max(0, f.outstandingMinor), f.currency)} strong />
        {bk.status !== 'cancelled' && f.outstandingMinor > 0 && (card === null
          ? <Button label={t('finance.payNow')} onPress={() => setCard({ number: '', expiry: '', cvc: '', holder: '' })} testID="mobile-pay-now" />
          : (
            <View style={{ gap: 8 }}>
              <TextField label={t('finance.cardNumber')} value={card.number} keyboardType="number-pad" onChangeText={(v) => setCard({ ...card, number: v })} />
              <Row><View style={{ flex: 1 }}><TextField label={t('finance.expiry')} value={card.expiry} placeholder="MM/YY" onChangeText={(v) => setCard({ ...card, expiry: v })} /></View><View style={{ flex: 1 }}><TextField label={t('finance.cvc')} value={card.cvc} keyboardType="number-pad" onChangeText={(v) => setCard({ ...card, cvc: v })} /></View></Row>
              <TextField label={t('finance.holder')} value={card.holder} onChangeText={(v) => setCard({ ...card, holder: v })} />
              <Button label={t('finance.payAmount', { amount: money(f.outstandingMinor, f.currency) })} loading={pay.isPending} onPress={() => pay.mutate(undefined)} />
              <Text tone="subtle" size="xs">{t('mobile.simulatedPayment')}</Text>
            </View>
          ))}
      </Card>
      <Button label={t('store.support')} variant="ghost" onPress={() => router.push(`/support?booking=${bk.id}`)} />
    </Screen>
  );
}
