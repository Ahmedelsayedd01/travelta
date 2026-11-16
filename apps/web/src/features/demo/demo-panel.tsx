'use client';

import { demoSnapshotSchema, type DemoSnapshot } from '@travelta/schemas';
import { CalendarClock, Database, Download, FlaskConical, RotateCcw, Upload } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ApiClientError } from '@travelta/api-client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDemoStatus, useExportDemo, useImportDemo, useResetDemo, useSetClock, useSetSimulation } from './hooks';
import { RoleSwitcher } from './role-switcher';

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="tabular text-end font-medium text-fg">{children}</dd>
    </div>
  );
}

function Group({ icon, title, help, children }: { icon: ReactNode; title: ReactNode; help?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h3 className="flex items-center gap-2 font-semibold text-fg [&_svg]:size-4 [&_svg]:text-primary">
        {icon}
        {title}
      </h3>
      {help && <p className="-mt-1 text-sm text-fg-muted">{help}</p>}
      {children}
    </section>
  );
}

const errorText = (e: unknown, t: (code: ApiClientError['code']) => string) => (e instanceof ApiClientError ? t(e.code) : String(e));

/** Floating prototype controls: dataset status, demo clock, latency/failure simulation, reset, export and import. */
export function DemoPanel() {
  const t = useTranslations('demo');
  const tAll = useTranslations('errors');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ name: string; snapshot: DemoSnapshot } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const status = useDemoStatus(open);
  const reset = useResetDemo();
  const setClock = useSetClock();
  const setSimulation = useSetSimulation();
  const exportDemo = useExportDemo();
  const importDemo = useImportDemo();
  const [latency, setLatency] = useState<{ min: string; max: string; failure: string } | null>(null);

  const s = status.data;
  const offset = s?.clockOffsetDays ?? 0;
  const totalRecords = s ? Object.values(s.counts).reduce((a, b) => a + b, 0) : 0;
  const sim = latency ?? (s ? { min: String(s.latency.minMs), max: String(s.latency.maxMs), failure: String(Math.round(s.failureRate * 100)) } : null);

  const moveClock = (days: number) =>
    setClock.mutate(days, { onSuccess: () => toast.success(t('clockDone')), onError: (e) => toast.error(errorText(e, tAll)) });

  const onExport = () =>
    exportDemo.mutate(undefined, {
      onSuccess: (snapshot) => {
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: `travelta-demo-${snapshot.exportedAt?.slice(0, 10) ?? 'export'}.json` });
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t('exportDone'));
      },
      onError: (e) => toast.error(errorText(e, tAll)),
    });

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = demoSnapshotSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error('shape');
      setPendingImport({ name: file.name, snapshot: parsed.data });
    } catch {
      toast.error(t('importInvalid'));
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="fixed end-4 bottom-4 z-40 shadow-md"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <FlaskConical aria-hidden />
        {t('open')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen} title={t('panelTitle')} description={t('subtitle')} size="lg">
        {!s ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <RoleSwitcher onSwitched={() => setOpen(false)} />
            <Group icon={<Database />} title={t('status')} help={t('deviceOnly')}>
              <dl className="divide-y divide-border">
                <Row label={t('today')}>{format.dateTime(new Date(s.now), { dateStyle: 'medium', timeStyle: 'short' })}</Row>
                <Row label={t('offset')}>{t('offsetDays', { days: offset })}</Row>
                <Row label={t('seededAt')}>{format.dateTime(new Date(s.seededAt), { dateStyle: 'medium' })}</Row>
                <Row label={t('seed')}>{s.seed}</Row>
                <Row label={t('records')}>{format.number(totalRecords)}</Row>
                <Row label={t('fingerprint')}><code dir="ltr">{s.fingerprint}</code></Row>
              </dl>
            </Group>

            <Group icon={<CalendarClock />} title={t('clock')} help={t('clockHelp')}>
              <div className="flex flex-wrap gap-2">
                {[-30, -7, -1, 1, 7, 30].map((d) => (
                  <Button key={d} variant="outline" size="sm" onClick={() => moveClock(offset + d)} disabled={setClock.isPending}>
                    <span dir="ltr">{d > 0 ? `+${d}` : d}d</span>
                  </Button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => moveClock(0)} disabled={offset === 0 || setClock.isPending}>
                <RotateCcw aria-hidden />
                {t('resetClock')}
              </Button>
            </Group>

            <Group icon={<FlaskConical />} title={t('simulation')} help={t('failureHelp')}>
              {sim && (
                <form
                  className="grid grid-cols-3 items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const minMs = Number(sim.min);
                    const maxMs = Number(sim.max);
                    const failureRate = Number(sim.failure) / 100;
                    setSimulation.mutate(
                      { latency: { minMs, maxMs }, failureRate },
                      { onSuccess: () => { setLatency(null); toast.success(t('simulationDone')); }, onError: (err) => toast.error(errorText(err, tAll)) },
                    );
                  }}
                >
                  <Field label={t('latencyMin')}>
                    <Input type="number" min={0} max={10000} value={sim.min} onChange={(e) => setLatency({ ...sim, min: e.target.value })} />
                  </Field>
                  <Field label={t('latencyMax')}>
                    <Input type="number" min={0} max={10000} value={sim.max} onChange={(e) => setLatency({ ...sim, max: e.target.value })} />
                  </Field>
                  <Field label={`${t('failureRate')} %`}>
                    <Input type="number" min={0} max={100} value={sim.failure} onChange={(e) => setLatency({ ...sim, failure: e.target.value })} />
                  </Field>
                  <Button type="submit" size="sm" className="col-span-3 justify-self-start" loading={setSimulation.isPending}>
                    {t('apply')}
                  </Button>
                </form>
              )}
            </Group>

            <Group icon={<Database />} title={t('data')}>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onExport} loading={exportDemo.isPending}>
                  <Download aria-hidden />
                  {t('export')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                  <Upload aria-hidden />
                  {t('import')}
                </Button>
                <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" onChange={onFile} aria-label={t('import')} />
                <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
                  <RotateCcw aria-hidden />
                  {t('reset')}
                </Button>
              </div>
            </Group>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('resetTitle')}
        description={t('resetBody')}
        confirmLabel={t('reset')}
        loading={reset.isPending}
        onConfirm={() =>
          reset.mutate(undefined, {
            onSuccess: () => { setConfirmReset(false); toast.success(t('resetDone')); },
            onError: (e) => toast.error(errorText(e, tAll)),
          })
        }
      />

      <ConfirmDialog
        open={pendingImport !== null}
        onOpenChange={(o) => !o && setPendingImport(null)}
        title={t('importTitle')}
        description={pendingImport ? t('importBody', { file: pendingImport.name }) : undefined}
        confirmLabel={t('import')}
        loading={importDemo.isPending}
        onConfirm={() => {
          if (!pendingImport) return;
          importDemo.mutate(pendingImport.snapshot, {
            onSuccess: () => { setPendingImport(null); toast.success(t('importDone')); },
            onError: (e) => toast.error(errorText(e, tAll)),
          });
        }}
      />
    </>
  );
}
