import { useMutation, useQuery } from '@tanstack/react-query';
import type { CartItemDto, CheckoutInput, ItemDetails, Traveller } from '@travelta/schemas';
import { ApiClientError } from '@travelta/api-client';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { Chip, KeyValue, Row, Screen, SectionTitle } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useApi } from '@/lib/api-provider';
import { money } from '@/lib/format';
import { activeLocale } from '@/lib/i18n';

const PASSPORT = ['flight', 'visa', 'umrah'];
const blank = (i: CartItemDto): Traveller[] => {
  const hotel = i.serviceType === 'hotel' && i.occupancy.rooms.length > 0;
  const adults = hotel ? i.occupancy.rooms.reduce((a, r) => a + r.adults, 0) : i.occupancy.adults;
  const children = hotel ? i.occupancy.rooms.reduce((a, r) => a + r.childAges.length, 0) : i.occupancy.children;
  const mk = (type: Traveller['type'], lead: boolean): Traveller => ({ type, title: type === 'adult' ? 'mr' : 'mstr', firstName: '', lastName: '', dateOfBirth: type === 'adult' ? null : '2018-01-01', nationalityIso2: 'EG', passportNo: null, passportExpiry: null, mahram: null, lead });
  return [...Array.from({ length: adults }, (_, k) => mk('adult', k === 0)), ...Array.from({ length: children }, () => mk('child', false))];
};

/** Checkout: recheck prices (QTE-2) → travellers per item → card or pay later → idempotent submit. Simulated payment. */
export default function Checkout() {
  const { t } = useTranslation();
  const api = useApi();
  const [key] = useState(() => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const recheck = useQuery({ queryKey: ['checkout', 'mobile', 'recheck'], queryFn: () => api.call('checkout.recheck', {}), staleTime: 0 });
  const [travellers, setTravellers] = useState<Record<string, Traveller[]>>({});
  const [details, setDetails] = useState<Record<string, ItemDetails>>({});
  const [method, setMethod] = useState<'card' | 'pay_later'>('card');
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '', holder: '', threeDsCode: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const items = recheck.data?.cart.items ?? [];
  // Traveller forms start blank per item occupancy; edits are kept per item.
  const travellersOf = (i: CartItemDto) => travellers[i.id] ?? blank(i);
  const submit = useMutation({
    mutationFn: () => api.call('checkout.submit', {
      idempotencyKey: key, customerId: null,
      items: items.map((i) => ({ itemId: i.id, travellers: travellersOf(i), details: { ...(i.times.length ? { time: i.times[0] } : {}), ...(details[i.id] ?? {}) }, acceptedPriceMinor: i.priceMinor })),
      payment: (method === 'card' ? { method: 'card', card: { ...card, threeDsCode: card.threeDsCode || undefined } } : { method: 'pay_later' }) as CheckoutInput['payment'],
    }),
    onSuccess: (b) => router.replace(`/trip/${b.id}?confirmed=1`),
    onError: (e) => {
      if (e instanceof ApiClientError) {
        setErrors(e.fieldErrors());
        if (e.code === 'PRICE_CHANGED' || e.code === 'SOLD_OUT') void recheck.refetch();
        Alert.alert(t(`errors.${e.code}`));
      }
    },
  });
  const setT = (item: CartItemDto, k: number, patch: Partial<Traveller>) => setTravellers({ ...travellers, [item.id]: travellersOf(item).map((x, j) => (j === k ? { ...x, ...patch } : x)) });
  const attach = async (itemId: string) => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
    const a = r.assets?.[0];
    if (r.canceled || !a) return;
    const b64 = await new File(a.uri).base64();
    const file = { name: a.name.slice(0, 160), type: (a.mimeType ?? 'image/jpeg') as 'application/pdf', size: a.size ?? b64.length, dataUrl: `data:${a.mimeType ?? 'image/jpeg'};base64,${b64}` };
    setDetails({ ...details, [itemId]: { ...(details[itemId] ?? {}), documents: [...(details[itemId]?.documents ?? []), file] } });
  };
  if (!recheck.data) return <View style={{ padding: 16 }}><Skeleton style={{ height: 200 }} /></View>;
  const changed = recheck.data.changes.filter((c) => c.status !== 'ok');
  const total = items.reduce((s, i) => s + i.priceMinor, 0);
  return (
    <Screen>
      <Stack.Screen options={{ title: t('checkout.title') }} />
      {changed.length > 0 && <Card><Text tone="danger" weight="semibold">{t('checkout.pricesChangedError')}</Text></Card>}
      {items.map((i, n) => (
        <Card key={i.id} style={{ gap: 10 }}>
          <SectionTitle>{`${n + 1}. ${i.title[activeLocale]}`}</SectionTitle>
          {travellersOf(i).map((tr, k) => (
            <View key={k} style={{ gap: 8 }}>
              <Row><Badge label={t(`enums.paxType.${tr.type}`)} tone="neutral" dot={false} />{tr.lead && <Badge label={t('checkout.leadTraveller')} tone="primary" dot={false} />}</Row>
              <TextField label={t('checkout.firstName')} value={tr.firstName} onChangeText={(v) => setT(i, k, { firstName: v })} error={errors[`items.${n}.travellers.${k}.firstName`]} testID={`m-first-${n}-${k}`} />
              <TextField label={t('checkout.lastName')} value={tr.lastName} onChangeText={(v) => setT(i, k, { lastName: v })} error={errors[`items.${n}.travellers.${k}.lastName`]} testID={`m-last-${n}-${k}`} />
              {PASSPORT.includes(i.serviceType) && (
                <>
                  <TextField label={t('checkout.passportNo')} value={tr.passportNo ?? ''} autoCapitalize="characters" onChangeText={(v) => setT(i, k, { passportNo: v || null })} error={errors[`items.${n}.travellers.${k}.passportNo`]} />
                  <TextField label={t('checkout.passportExpiry')} value={tr.passportExpiry ?? ''} placeholder="YYYY-MM-DD" onChangeText={(v) => setT(i, k, { passportExpiry: v || null })} error={errors[`items.${n}.travellers.${k}.passportExpiry`]} />
                </>
              )}
            </View>
          ))}
          {i.serviceType === 'visa' && (
            <Row style={{ justifyContent: 'space-between' }}>
              <Text size="sm">{t('mobile.documents', { n: details[i.id]?.documents?.length ?? 0 })}</Text>
              <Button label={t('mobile.attach')} variant="outline" onPress={() => void attach(i.id)} />
            </Row>
          )}
          <KeyValue label={t('cart.total')} value={money(i.priceMinor, recheck.data.cart.currency)} />
        </Card>
      ))}
      <Card style={{ gap: 10 }}>
        <SectionTitle>{t('checkout.stepPayment')}</SectionTitle>
        <Row><Chip label={t('checkout.payByCard')} selected={method === 'card'} onPress={() => setMethod('card')} /><Chip label={t('checkout.payLater')} selected={method === 'pay_later'} onPress={() => setMethod('pay_later')} /></Row>
        {method === 'card' && (
          <>
            <TextField label={t('finance.cardNumber')} value={card.number} keyboardType="number-pad" onChangeText={(v) => setCard({ ...card, number: v })} error={errors['payment.card.number']} testID="m-card" />
            <Row><View style={{ flex: 1 }}><TextField label={t('finance.expiry')} value={card.expiry} placeholder="MM/YY" onChangeText={(v) => setCard({ ...card, expiry: v })} error={errors['payment.card.expiry']} /></View>
              <View style={{ flex: 1 }}><TextField label={t('finance.cvc')} value={card.cvc} keyboardType="number-pad" onChangeText={(v) => setCard({ ...card, cvc: v })} error={errors['payment.card.cvc']} /></View></Row>
            <TextField label={t('finance.holder')} value={card.holder} onChangeText={(v) => setCard({ ...card, holder: v })} error={errors['payment.card.holder']} />
            {card.number.replace(/\s/g, '') === '4000000000003220' && <TextField label={t('mobile.threeDs')} value={card.threeDsCode} keyboardType="number-pad" onChangeText={(v) => setCard({ ...card, threeDsCode: v })} error={errors['payment.card.threeDsCode']} />}
            <Text tone="subtle" size="xs">{t('mobile.simulatedPayment')}</Text>
          </>
        )}
        <KeyValue label={t('cart.total')} value={money(total, recheck.data.cart.currency)} strong />
        <Button label={t('checkout.submit')} size="lg" loading={submit.isPending} disabled={items.length === 0} onPress={() => submit.mutate()} testID="m-submit" />
      </Card>
    </Screen>
  );
}
