'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { SERVICE_TYPES, BOOKING_ITEM_STATUSES } from '@travelta/contracts';
import { brand, chartPalette } from '@travelta/design-tokens';
import { formatMoney, money } from '@travelta/shared';
import { BedDouble, CalendarCheck, ChevronRight, Hourglass, LayoutDashboard, Plane, Receipt, Users, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { DemoBadge, SimulationBadge } from '@/components/feedback/markers';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { StatusBadge } from '@/components/data/status-badge';
import { LocaleSwitcher } from '@/components/theme/locale-switcher';
import { ThemeToggle } from '@/components/theme/theme';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tab, Tabs, TabsList, TabsPanel } from '@/components/ui/tabs';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { sampleFormSchema, type SampleForm } from './sample-form';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

const swatches = [
  ['primary', 'bg-primary text-on-primary'],
  ['secondary', 'bg-secondary text-on-secondary'],
  ['accent', 'bg-accent text-on-accent'],
  ['highlight', 'bg-highlight text-on-highlight'],
  ['canvas', 'bg-canvas text-fg border border-border'],
  ['surface', 'bg-surface text-fg border border-border'],
  ['success', 'bg-success-bg text-success'],
  ['warning', 'bg-warning-bg text-warning'],
  ['danger', 'bg-danger-bg text-danger'],
  ['info', 'bg-info-bg text-info'],
] as const;

const sampleRows = [
  { ref: 'TRV-2611-00042', customer: 'Mona Adel', service: 'hotel', status: 'confirmed', total: 1_245_000 },
  { ref: 'TRV-2611-00043', customer: 'Karim Fathy', service: 'flight', status: 'pending', total: 873_550 },
  { ref: 'TRV-2611-00044', customer: 'Salma Nour', service: 'umrah', status: 'vouchered', total: 6_420_000 },
  { ref: 'TRV-2611-00045', customer: 'Omar Hany', service: 'activity', status: 'cancelled', total: 95_000 },
] as const;

export function DesignSystemShowcase({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);

  const form = useForm<SampleForm>({
    resolver: zodResolver(sampleFormSchema),
    defaultValues: { name: '', email: '', service: 'hotel', notes: '', notify: true },
    mode: 'onTouched',
  });
  const onSubmit = form.handleSubmit(() => toast.success(t('designSystem.sampleSubmitted')));

  return (
    <div className={embedded ? '' : 'flex min-h-dvh'}>
      {/* Navigation sample: the shared portal sidebar look (navy, teal active item). Hidden when embedded in Settings (the real sidebar is visible). */}
      {!embedded && <aside className="hidden w-64 shrink-0 flex-col gap-1 bg-nav p-4 text-nav-fg lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-accent font-bold text-on-accent">T</span>
          <span className="font-semibold">{t('common.appName')}</span>
          <span className="ms-auto rounded-sm bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">{t('enums.orgType.agency')}</span>
        </div>
        {[
          [LayoutDashboard, t('designSystem.navigation'), true],
          [BedDouble, t('enums.serviceType.hotel'), false],
          [Plane, t('enums.serviceType.flight'), false],
          [Users, t('designSystem.colCustomer'), false],
          [Wallet, t('enums.paymentMethod.wallet'), false],
          [Receipt, t('designSystem.colTotal'), false],
        ].map(([Icon, label, active], i) => {
          const I = Icon as typeof BedDouble;
          return (
            <a
              key={i}
              href="#"
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-nav-active text-on-nav-active' : 'text-nav-fg hover:bg-white/10',
              )}
            >
              <I className="size-4" aria-hidden />
              {label as string}
            </a>
          );
        })}
      </aside>}

      <main className={embedded ? 'flex min-w-0 flex-col gap-10' : 'flex min-w-0 flex-1 flex-col gap-10 px-4 py-8 sm:px-8'}>
        {!embedded && <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-fg">{t('designSystem.title')}</h1>
            <p className="text-fg-muted">{t('designSystem.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
        </header>}

        <Section title={t('designSystem.colors')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {swatches.map(([name, cls]) => (
              <div key={name} className={cn('flex h-20 flex-col justify-end rounded-lg p-3 text-sm font-semibold', cls)}>
                {name}
              </div>
            ))}
          </div>
          <p className="text-sm text-fg-muted">
            Brand: {Object.entries(brand).map(([k, v]) => `${k} ${v}`).join(' · ')}
          </p>
          <div className="flex gap-2" aria-label="Chart palette">
            {chartPalette.map((c) => (
              <span key={c} className="h-3 flex-1 rounded-full" style={{ background: c }} />
            ))}
          </div>
        </Section>

        <Section title={t('designSystem.typography')}>
          <Card className="flex flex-col gap-2 p-5">
            <p className="text-4xl font-bold">{t('common.appName')}</p>
            <p className="text-2xl font-semibold">{t('common.tagline')}</p>
            <p className="text-base">{t('common.simulatedHint')}</p>
            <p className="text-sm text-fg-muted">{t('common.demoValueHint')}</p>
            <p className="tabular text-lg font-semibold">{formatMoney(money(137_712, 'USD'), locale)} · {formatMoney(money(85_600, 'EGP'), locale)}</p>
          </Card>
        </Section>

        <Section title={t('designSystem.buttons')}>
          <div className="flex flex-wrap items-center gap-3">
            <Button>{t('common.confirm')}</Button>
            <Button variant="secondary">{t('common.save')}</Button>
            <Button variant="outline">{t('common.cancel')}</Button>
            <Button variant="ghost">{t('common.view')}</Button>
            <Button variant="danger">{t('common.delete')}</Button>
            <Button variant="link">{t('common.details')}</Button>
            <Button loading>{t('common.loading')}</Button>
            <Button disabled>{t('common.submit')}</Button>
            <Button size="sm">{t('common.next')}<ChevronRight className="flip-rtl" aria-hidden /></Button>
            <Button size="lg">{t('common.search')}</Button>
          </div>
        </Section>

        <Section title={t('designSystem.forms')}>
          <Card className="p-5">
            <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
              <Field label={t('designSystem.sampleName')} required error={form.formState.errors.name?.message}>
                <Input autoComplete="name" {...form.register('name')} />
              </Field>
              <Field label={t('designSystem.sampleEmail')} required error={form.formState.errors.email?.message}>
                <Input type="email" autoComplete="email" dir="ltr" {...form.register('email')} />
              </Field>
              <Field label={t('designSystem.sampleService')} required error={form.formState.errors.service?.message}>
                <Select {...form.register('service')}>
                  {SERVICE_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {t(`enums.serviceType.${s}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('designSystem.sampleNotes')} optional help={t('designSystem.sampleNotesHelp')} error={form.formState.errors.notes?.message}>
                <Textarea {...form.register('notes')} />
              </Field>
              <Controller
                control={form.control}
                name="notify"
                render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} label={t('designSystem.sampleAgree')} />}
              />
              <Switch checked={switchOn} onCheckedChange={setSwitchOn} label={t('enums.markupMode.percent')} />
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit">{t('common.submit')}</Button>
                <Button variant="outline" onClick={() => form.reset()}>
                  {t('common.reset')}
                </Button>
              </div>
            </form>
          </Card>
        </Section>

        <Section title={t('designSystem.badges')}>
          <div className="flex flex-wrap gap-2">
            {BOOKING_ITEM_STATUSES.map((s) => (
              <StatusBadge key={s} kind="bookingItemStatus" value={s} />
            ))}
            <StatusBadge kind="installmentStatus" value="overdue" />
            <StatusBadge kind="kycCaseStatus" value="in_review" />
            <Badge tone="accent">{t('enums.supplierOwnership.network')}</Badge>
            <DemoBadge />
            <SimulationBadge />
          </div>
        </Section>

        <Section title={t('designSystem.cards')}>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={t('designSystem.statRevenue')} value={formatMoney(money(482_315_000, 'EGP'), locale, { compact: true })} delta={12.4} icon={<Wallet />} />
            <StatCard label={t('designSystem.statBookings')} value="1,284" delta={4.1} icon={<CalendarCheck />} />
            <StatCard label={t('designSystem.statPending')} value="37" delta={-8.3} icon={<Hourglass />} />
          </div>
          <Card>
            <CardHeader title={t('designSystem.cards')} description={t('common.tagline')} actions={<Button size="sm" variant="outline">{t('common.view')}</Button>} />
            <CardBody className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </CardBody>
          </Card>
        </Section>

        <Section title={t('designSystem.table')}>
          <Table>
            <THead>
              <tr>
                <Th>{t('designSystem.colBooking')}</Th>
                <Th>{t('designSystem.colCustomer')}</Th>
                <Th>{t('designSystem.colService')}</Th>
                <Th>{t('designSystem.colStatus')}</Th>
                <Th numeric>{t('designSystem.colTotal')}</Th>
              </tr>
            </THead>
            <TBody>
              {sampleRows.map((r) => (
                <Tr key={r.ref}>
                  <Td className="font-medium" dir="ltr">{r.ref}</Td>
                  <Td>{r.customer}</Td>
                  <Td>{t(`enums.serviceType.${r.service}`)}</Td>
                  <Td><StatusBadge kind="bookingItemStatus" value={r.status} /></Td>
                  <Td numeric>{formatMoney(money(r.total, 'EGP'), locale)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Section>

        <Section title={t('designSystem.feedback')}>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast.success(t('common.savedToast'))}>{t('designSystem.toastSuccess')}</Button>
            <Button variant="outline" onClick={() => toast.error(t('errors.PAYMENT_DECLINED'))}>{t('designSystem.toastError')}</Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>{t('designSystem.openDialog')}</Button>
          </div>
          <Tabs defaultValue="empty">
            <TabsList>
              <Tab value="empty">{t('common.emptyTitle')}</Tab>
              <Tab value="error">{t('common.errorTitle')}</Tab>
            </TabsList>
            <TabsPanel value="empty"><EmptyState /></TabsPanel>
            <TabsPanel value="error"><ErrorState onRetry={() => toast(t('common.loading'))} /></TabsPanel>
          </Tabs>
        </Section>
      </main>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('designSystem.dialogTitle')}
        description={t('designSystem.dialogBody')}
        confirmLabel={t('common.confirm')}
        loading={confirming}
        onConfirm={async () => {
          setConfirming(true);
          await new Promise((r) => setTimeout(r, 600));
          setConfirming(false);
          setConfirmOpen(false);
          toast.success(t('common.savedToast'));
        }}
      />
    </div>
  );
}
