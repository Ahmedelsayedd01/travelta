import type { CurrencyCode } from '@travelta/contracts';
import { CURRENCY_CODES } from '@travelta/shared';
import type { FxRateEntity } from '@travelta/schemas';
import { listPage } from '../query';
import { rateOn } from '../services/fx';
import type { HandlerMap } from './types';

export const referenceHandlers: HandlerMap<
  'reference.currencies' | 'reference.countries' | 'reference.nationalityGroups' | 'reference.destinations' | 'fx.latest' | 'fx.history'
> = {
  'reference.currencies': (ctx) => ctx.db.all('currencies'),
  'reference.countries': (ctx) => ctx.db.all('countries').sort((a, b) => a.name.en.localeCompare(b.name.en)),
  'reference.nationalityGroups': (ctx) => ctx.db.all('nationalityGroups'),
  // Inactive destinations stay visible to the platform (to manage them) but leave every public picker.
  'reference.destinations': (ctx, query) =>
    listPage(ctx.db.filter('destinations', (d) => d.active || ctx.principal?.org.type === 'platform'), query, {
      search: (d) => [d.name.en, d.name.ar, d.code],
      sortable: { name: (d) => d.name.en, code: (d) => d.code },
      defaultSort: 'name:asc',
      filters: {
        country: (d, v) => v.includes(d.countryIso2),
        popular: (d, v) => v.includes(String(d.popular)),
        active: (d, v) => v.includes(String(d.active)),
      },
    }),
  'fx.latest': (ctx, { base }) => {
    const today = ctx.clock.today();
    const out: FxRateEntity[] = [];
    for (const quote of CURRENCY_CODES.filter((c) => c !== base) as CurrencyCode[]) {
      const r = rateOn(ctx.db, base, quote, today);
      if (!r) continue;
      out.push({
        id: `fx_${base}${quote}_${r.date}`, createdAt: ctx.clock.nowIso(), updatedAt: ctx.clock.nowIso(), version: 1,
        base, quote, rate: r.rate, date: r.date, source: 'seed', isDemoValue: true,
      });
    }
    return out;
  },
  'fx.history': (ctx, { base, quote, from, to }) => {
    const end = to ?? ctx.clock.today();
    const dates = [...new Set(ctx.db.filter('fxRates', (r) => r.date <= end && (!from || r.date >= from)).map((r) => r.date))].sort();
    return dates.flatMap((date) => {
      const r = rateOn(ctx.db, base, quote, date);
      return r ? [{ id: `fx_${base}${quote}_${date}`, createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`, version: 1, base, quote, rate: r.rate, date, source: 'seed' as const, isDemoValue: true }] : [];
    });
  },
};
