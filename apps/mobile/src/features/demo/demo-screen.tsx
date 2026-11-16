import { ApiClientError } from '@travelta/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {ScrollView, View } from 'react-native';
import { showAlert } from '@/lib/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { activeLocale } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useDemoActions, useDemoStatus } from './hooks';
import { pickSnapshot, shareSnapshot } from './transfer';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 }}>
      <Text size="sm" tone="muted">{label}</Text>
      <Text size="sm" weight="medium" numeric>{value}</Text>
    </View>
  );
}

/** Mobile counterpart of the web Demo panel: status, clock, simulation, reset, export (share) and import (picker). */
export function DemoScreen() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const status = useDemoStatus();
  const actions = useDemoActions();
  const [sim, setSim] = useState<{ min: string; max: string; failure: string } | null>(null);
  const s = status.data;

  const fail = (e: unknown) => showAlert(t('common.errorTitle'), e instanceof ApiClientError ? t(`errors.${e.code}`) : t('demo.importInvalid'));
  const done = (key: string) => showAlert(t(key));

  if (!s) {
    return (
      <View style={{ padding: 16, gap: 8 }}>
        <Skeleton style={{ width: '50%', height: 20 }} />
        <Skeleton style={{ height: 120 }} />
      </View>
    );
  }
  const values = sim ?? { min: String(s.latency.minMs), max: String(s.latency.maxMs), failure: String(Math.round(s.failureRate * 100)) };
  const dateFmt = new Intl.DateTimeFormat(activeLocale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const records = Object.values(s.counts).reduce((a, b) => a + b, 0);

  return (
    <ScrollView style={{ backgroundColor: c.canvas }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text tone="muted">{t('demo.subtitle')}</Text>

      <Card>
        <Text weight="semibold">{t('demo.status')}</Text>
        <Row label={t('demo.today')} value={dateFmt.format(new Date(s.now))} />
        <Row label={t('demo.offset')} value={t('demo.offsetDays', { days: s.clockOffsetDays })} />
        <Row label={t('demo.records')} value={String(records)} />
        <Row label={t('demo.fingerprint')} value={s.fingerprint} />
        <Text size="xs" tone="muted">{t('demo.deviceOnly')}</Text>
      </Card>

      <Card>
        <Text weight="semibold">{t('demo.clock')}</Text>
        <Text size="sm" tone="muted">{t('demo.clockHelp')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[-30, -7, -1, 1, 7, 30].map((d) => (
            <View key={d} style={{ flexBasis: '30%', flexGrow: 1 }}>
              <Button
                label={`${d > 0 ? '+' : ''}${d}d`}
                variant="outline"
                disabled={actions.setClock.isPending}
                onPress={() => actions.setClock.mutate(s.clockOffsetDays + d, { onError: fail })}
              />
            </View>
          ))}
        </View>
        <Button label={t('demo.resetClock')} variant="ghost" disabled={s.clockOffsetDays === 0} onPress={() => actions.setClock.mutate(0, { onError: fail })} />
      </Card>

      <Card style={{ gap: 12 }}>
        <Text weight="semibold">{t('demo.simulation')}</Text>
        <Text size="sm" tone="muted">{t('demo.failureHelp')}</Text>
        <TextField label={t('demo.latencyMin')} keyboardType="number-pad" value={values.min} onChangeText={(v) => setSim({ ...values, min: v })} />
        <TextField label={t('demo.latencyMax')} keyboardType="number-pad" value={values.max} onChangeText={(v) => setSim({ ...values, max: v })} />
        <TextField label={`${t('demo.failureRate')} %`} keyboardType="number-pad" value={values.failure} onChangeText={(v) => setSim({ ...values, failure: v })} />
        <Button
          label={t('demo.apply')}
          loading={actions.setSimulation.isPending}
          onPress={() =>
            actions.setSimulation.mutate(
              { latency: { minMs: Number(values.min), maxMs: Number(values.max) }, failureRate: Number(values.failure) / 100 },
              { onSuccess: () => { setSim(null); done('demo.simulationDone'); }, onError: fail },
            )
          }
        />
      </Card>

      <Card style={{ gap: 8 }}>
        <Text weight="semibold">{t('demo.data')}</Text>
        <Button
          label={t('demo.export')}
          variant="outline"
          loading={actions.exportSnapshot.isPending}
          onPress={() => actions.exportSnapshot.mutate(undefined, { onSuccess: (snap) => void shareSnapshot(snap).catch(fail), onError: fail })}
        />
        <Button
          label={t('demo.import')}
          variant="outline"
          onPress={() =>
            void pickSnapshot()
              .then((picked) => {
                if (!picked) return;
                showAlert(t('demo.importTitle'), t('demo.importBody', { file: picked.name }), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('demo.import'), onPress: () => actions.importSnapshot.mutate(picked.snapshot, { onSuccess: () => done('demo.importDone'), onError: fail }) },
                ]);
              })
              .catch(fail)
          }
        />
        <Button
          label={t('demo.reset')}
          variant="danger"
          loading={actions.reset.isPending}
          onPress={() =>
            showAlert(t('demo.resetTitle'), t('demo.resetBody'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('demo.reset'), style: 'destructive', onPress: () => actions.reset.mutate(undefined, { onSuccess: () => done('demo.resetDone'), onError: fail }) },
            ])
          }
        />
      </Card>
    </ScrollView>
  );
}
