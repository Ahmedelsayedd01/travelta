'use client';

import { useQuery } from '@tanstack/react-query';
import { changePasswordInputSchema, profileInputSchema, savedTravelerInputSchema, type BookingListItem, type SavedTravelerEntity, type SavedTravelerInput } from '@travelta/schemas';
import { CalendarDays, Info, KeyRound, Pencil, Plane, Plus, Trash2, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { StatusBadge } from '@/components/data/status-badge';
import { FormDatePicker, FormSelect } from '@/components/form/form-controls';
import { EmptyState, QueryErrorState } from '@/components/feedback/states';
import { LocaleSwitcher } from '@/components/theme/locale-switcher';
import { ThemeToggle } from '@/components/theme/theme';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PasswordInput } from '@/components/ui/password-input';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useDateFormat } from '@/features/bookings/bookings-page';
import { useDemoToday } from '@/features/demo/hooks';
import { priceOf } from '@/features/search/format';
import { SupportPage as SupportForm } from '@/features/storefront/account-pages';
import { Link } from '@/i18n/navigation';
import { takeFieldErrors, useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';

type Errors = Record<string, string>;
const issues = (list: { path: PropertyKey[]; message: string }[]): Errors => Object.fromEntries(list.map((i) => [i.path.map(String).join('.'), i.message]));
function useCountries() {
  const api = useApi();
  const locale = useLocale() as 'en' | 'ar';
  const q = useQuery({ queryKey: ['reference', 'countries'], queryFn: () => api.call('reference.countries', undefined) });
  return (q.data ?? []).map((c) => ({ value: c.iso2, label: c.name[locale] }));
}

/** Clearly labelled "not available in this version" notice (no fake controls). */
function NotAvailable({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-dashed border-border-strong px-4 py-3 text-sm" data-testid="not-available">
      <Info className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
      <div><p className="font-medium text-fg">{title}</p><p className="text-fg-muted">{body}</p></div>
    </div>
  );
}

// ---- My Profile ------------------------------------------------------------------------------------------------------------
export function AccountProfilePage() {
  const t = useTranslations('account');
  const ts = useTranslations('store');
  const api = useApi();
  const session = useSession((s) => s.session);
  const setSession = useSession((s) => s.setSession);
  const countries = useCountries();
  const customer = useQuery({ queryKey: ['account', 'profile'], queryFn: () => api.call('account.profile', undefined) });
  const [v, setV] = useState<{ name: string; phone: string; nationalityIso2: string } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const value = v ?? (customer.data ? { name: customer.data.name, phone: customer.data.phone, nationalityIso2: customer.data.nationalityIso2 ?? '' } : null);
  const save = useAction(() => api.call('account.updateProfile', { name: value!.name.trim(), phone: value!.phone.trim(), locale: session!.user.locale, nationalityIso2: value!.nationalityIso2 || null }), {
    success: ts('profileSaved'), invalidate: [['account'], ['customers']],
    onSuccess: (p) => { if (session) setSession({ ...session, user: { ...session.user, name: p.name, phone: p.phone || null } }); setV(null); void customer.refetch(); },
  });
  if (customer.isError) return <QueryErrorState error={customer.error} onRetry={() => void customer.refetch()} />;
  if (!value || !session) return <Skeleton className="h-64 w-full" />;
  const submit = () => {
    const parsed = profileInputSchema.safeParse({ ...value, locale: session.user.locale, nationalityIso2: value.nationalityIso2 || null });
    const phoneOk = !value.phone.trim() || /^\+?[0-9 ()-]{7,20}$/.test(value.phone.trim());
    const e = parsed.success ? {} : issues(parsed.error.issues);
    if (!phoneOk) e.phone = 'validation.invalid_phone';
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate(undefined, { onError: (err) => { const f = takeFieldErrors(err); if (f) setErrors(f); } });
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('profile')} description={t('profileBody')} />
      <Card><CardHeader title={t('personalInfo')} /><CardBody>
        <form className="grid gap-4 sm:grid-cols-2" data-testid="profile-form" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label={ts('name')} required error={errors.name}><Input name="name" autoComplete="name" value={value.name} onChange={(e) => setV({ ...value, name: e.target.value })} /></Field>
          <Field label={ts('email')} help={t('emailLocked')}><Input name="email" dir="ltr" value={session.user.email} readOnly aria-readonly /></Field>
          <Field label={ts('phone')} optional error={errors.phone}><Input name="phone" type="tel" dir="ltr" autoComplete="tel" placeholder="+20 100 123 4567" value={value.phone} onChange={(e) => setV({ ...value, phone: e.target.value })} /></Field>
          <FormSelect label={ts('nationality')} optional name="nationality" value={value.nationalityIso2} onValueChange={(x) => setV({ ...value, nationalityIso2: x })}
            options={[{ value: '', label: t('notSet') }, ...countries]} />
          <div className="sm:col-span-2"><Button type="submit" loading={save.isPending} data-testid="profile-save">{ts('save')}</Button></div>
        </form>
      </CardBody></Card>
      <ChangePasswordCard />
    </div>
  );
}

function ChangePasswordCard() {
  const t = useTranslations('account');
  const tv = useTranslations();
  const api = useApi();
  const [v, setV] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const change = useAction(() => api.call('account.changePassword', { currentPassword: v.currentPassword, newPassword: v.newPassword }), {
    success: t('passwordChanged'), onSuccess: () => setV({ currentPassword: '', newPassword: '', confirm: '' }),
  });
  const msg = (k?: string) => (k ? (tv.has(k as never) ? tv(k as never) : k) : undefined);
  const submit = () => {
    const parsed = changePasswordInputSchema.safeParse(v);
    const e = parsed.success ? {} : issues(parsed.error.issues);
    if (v.newPassword !== v.confirm) e.confirm = 'validation.passwords_mismatch';
    setErrors(e);
    if (Object.keys(e).length === 0) change.mutate(undefined, { onError: (err) => { const f = takeFieldErrors(err); if (f) setErrors(f); } });
  };
  return (
    <Card><CardHeader title={t('changePassword')} description={t('changePasswordBody')} /><CardBody>
      <form className="grid gap-4 sm:grid-cols-3" data-testid="password-form" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label={t('currentPassword')} required error={msg(errors.currentPassword)}><PasswordInput name="currentPassword" autoComplete="current-password" value={v.currentPassword} onChange={(e) => setV({ ...v, currentPassword: e.target.value })} /></Field>
        <Field label={t('newPassword')} required error={msg(errors.newPassword)}><PasswordInput name="newPassword" autoComplete="new-password" value={v.newPassword} onChange={(e) => setV({ ...v, newPassword: e.target.value })} /></Field>
        <Field label={t('confirmPassword')} required error={msg(errors.confirm)}><PasswordInput name="confirm" autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} /></Field>
        <div className="sm:col-span-3"><Button type="submit" variant="outline" loading={change.isPending} data-testid="password-save"><KeyRound aria-hidden />{t('updatePassword')}</Button></div>
      </form>
    </CardBody></Card>
  );
}

// ---- My Bookings (list; details reuse the booking page) -------------------------------------------------------------------
const TABS = { upcoming: { when: ['upcoming', 'current'], status: ['pending', 'partially_confirmed', 'confirmed', 'vouchered'] }, past: { when: ['past'], status: ['confirmed', 'vouchered', 'travelled', 'partially_confirmed'] }, cancelled: { status: ['cancelled'] } } as const;

export function AccountBookingsPage() {
  const t = useTranslations('account');
  const ts = useTranslations('store');
  const api = useApi();
  const [tab, setTab] = useState<keyof typeof TABS>('upcoming');
  const filters = Object.fromEntries(Object.entries(TABS[tab]).map(([k, v]) => [k, [...v]]));
  const q = useQuery({ queryKey: ['bookings', 'mine', tab], queryFn: () => api.call('bookings.list', { page: 1, pageSize: 50, sort: tab === 'upcoming' ? 'travelStart:asc' : 'travelStart:desc', filters }) });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('bookings')} description={t('bookingsBody')} actions={<Link href="/search" className={buttonVariants({ size: 'sm' })}><Plane aria-hidden />{ts('bookTrip')}</Link>} />
      <div role="tablist" aria-label={t('bookings')} className="flex gap-1 border-b border-border" data-testid="trip-tabs">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-tab={k}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors', tab === k ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg')}>
            {t(`tab_${k}` as never)}{q.data && tab === k ? ` (${q.data.total})` : ''}
          </button>
        ))}
      </div>
      <div role="tabpanel" key={tab} className="tv-enter">
        {q.isError ? <QueryErrorState error={q.error} onRetry={() => void q.refetch()} />
          : !q.data ? <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
          : q.data.items.length === 0 ? <EmptyState icon={<Plane aria-hidden />} title={t(`empty_${tab}` as never)} body={t('emptyBookingsBody')} action={tab === 'upcoming' ? <Link href="/search" className={buttonVariants({ size: 'sm' })}>{ts('bookTrip')}</Link> : undefined} />
          : <ul className="flex flex-col gap-3" data-testid="bookings-table">{q.data.items.map((b) => <li key={b.id}><TripRow b={b} /></li>)}</ul>}
      </div>
    </div>
  );
}

function TripRow({ b }: { b: BookingListItem }) {
  const t = useTranslations('account');
  const te = useTranslations('enums');
  const locale = useLocale() as 'en' | 'ar';
  const date = useDateFormat();
  const today = useDemoToday();
  const days = Math.round((Date.parse(b.travelStart) - Date.parse(today)) / 86_400_000);
  return (
    <Link href={`/account/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs transition-shadow hover:shadow-md" data-testid="trip-row" data-ref={b.ref}>
      <div className="min-w-0">
        <p className="truncate font-semibold text-fg">{b.title[locale]}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-4" aria-hidden />{date(b.travelStart)}{b.travelEnd !== b.travelStart ? ` – ${date(b.travelEnd)}` : ''}</span>
          <span>· {b.ref}</span>
          <span>· {b.services.map((s) => te(`serviceType.${s}` as never)).join(', ')}</span>
          {days > 0 && b.status !== 'cancelled' && <span className="text-primary">· {t('inDays', { n: days })}</span>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="bookingStatus" value={b.status} />
        <StatusBadge kind="bookingPaymentStatus" value={b.paymentStatus} />
        <span className="tabular font-semibold text-fg">{priceOf(b.totalMinor, b.currency, locale)}</span>
      </div>
    </Link>
  );
}

// ---- My Travelers --------------------------------------------------------------------------------------------------------
export function AccountTravelersPage() {
  const t = useTranslations('account');
  const api = useApi();
  const q = useQuery({ queryKey: ['account', 'travelers'], queryFn: () => api.call('travelers.list', undefined) });
  const [editing, setEditing] = useState<SavedTravelerEntity | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SavedTravelerEntity | null>(null);
  const remove = useAction((id: string) => api.call('travelers.delete', { id }), { success: t('travelerRemoved'), invalidate: [['account', 'travelers']], onSuccess: () => setDeleting(null) });
  const date = useDateFormat();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('travelers')} description={t('travelersBody')} actions={<Button size="sm" onClick={() => setEditing('new')} data-testid="add-traveler"><Plus aria-hidden />{t('addTraveler')}</Button>} />
      {q.isError ? <QueryErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data ? <Skeleton className="h-32 w-full" />
        : q.data.length === 0 ? <EmptyState icon={<Users aria-hidden />} title={t('noTravelers')} body={t('noTravelersBody')} />
        : (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="travelers-list">
            {q.data.map((x) => (
              <li key={x.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-fg">{t(`title_${x.title}` as never)} {x.firstName} {x.lastName}</p>
                  <p className="text-fg-muted">{t(`type_${x.type}` as never)}{x.dateOfBirth ? ` · ${date(x.dateOfBirth)}` : ''}{x.nationalityIso2 ? ` · ${x.nationalityIso2}` : ''}</p>
                  {x.passportNo && <p className="text-fg-muted" dir="ltr">{t('passportShort', { no: x.passportNo, date: x.passportExpiry ? date(x.passportExpiry) : '—' })}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" aria-label={t('editTraveler', { name: x.firstName })} onClick={() => setEditing(x)}><Pencil aria-hidden /></Button>
                  <Button variant="ghost" size="icon" className="text-danger" aria-label={t('removeTraveler', { name: x.firstName })} onClick={() => setDeleting(x)}><Trash2 aria-hidden /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      {editing && <TravelerEditor traveler={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }} loading={remove.isPending}
        title={t('removeTitle', { name: deleting ? `${deleting.firstName} ${deleting.lastName}` : '' })} description={t('removeBody')} confirmLabel={t('remove')}
        onConfirm={() => { if (deleting) remove.mutate(deleting.id); }} />
    </div>
  );
}

function TravelerEditor({ traveler, onClose }: { traveler: SavedTravelerEntity | null; onClose: () => void }) {
  const t = useTranslations('account');
  const tc = useTranslations('common');
  const tv = useTranslations();
  const api = useApi();
  const today = useDemoToday();
  const countries = useCountries();
  const [v, setV] = useState<SavedTravelerInput>(traveler
    ? { id: traveler.id, type: traveler.type, title: traveler.title, firstName: traveler.firstName, lastName: traveler.lastName, dateOfBirth: traveler.dateOfBirth, nationalityIso2: traveler.nationalityIso2, passportNo: traveler.passportNo, passportExpiry: traveler.passportExpiry }
    : { type: 'adult', title: 'mr', firstName: '', lastName: '', dateOfBirth: null, nationalityIso2: null, passportNo: null, passportExpiry: null });
  const [errors, setErrors] = useState<Errors>({});
  const save = useAction((input: SavedTravelerInput) => api.call('travelers.save', input), { success: t('travelerSaved'), invalidate: [['account', 'travelers']], onSuccess: onClose });
  const msg = (k?: string) => (k ? (tv.has(k as never) ? tv(k as never) : k) : undefined);
  const submit = () => {
    const parsed = savedTravelerInputSchema.safeParse(v);
    const e = parsed.success ? {} : issues(parsed.error.issues);
    // Same rules as the server, checked early for instant feedback.
    if (v.type !== 'adult' && !v.dateOfBirth) e.dateOfBirth = 'validation.required';
    if (v.passportNo && !v.passportExpiry) e.passportExpiry = 'validation.required';
    if (v.passportExpiry && v.passportExpiry <= today) e.passportExpiry = 'validation.passport_expired';
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate(v, { onError: (err) => { const f = takeFieldErrors(err); if (f) setErrors(f); } });
  };
  const titles = v.type === 'adult' ? (['mr', 'mrs', 'ms'] as const) : (['mstr', 'miss'] as const);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={traveler ? t('editTravelerTitle') : t('addTraveler')} description={t('travelerHelp')}
      footer={<><Button variant="outline" onClick={onClose}>{tc('cancel')}</Button><Button loading={save.isPending} onClick={submit} data-testid="traveler-save">{tc('save')}</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" data-testid="traveler-form" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <FormSelect label={t('travelerType')} name="type" value={v.type} onValueChange={(x) => { const type = x as SavedTravelerInput['type']; setV({ ...v, type, title: type === 'adult' ? 'mr' : 'mstr' }); }}
          options={(['adult', 'child', 'infant'] as const).map((x) => ({ value: x, label: t(`type_${x}`) }))} />
        <FormSelect label={t('titleLabel')} name="title" value={v.title} onValueChange={(x) => setV({ ...v, title: x as SavedTravelerInput['title'] })}
          options={titles.map((x) => ({ value: x, label: t(`title_${x}`) }))} />
        <Field label={t('firstName')} required error={msg(errors.firstName)}><Input name="firstName" autoComplete="given-name" value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} /></Field>
        <Field label={t('lastName')} required error={msg(errors.lastName)}><Input name="lastName" autoComplete="family-name" value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} /></Field>
        <FormDatePicker yearNav clearable={v.type === 'adult'} label={t('dateOfBirth')} name="dateOfBirth" required={v.type !== 'adult'} optional={v.type === 'adult'} value={v.dateOfBirth ?? ''} max={today} min="1920-01-01"
          error={msg(errors.dateOfBirth)} onChange={(x) => setV({ ...v, dateOfBirth: x })} placeholder={t('chooseDate')} />
        <FormSelect label={t('nationality')} optional name="nationalityIso2" value={v.nationalityIso2 ?? ''} onValueChange={(x) => setV({ ...v, nationalityIso2: x || null })}
          options={[{ value: '', label: t('notSet') }, ...countries]} error={msg(errors.nationalityIso2)} />
        <Field label={t('passportNo')} optional error={msg(errors.passportNo)}><Input name="passportNo" dir="ltr" autoComplete="off" value={v.passportNo ?? ''} onChange={(e) => setV({ ...v, passportNo: e.target.value.toUpperCase() || null })} /></Field>
        <FormDatePicker yearNav clearable={!v.passportNo} label={t('passportExpiry')} name="passportExpiry" required={Boolean(v.passportNo)} optional={!v.passportNo} value={v.passportExpiry ?? ''} min={today} max="2045-12-31"
          error={msg(errors.passportExpiry)} onChange={(x) => setV({ ...v, passportExpiry: x })} placeholder={t('chooseDate')} />
      </form>
    </Sheet>
  );
}

// ---- Support & Help (form + my tickets) -----------------------------------------------------------------------------------
export function AccountSupportPage() {
  const t = useTranslations('account');
  const tsf = useTranslations('store');
  const api = useApi();
  const date = useDateFormat();
  const q = useQuery({ queryKey: ['account', 'tickets'], queryFn: () => api.call('account.tickets', undefined) });
  return (
    <div className="flex flex-col gap-6">
      <SupportForm />
      <Card data-testid="my-tickets"><CardHeader title={t('myTickets')} description={t('ticketsBody')} /><CardBody className="p-0">
        {!q.data ? <Skeleton className="m-5 h-16" /> : q.data.length === 0 ? <p className="px-5 py-4 text-sm text-fg-muted">{t('noTickets')}</p> : (
          <ul className="divide-y divide-border">
            {q.data.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3 text-sm" data-testid="ticket-row">
                <div className="min-w-0">
                  <p className="font-semibold text-fg">{x.ref} · {tsf(`topic_${x.topic}` as never)}{x.bookingRef ? ` · ${x.bookingRef}` : ''}</p>
                  <p className="line-clamp-2 text-fg-muted">{x.message}</p>
                </div>
                <div className="text-end"><span className="rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold text-info">{t(`ticket_${x.status}` as never)}</span><p className="mt-1 text-xs text-fg-muted">{date(x.at.slice(0, 10))}</p></div>
              </li>
            ))}
          </ul>
        )}
      </CardBody></Card>
    </div>
  );
}

// ---- Settings --------------------------------------------------------------------------------------------------------------
export function AccountSettingsPage() {
  const t = useTranslations('account');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('settings')} description={t('settingsBody')} />
      <Card><CardHeader title={t('language')} description={t('languageBody')} /><CardBody><LocaleSwitcher /></CardBody></Card>
      <Card><CardHeader title={t('appearance')} description={t('appearanceBody')} /><CardBody><ThemeToggle /></CardBody></Card>
      <Card><CardHeader title={t('moreSettings')} /><CardBody className="flex flex-col gap-3">
        <NotAvailable title={t('currencyTitle')} body={t('currencyBody')} />
        <NotAvailable title={t('notifPrefsTitle')} body={t('notifPrefsBody')} />
        <NotAvailable title={t('emailChangeTitle')} body={t('emailChangeBody')} />
      </CardBody></Card>
    </div>
  );
}
