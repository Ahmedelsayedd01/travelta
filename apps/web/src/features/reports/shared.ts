'use client';

import { useFormatter, useLocale } from 'next-intl';
import { priceOf } from '@/features/search/format';

/** Value formatting shared by the dashboard, charts and report tables. */
export function useReportFormat(currency: string) {
  const locale = useLocale();
  const format = useFormatter();
  const money = (v: number) => priceOf(v, currency, locale);
  const compact = (v: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v / 100);
  const number = (v: number) => format.number(v);
  const percent = (v: number) => `${format.number(v, { maximumFractionDigits: 1 })}%`;
  const month = (label: string) => format.dateTime(new Date(`${label}-01T00:00:00Z`), { month: 'short', timeZone: 'UTC' });
  const date = (iso: string) => format.dateTime(new Date(`${iso.slice(0, 10)}T00:00:00Z`), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return { money, compact, number, percent, month, date };
}

export function toCsv(columns: string[], header: string[], rows: Record<string, string | number | null>[], money: Set<string>): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(cell).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(money.has(c) && typeof r[c] === 'number' ? ((r[c] as number) / 100).toFixed(2) : r[c])).join(','));
  // BOM so Excel opens Arabic text correctly.
  return `﻿${lines.join('\n')}`;
}
