'use client';

import type { BookingDto, BookingItemDto } from '@travelta/schemas';
import { ArrowLeft, Printer } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/brand';
import { ErrorState, QueryErrorState } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { policyLines } from '@/features/search/format';
import { Link } from '@/i18n/navigation';
import { useBookingsBase, useDateFormat } from './bookings-page';
import { useBooking } from './booking-detail';

/** Printable service voucher (BKG-6) — one layout, service-specific facts for all seven services. */
export function VoucherView({ bookingId, itemId }: { bookingId: string; itemId: string }) {
  const t = useTranslations('bookings');
  const booking = useBooking(bookingId);
  const base = useBookingsBase();
  if (booking.isError) return <QueryErrorState error={booking.error} onRetry={() => void booking.refetch()} />;
  if (!booking.data) return <Skeleton className="h-[40rem] w-full" />;
  const item = booking.data.items.find((i) => i.id === itemId);
  if (!item || !item.voucherNo) return <ErrorState />;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`${base}/${bookingId}`} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><ArrowLeft className="flip-rtl size-4" aria-hidden />{booking.data.ref}</Link>
        <Button onClick={() => window.print()} data-testid="print-voucher"><Printer aria-hidden />{t('printVoucher')}</Button>
      </div>
      <Voucher booking={booking.data} item={item} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium tracking-wide text-fg-muted uppercase">{label}</dt>
      <dd className="text-sm font-medium text-fg">{children}</dd>
    </div>
  );
}

export function Voucher({ booking: b, item }: { booking: BookingDto; item: BookingItemDto }) {
  const t = useTranslations('bookings');
  const ts = useTranslations('search');
  const tc = useTranslations('catalog');
  const tk = useTranslations('checkout');
  const te = useTranslations('enums');
  const locale = useLocale() as 'en' | 'ar';
  const date = useDateFormat();
  const d = item.details;
  const facts: [string, ReactNode][] = [];
  switch (item.serviceType) {
    case 'hotel':
      facts.push([t('checkIn'), date(item.from)], [t('checkOut'), item.to ? date(item.to) : '—'], [t('rooms'), String(Math.max(1, item.occupancy.rooms.length))]);
      if (item.mealPlan) facts.push([t('mealPlan'), ts(`meal_${item.mealPlan}`)]);
      break;
    case 'flight':
      facts.push([t('depart'), date(item.from)]);
      if (d.pnr) facts.push([t('pnr'), <span key="pnr" dir="ltr" className="font-mono">{d.pnr}</span>]);
      if (d.ticketNo) facts.push([t('ticketNo'), <span key="tkt" dir="ltr" className="font-mono">{d.ticketNo}</span>]);
      break;
    case 'visa':
      facts.push([ts('applicationDate'), date(item.from)]);
      if (d.appointmentDate) facts.push([t('appointmentDate'), date(d.appointmentDate)]);
      break;
    case 'transfer':
      facts.push([t('depart'), `${date(item.from)}${d.time ? ` · ${d.time}` : ''}`]);
      if (d.pickupPoint) facts.push([t('pickupPoint'), d.pickupPoint]);
      if (d.flightNo) facts.push([tk('flightNo'), <span key="fn" dir="ltr">{d.flightNo}</span>]);
      if (d.driver) facts.push([t('driver'), d.driver]);
      break;
    default:
      facts.push([ts('date'), `${date(item.from)}${item.to ? ` → ${date(item.to)}` : ''}${d.time ? ` · ${d.time}` : ''}`]);
      if (d.pickupPoint) facts.push([t('pickupPoint'), d.pickupPoint]);
      if (d.language) facts.push([tk('language'), d.language.toUpperCase()]);
      if (d.occupancy) facts.push([tk('occupancy'), tk(`occ_${d.occupancy}`)]);
  }
  if (d.description) facts.push([t('details'), d.description]);
  if (d.specialRequests) facts.push([t('specialRequests'), d.specialRequests]);

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm print:border-0 print:shadow-none" data-testid="voucher">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-hero px-6 py-5 text-on-hero">
        <div>
          <Logo tone="inverse" />
          <p className="mt-1 text-sm text-hero-muted">{b.sellerName}</p>
        </div>
        <div className="text-end">
          <p className="text-xs tracking-wider text-hero-muted uppercase">{t('voucherTitle')}</p>
          <p className="font-mono text-xl font-bold" dir="ltr" data-testid="voucher-no">{item.voucherNo}</p>
          <p className="font-mono text-xs text-hero-muted" dir="ltr">{b.ref}</p>
        </div>
      </header>
      <div className="flex flex-col gap-6 p-6">
        <div>
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">{te(`serviceType.${item.serviceType}`)}</p>
          <h1 className="text-2xl font-bold text-fg">{item.title[locale]}</h1>
          <p className="text-sm text-fg-muted">{item.subtitle[locale]}</p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          {facts.map(([label, value]) => <Row key={label} label={label}>{value}</Row>)}
          <Row label={t('supplier')}>{item.supplierName}</Row>
          <Row label={t('supplierRef')}><span dir="ltr" className="font-mono">{item.supplierRef}</span></Row>
        </dl>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-fg">{t('voucherFor')}</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {item.travellers.map((tr, k) => (
                <tr key={k}>
                  <td className="py-1.5 font-medium text-fg">{tk(`title_${tr.title}`)} {tr.firstName} {tr.lastName}{tr.lead ? ` (${tk('leadTraveller')})` : ''}</td>
                  <td className="py-1.5 text-fg-muted">{te(`paxType.${tr.type}`)}</td>
                  <td className="py-1.5 text-end font-mono text-fg-muted" dir="ltr">{tr.passportNo ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rounded-lg bg-subtle px-4 py-3 text-sm">
          <p className="font-semibold text-fg">{t('policy')}</p>
          <ul className="mt-1 list-inside list-disc text-fg-muted">{policyLines(item.policy, ts as never, tc as never).map((l) => <li key={l}>{l}</li>)}</ul>
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-fg-muted">
          <span>{t('voucherPresent')}</span>
          <span>{t('issuedOn', { date: item.voucheredAt ? date(item.voucheredAt) : '—' })}</span>
          <span className="w-full">{t('emergency')}</span>
        </footer>
      </div>
    </article>
  );
}
