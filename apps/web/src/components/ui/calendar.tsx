'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { SelectField } from './select';

/** ISO date helpers in UTC (dates are calendar days, never times). */
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const addDaysIso = (iso: string, n: number) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };
const addMonthsIso = (iso: string, n: number) => { const d = toDate(iso); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return toIso(d); };
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
/** Same day-of-month in year `y`, month `m` (0-based), clamped to the month's length. */
const clampDay = (y: number, m: number, iso: string) => {
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toIso(new Date(Date.UTC(y, m, Math.min(Number(iso.slice(8, 10)), last))));
};

/**
 * Accessible month calendar (WAI-ARIA date grid): arrow keys move by day/week (mirrored in RTL), PageUp/PageDown by
 * month, Home/End to the week edges; days outside [min, max] or rejected by `isDisabled` can't be chosen.
 * Week starts on Saturday in Arabic and Sunday in English.
 */
export function Calendar({ value, onSelect, min, max, isDisabled, label, rangeStart, autoFocus = true, yearNav = false }: {
  value?: string; onSelect: (iso: string) => void; min?: string; max?: string; isDisabled?: (iso: string) => boolean; label: string;
  /** Highlights the span between rangeStart and the hovered/selected day (e.g. check-in → check-out). */
  rangeStart?: string; autoFocus?: boolean;
  /** Month and year dropdowns in the header, for dates far from today (birth, passport expiry, reports). */
  yearNav?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('common');
  const rtl = locale === 'ar';
  const initial = value ?? (min && (!max || min <= max) ? min : toIso(new Date()));
  const [focus, setFocus] = useState(initial);
  const [hover, setHover] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const month = monthStart(focus);
  const weekStart = rtl ? 6 : 0;
  const first = toDate(month);
  const lead = (first.getUTCDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) * 7 }, (_, i) => addDaysIso(month, i - lead));
  const fmtMonth = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fmtDay = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fmtNum = new Intl.NumberFormat(locale);
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 7 + ((weekStart + i) % 7))); // 7 Jan 2024 is a Sunday
    return { short: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(d), long: new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(d) };
  });
  const blocked = (iso: string) => (min !== undefined && iso < min) || (max !== undefined && iso > max) || Boolean(isDisabled?.(iso));
  const canPrev = !min || monthStart(addMonthsIso(month, -1)) >= monthStart(min);
  const canNext = !max || monthStart(addMonthsIso(month, 1)) <= monthStart(max);

  useEffect(() => {
    if (!autoFocus) return;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus, autoFocus]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, () => string> = {
      ArrowLeft: () => addDaysIso(focus, rtl ? 1 : -1), ArrowRight: () => addDaysIso(focus, rtl ? -1 : 1),
      ArrowUp: () => addDaysIso(focus, -7), ArrowDown: () => addDaysIso(focus, 7),
      PageUp: () => addMonthsIso(focus, -1), PageDown: () => addMonthsIso(focus, 1),
      Home: () => addDaysIso(focus, -((toDate(focus).getUTCDay() - weekStart + 7) % 7)),
      End: () => addDaysIso(focus, 6 - ((toDate(focus).getUTCDay() - weekStart + 7) % 7)),
    };
    if (step[e.key]) { e.preventDefault(); setFocus(step[e.key]!()); }
    else if ((e.key === 'Enter' || e.key === ' ') && !blocked(focus)) { e.preventDefault(); onSelect(focus); }
  };
  const inRange = (iso: string) => {
    const end = hover ?? value;
    return Boolean(rangeStart && end && iso > rangeStart && iso < end);
  };

  return (
    <div className="w-[18.5rem] p-3" data-testid="calendar">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setFocus(addMonthsIso(focus, -1))} disabled={!canPrev} aria-label={t('prevMonth')}
          className="flex size-8 items-center justify-center rounded-md text-fg hover:bg-subtle disabled:opacity-30" data-testid="calendar-prev">
          <ChevronLeft className="flip-rtl size-4" aria-hidden />
        </button>
        <p className={cn('text-sm font-semibold text-fg', yearNav && 'sr-only')} aria-live="polite" data-testid="calendar-month">{fmtMonth.format(first)}</p>
        {yearNav && (() => {
          const thisYear = new Date().getUTCFullYear();
          const fromYear = min ? Number(min.slice(0, 4)) : thisYear - 100;
          const toYear = max ? Number(max.slice(0, 4)) : thisYear + 15;
          const year = first.getUTCFullYear();
          const fmtM = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
          const fmtY = new Intl.NumberFormat(locale, { useGrouping: false });
          const jump = (y: number, m: number) => setFocus(clampDay(y, m, focus));
          return (
            <div className="flex flex-1 items-center justify-center gap-1.5">
              <SelectField value={String(first.getUTCMonth())} aria-label={t('month')} testId="calendar-month-select" className="h-8 w-[5.5rem]"
                onValueChange={(v) => jump(year, Number(v))} options={Array.from({ length: 12 }, (_, m) => ({ value: String(m), label: fmtM.format(new Date(Date.UTC(2024, m, 1))) }))} />
              <SelectField value={String(year)} aria-label={t('year')} testId="calendar-year-select" className="h-8 w-[5.5rem]"
                onValueChange={(v) => jump(Number(v), first.getUTCMonth())}
                options={Array.from({ length: Math.max(1, toYear - fromYear + 1) }, (_, i) => toYear - i).map((y) => ({ value: String(y), label: fmtY.format(y) }))} />
            </div>
          );
        })()}
        <button type="button" onClick={() => setFocus(addMonthsIso(focus, 1))} disabled={!canNext} aria-label={t('nextMonth')}
          className="flex size-8 items-center justify-center rounded-md text-fg hover:bg-subtle disabled:opacity-30" data-testid="calendar-next">
          <ChevronRight className="flip-rtl size-4" aria-hidden />
        </button>
      </div>
      <div ref={grid} role="grid" aria-label={`${label} — ${fmtMonth.format(first)}`} onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
        <div role="row" className="grid grid-cols-7">
          {weekdays.map((w) => <span key={w.long} role="columnheader" aria-label={w.long} className="py-1 text-center text-xs font-medium text-fg-muted">{w.short}</span>)}
        </div>
        {Array.from({ length: cells.length / 7 }, (_, r) => (
          <div key={r} role="row" className="grid grid-cols-7">
            {cells.slice(r * 7, r * 7 + 7).map((iso) => {
              const outside = iso.slice(0, 7) !== month.slice(0, 7);
              const selected = iso === value;
              const off = blocked(iso);
              return (
                <span key={iso} role="gridcell" aria-selected={selected} className="p-0.5">
                  <button type="button" data-day={iso} tabIndex={iso === focus ? 0 : -1} disabled={off} aria-disabled={off || undefined}
                    aria-label={fmtDay.format(toDate(iso))} aria-current={iso === toIso(new Date()) ? 'date' : undefined}
                    onClick={() => { setFocus(iso); if (!off) onSelect(iso); }} onMouseEnter={() => setHover(iso)} onFocus={() => setFocus(iso)}
                    className={cn('tabular flex size-9 w-full items-center justify-center rounded-md text-sm transition-colors focus-visible:outline-2 focus-visible:outline-focus',
                      selected ? 'bg-primary font-semibold text-on-primary' : inRange(iso) ? 'bg-primary-soft text-on-primary-soft' : 'text-fg hover:bg-subtle',
                      iso === rangeStart && !selected && 'ring-1 ring-primary',
                      outside && !selected && 'text-fg-subtle', off && 'cursor-not-allowed text-fg-subtle line-through opacity-50 hover:bg-transparent')}>
                    {fmtNum.format(toDate(iso).getUTCDate())}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
