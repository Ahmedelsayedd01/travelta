'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiClientError } from '@travelta/api-client';
import { LifeBuoy, Plane, Search, Ticket, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { StatusBadge } from '@/components/data/status-badge';
import { EmptyState } from '@/components/feedback/states';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useDateFormat } from '@/features/bookings/bookings-page';
import { useDemoToday } from '@/features/demo/hooks';
import { priceOf } from '@/features/search/format';
import { Link } from '@/i18n/navigation';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';

/** Account home (W12): upcoming trips, shortcuts to book, trips, profile and support. */
export function CustomerHome() {
  const t = useTranslations('store');
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const date = useDateFormat();
  const today = useDemoToday();
  const session = useSession((s) => s.session);
  const trips = useQuery({ queryKey: ['bookings', 'mine', 'upcoming'], queryFn: () => api.call('bookings.list', { page: 1, pageSize: 5, sort: 'travelStart:asc', filters: { when: ['upcoming', 'current'] } }) });
  if (!session) return null;
  const shortcuts = [
    { href: '/search', icon: Search, label: t('bookTrip') },
    { href: '/account/bookings', icon: Ticket, label: t('myTrips') },
    { href: '/account/profile', icon: UserRound, label: t('profile') },
    { href: '/account/support', icon: LifeBuoy, label: t('support') },
  ];
  return (
    <div className="flex flex-col gap-6" data-testid="customer-home">
      <div>
        <h1 className="text-2xl font-semibold text-fg" data-testid="portal-welcome">{t('hello', { name: session.user.name.split(' ')[0] ?? session.user.name })}</h1>
        <p className="text-fg-muted">{t('homeBody')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shortcuts.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-center text-sm font-medium shadow-xs hover:bg-subtle">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft"><Icon className="size-5" aria-hidden /></span>{label}
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader title={t('upcoming')} />
        <CardBody className="p-0">
          {!trips.data ? <Skeleton className="m-5 h-24" /> : trips.data.items.length === 0 ? (
            <div className="p-5"><EmptyState icon={<Plane aria-hidden />} title={t('noTrips')} body={t('noTripsBody')} action={<Link href="/search" className={buttonVariants({ size: 'sm' })}>{t('bookTrip')}</Link>} /></div>
          ) : (
            <ul className="divide-y divide-border" data-testid="upcoming-trips">
              {trips.data.items.map((b) => (
                <li key={b.id}><Link href={`/account/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-subtle">
                  <span className="min-w-0"><span className="block font-medium text-fg">{b.title[locale]}</span><span className="text-xs text-fg-muted">{date(b.travelStart)}{b.travelStart > today ? ` · ${t('inDays', { n: Math.round((Date.parse(b.travelStart) - Date.parse(today)) / 86_400_000) })}` : ''}</span></span>
                  <span className="flex items-center gap-2"><StatusBadge kind="bookingStatus" value={b.status} /><span className="tabular font-medium">{priceOf(b.totalMinor, b.currency, locale)}</span></span>
                </Link></li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export function ProfilePage() {
  const t = useTranslations('store');
  const api = useApi();
  const session = useSession((s) => s.session);
  const me = useQuery({ queryKey: ['customers', 'me'], queryFn: () => api.call('auth.me', undefined) });
  const [v, setV] = useState<{ name: string; phone: string; locale: 'en' | 'ar'; nationalityIso2: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const value = v ?? (session ? { name: session.user.name, phone: session.user.phone ?? '', locale: session.user.locale, nationalityIso2: 'EG' } : null);
  const save = useAction(() => api.call('account.updateProfile', { ...value!, nationalityIso2: value!.nationalityIso2 || null }), { success: t('profileSaved'), invalidate: [['customers'], ['auth']] , onSuccess: () => void me.refetch() });
  if (!value) return <Skeleton className="h-64 w-full" />;
  return (
    <>
      <PageHeader title={t('profile')} description={t('profileBody')} />
      <Card className="max-w-2xl"><CardBody className="flex flex-col gap-4" data-testid="profile-form">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('name')} required error={errors.name}><Input name="name" value={value.name} onChange={(e) => setV({ ...value, name: e.target.value })} /></Field>
          <Field label={t('email')}><Input dir="ltr" value={session?.user.email ?? ''} disabled /></Field>
          <Field label={t('phone')} error={errors.phone}><Input name="phone" dir="ltr" value={value.phone} onChange={(e) => setV({ ...value, phone: e.target.value })} /></Field>
          <Field label={t('nationality')}><Input name="nationality" dir="ltr" maxLength={2} value={value.nationalityIso2} onChange={(e) => setV({ ...value, nationalityIso2: e.target.value.toUpperCase() })} /></Field>
          <Field label={t('language')}><Select name="locale" value={value.locale} onChange={(e) => setV({ ...value, locale: e.target.value as 'en' | 'ar' })}><option value="en">English</option><option value="ar">العربية</option></Select></Field>
        </div>
        <Button className="self-start" onClick={() => save.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={save.isPending} data-testid="profile-save">{t('save')}</Button>
      </CardBody></Card>
    </>
  );
}

export function SupportPage() {
  const t = useTranslations('store');
  const api = useApi();
  const trips = useQuery({ queryKey: ['bookings', 'mine', 'all'], queryFn: () => api.call('bookings.list', { page: 1, pageSize: 50 }) });
  const [v, setV] = useState({ topic: 'booking' as 'booking' | 'payment' | 'cancellation' | 'other', bookingId: '', message: '' });
  const [ticket, setTicket] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const send = useAction(() => api.call('account.support', { topic: v.topic, bookingId: v.bookingId || null, message: v.message }), { success: t('supportSent'), onSuccess: (out) => { setTicket(out.ticket); setV({ ...v, message: '' }); } });
  const faq = ['faqCancel', 'faqPay', 'faqVoucher', 'faqChange'] as const;
  return (
    <>
      <PageHeader title={t('support')} description={t('supportBody')} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card><CardBody className="flex flex-col gap-4" data-testid="support-form">
          {ticket && <p role="status" className="rounded-md bg-success-bg px-3 py-2 text-sm text-success" data-testid="support-ticket">{t('ticketCreated', { ticket })}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('topic')}><Select name="topic" value={v.topic} onChange={(e) => setV({ ...v, topic: e.target.value as typeof v.topic })}>{(['booking', 'payment', 'cancellation', 'other'] as const).map((x) => <option key={x} value={x}>{t(`topic_${x}`)}</option>)}</Select></Field>
            <Field label={t('relatedBooking')} optional><Select name="bookingId" value={v.bookingId} onChange={(e) => setV({ ...v, bookingId: e.target.value })}><option value="">{t('none')}</option>{(trips.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>{b.ref}</option>)}</Select></Field>
          </div>
          <Field label={t('message')} required error={errors.message}><Textarea name="message" rows={5} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} /></Field>
          <Button className="self-start" onClick={() => send.mutate(undefined, { onError: (e) => setErrors(e instanceof ApiClientError ? e.fieldErrors() : {}) })} loading={send.isPending} disabled={v.message.trim().length < 10} data-testid="support-send">{t('send')}</Button>
        </CardBody></Card>
        <Card><CardHeader title={t('faq')} /><CardBody className="flex flex-col gap-3 text-sm">
          {faq.map((k) => <details key={k} className="group"><summary className="cursor-pointer font-medium text-fg">{t(`${k}Q`)}</summary><p className="mt-1 text-fg-muted">{t(`${k}A`)}</p></details>)}
        </CardBody></Card>
      </div>
    </>
  );
}
