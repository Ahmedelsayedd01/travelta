'use client';

import type { PriceBreakdown } from '@travelta/schemas';
import { formatMoney, money } from '@travelta/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

const OWNER_TONE = { supplier: 'neutral', platform: 'accent', agency: 'primary', sub_agency: 'info', tax: 'warning' } as const;

/**
 * The price waterfall (PRICING_ENGINE §10): every line, its basis and rule, totals, settlement and locked FX.
 * Renders whatever projection the server returned — redaction happens server-side, never here.
 */
export function PriceBreakdownView({ breakdown: b, showSettlement = true }: { breakdown: PriceBreakdown; showSettlement?: boolean }) {
  const t = useTranslations('pricing');
  const locale = useLocale();
  const format = useFormatter();
  const m = (minor: number) => formatMoney(money(minor, b.currency), locale);
  const s = b.settlement;
  const settlement = [
    ['supplierPayout', s.supplierPayoutMinor],
    ['commission', s.commissionMinor],
    ['platformRevenue', s.platformRevenueMinor],
    ['agencyRevenue', s.agencyRevenueMinor],
    ['subAgencyRevenue', s.subAgencyRevenueMinor],
    ['taxPayable', s.taxPayableMinor],
  ].filter(([, v]) => v !== 0) as [string, number][];

  return (
    <div className="flex flex-col gap-5" data-testid="price-breakdown">
      <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {b.lines.map((l, i) => (
          <li key={`${l.key}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm" data-line={l.key}>
            <Badge tone={OWNER_TONE[l.owner]} className="min-w-20 justify-center">{t(`line_${l.key}` as never)}</Badge>
            <span className="min-w-0 flex-1 text-fg-muted">
              {l.ruleName && <span className="font-medium text-fg">{l.ruleName}</span>}
              {l.basis && <span dir="ltr" className="ms-2 text-xs">{l.basis}</span>}
              {l.ruleVersion !== null && <span className="ms-2 text-xs">{t('version', { n: l.ruleVersion })}</span>}
              {l.clamped && <Badge tone="warning" className="ms-2">{t('clamped')}</Badge>}
              {l.override && <Badge tone="warning" className="ms-2 max-w-full whitespace-normal">{t('overridden')}: {l.override.reason}</Badge>}
            </span>
            <span className={cn('tabular font-medium', l.amountMinor < 0 ? 'text-success' : 'text-fg')}>{l.amountMinor > 0 && i > 0 ? '+' : ''}{m(l.amountMinor)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between px-4 py-2.5 text-sm"><span className="text-fg-muted">{t('preTax')}</span><span className="tabular">{m(b.totals.preTaxMinor)}</span></li>
        <li className="flex items-center justify-between bg-primary-soft px-4 py-3">
          <span className="font-semibold text-on-primary-soft">{t('customerTotal')}</span>
          <span className="tabular text-lg font-bold text-on-primary-soft" data-testid="customer-total">{m(b.totals.customerTotalMinor)}</span>
        </li>
      </ol>

      {showSettlement && settlement.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-fg">{t('settlement')}</p>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {settlement.map(([k, v]) => (
              <div key={k} className="rounded-md border border-border bg-surface px-3 py-2">
                <dt className="text-xs text-fg-muted">{t(k as never)}</dt>
                <dd className="tabular text-sm font-semibold text-fg">{m(v)}</dd>
              </div>
            ))}
            <div className="rounded-md border border-border bg-surface px-3 py-2">
              <dt className="text-xs text-fg-muted">{t('grossProfit')}</dt>
              <dd className="tabular text-sm font-semibold text-fg">{m(b.margins.grossProfitMinor)}</dd>
            </div>
          </dl>
        </div>
      )}

      {b.fx.length > 0 && (
        <p className="text-xs text-fg-muted">
          {b.fx.map((f) => t('fxLocked', { base: f.base, quote: f.quote, rate: format.number(f.rate, { maximumFractionDigits: 6 }), date: f.date })).join(' · ')}
        </p>
      )}
      {b.warnings.length > 0 && <ul className="text-xs text-warning">{b.warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}
    </div>
  );
}
