import type { CurrencyCode } from '@travelta/contracts';
import type { FxRateEntity } from '@travelta/schemas';
import type { Database } from '../db/database';

/** Pivot currency for stored rates (base → EGP). Cross rates are derived through it. */
export const PIVOT: CurrencyCode = 'EGP';

/** Most recent stored rate for `base → PIVOT` on or before `date`. */
function toPivot(db: Database, base: CurrencyCode, date: string): FxRateEntity | undefined {
  let best: FxRateEntity | undefined;
  for (const r of db.filter('fxRates', (row) => row.base === base && row.quote === PIVOT && row.date <= date)) {
    if (!best || r.date > best.date) best = r;
  }
  return best;
}

/** Units of `quote` per 1 `base` on `date` (FX-1). Returns null when no rate is known. */
export function rateOn(db: Database, base: CurrencyCode, quote: CurrencyCode, date: string): { rate: number; date: string } | null {
  if (base === quote) return { rate: 1, date };
  const b = base === PIVOT ? { rate: 1, date } : toPivot(db, base, date);
  const q = quote === PIVOT ? { rate: 1, date } : toPivot(db, quote, date);
  if (!b || !q) return null;
  return { rate: Math.round((b.rate / q.rate) * 1e8) / 1e8, date: b.date < q.date ? b.date : q.date };
}
