import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Chip, Row, Screen, SectionTitle } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useApi } from '@/lib/api-provider';
import { useAction } from '@/lib/use-action';
import { useSession } from '@/store/session';

const TOPICS = ['booking', 'payment', 'cancellation', 'other'] as const;
const FAQ = ['faqCancel', 'faqPay', 'faqVoucher', 'faqChange'] as const;

/** Support: ticket to the seller's team (with an emailed copy) and FAQ. */
export default function Support() {
  const { t } = useTranslation();
  const api = useApi();
  const { booking } = useLocalSearchParams<{ booking?: string }>();
  const token = useSession((s) => s.token);
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>(booking ? 'booking' : 'other');
  const [message, setMessage] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const trips = useQuery({ queryKey: ['bookings', 'mobile', 'support', token], queryFn: () => api.call('bookings.list', { page: 1, pageSize: 1 }), enabled: token !== null });
  const send = useAction(() => api.call('account.support', { topic, bookingId: booking ?? null, message }), { onSuccess: (o) => { setTicket(o.ticket); setMessage(''); } });
  void trips;
  return (
    <Screen>
      <Stack.Screen options={{ title: t('store.support') }} />
      {token && (
        <Card style={{ gap: 10 }}>
          {ticket && <Text tone="success" weight="semibold" testID="m-ticket">{t('store.ticketCreated', { ticket })}</Text>}
          <Row style={{ flexWrap: 'wrap' }}>{TOPICS.map((x) => <Chip key={x} label={t(`store.topic_${x}`)} selected={topic === x} onPress={() => setTopic(x)} />)}</Row>
          <TextField label={t('store.message')} value={message} onChangeText={setMessage} multiline style={{ minHeight: 100, textAlignVertical: 'top' }} testID="m-support-message" />
          <Button label={t('store.send')} disabled={message.trim().length < 10} loading={send.isPending} onPress={() => send.mutate(undefined)} testID="m-support-send" />
        </Card>
      )}
      <SectionTitle>{t('store.faq')}</SectionTitle>
      {FAQ.map((k) => <Card key={k} style={{ gap: 4 }}><Text weight="semibold">{t(`store.${k}Q`)}</Text><Text tone="muted" size="sm">{t(`store.${k}A`)}</Text></Card>)}
    </Screen>
  );
}
