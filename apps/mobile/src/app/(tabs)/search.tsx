import { useQuery } from '@tanstack/react-query';
import { SERVICE_TYPES, type ServiceType } from '@travelta/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, Screen, SectionTitle, Stepper } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useSearchState } from '@/features/search/store';
import { useApi } from '@/lib/api-provider';
import { addDays } from '@/lib/format';
import { activeLocale } from '@/lib/i18n';

const DEFAULT_DEST: Record<ServiceType, string> = { hotel: 'CAI', flight: 'DXB', tour: 'LXR', activity: 'HRG', transfer: 'HRG', visa: 'DXB', umrah: 'MKX' };
const AIRPORTS = ['CAI', 'LXR', 'ASW', 'HRG', 'SSH', 'JED', 'MED', 'RUH', 'DXB', 'IST'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** One search form for all seven services (same SearchInput as the web). */
export default function SearchTab() {
  const { t } = useTranslation();
  const api = useApi();
  const params = useLocalSearchParams<{ service?: ServiceType; dest?: string }>();
  const setInput = useSearchState((s) => s.setInput);
  const today = new Date().toISOString().slice(0, 10);
  const [service, setService] = useState<ServiceType>(params.service ?? 'hotel');
  const [dest, setDest] = useState(params.dest ?? DEFAULT_DEST[params.service ?? 'hotel']);
  const [from, setFrom] = useState(addDays(today, 21));
  const [nights, setNights] = useState(3);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [toCode, setToCode] = useState('DXB');
  const destinations = useQuery({ queryKey: ['reference', 'destinations', 'all'], queryFn: () => api.call('reference.destinations', { page: 1, pageSize: 100 }) });
  const list = destinations.data?.items ?? [];
  const pick = (s: ServiceType) => { setService(s); setDest(DEFAULT_DEST[s]); };
  const valid = ISO.test(from) && from >= today;
  const run = () => {
    const destinationId = list.find((d) => d.code === dest)?.id;
    const hotel = service === 'hotel';
    setInput({
      serviceType: service, destinationId: service === 'flight' ? undefined : destinationId, from, to: hotel ? addDays(from, nights) : undefined,
      rooms: hotel ? [{ adults, childAges: Array.from({ length: children }, () => 8) }] : undefined, adults, children, infants: 0,
      fromCode: service === 'flight' ? 'CAI' : undefined, toCode: service === 'flight' ? toCode : undefined, customerType: 'individual', sort: 'price_asc', pageSize: 20,
    }, { serviceType: service, destinationCode: service === 'flight' ? toCode : dest, from });
    router.push('/search/results');
  };
  return (
    <Screen>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SERVICE_TYPES.map((s) => <Chip key={s} label={t(`enums.serviceType.${s}`)} selected={service === s} onPress={() => pick(s)} testID={`chip-${s}`} />)}
      </ScrollView>
      <Card style={{ gap: 14 }}>
        {service === 'flight' ? (
          <View style={{ gap: 8 }}>
            <SectionTitle>{t('search.toAirport')}</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{AIRPORTS.filter((a) => a !== 'CAI').map((a) => <Chip key={a} label={a} selected={toCode === a} onPress={() => setToCode(a)} />)}</View>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <SectionTitle>{t('search.destination')}</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {list.map((d) => <Chip key={d.id} label={d.name[activeLocale]} selected={dest === d.code} onPress={() => setDest(d.code)} testID={`dest-${d.code}`} />)}
            </View>
          </View>
        )}
        <TextField label={service === 'hotel' ? t('search.checkIn') : t('search.date')} value={from} onChangeText={setFrom} autoCapitalize="none" keyboardType="numbers-and-punctuation" placeholder="YYYY-MM-DD" error={valid ? undefined : 'validation.invalid_date'} />
        {service === 'hotel' && <Stepper label={t('mobile.nights')} value={nights} min={1} max={14} onChange={setNights} />}
        <Stepper label={t('search.adults')} value={adults} min={1} max={9} onChange={setAdults} />
        <Stepper label={t('search.children')} value={children} min={0} max={6} onChange={setChildren} />
      </Card>
      <Button label={t('search.searchButton')} size="lg" disabled={!valid || list.length === 0} onPress={run} testID="run-search" />
      <Text tone="subtle" size="xs">{t('mobile.pricesHint')}</Text>
    </Screen>
  );
}
