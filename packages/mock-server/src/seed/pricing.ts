import type { CommercialSettingsEntity, FeeRuleEntity, MarkupRuleEntity, MarkupRuleVersionEntity, OrganizationEntity, PromoCodeEntity, TaxProfileEntity } from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import type { SeedContext } from './context';

/**
 * DEMO commercial values (decision Q6): every number below is a placeholder flagged `isDemoValue`,
 * editable in the admin UI, and never an approved commercial term.
 */
export function seedPricing(s: SeedContext, orgs: OrganizationEntity[], orgIds: Record<string, string>) {
  const settings: CommercialSettingsEntity[] = [];
  const rules: MarkupRuleEntity[] = [];
  const taxProfiles: TaxProfileEntity[] = [];
  const feeRules: FeeRuleEntity[] = [];
  const promoCodes: PromoCodeEntity[] = [];

  const base = (tenantId: string, patch: Partial<CommercialSettingsEntity>): CommercialSettingsEntity => ({
    id: s.id('cs'), ...s.stamp(), tenantId, defaultMarkupPct: 10, platformDefaults: null, childGuardrails: {}, defaultGuardrail: { minPct: 0, maxPct: 20 },
    fxBufferPct: 0, rounding: {}, maxDiscountPctByRole: { agency_owner: 20, sales_agent: 5 }, defaultCreditLimitMinor: null, payLaterEnabled: false, cancellationAdminFeeMinor: 0, isDemoValue: true, ...patch,
  });
  settings.push(base(orgIds.platform!, {
    defaultMarkupPct: 0, platformDefaults: { apiPct: 8, networkPct: 5 }, defaultGuardrail: { minPct: 0, maxPct: 40 },
    childGuardrails: { hotel: { minPct: 0, maxPct: 35 }, umrah: { minPct: 0, maxPct: 25 } }, defaultCreditLimitMinor: 10_000_000,
    maxDiscountPctByRole: { super_admin: 100 },
  }));
  settings.push(base(orgIds.direct!, { defaultMarkupPct: 12, payLaterEnabled: true, rounding: { EGP: { mode: 'up', incrementMinor: 100, charmMinor: null } } }));
  for (const key of ['nile', 'alnoor', 'redsea', 'sunrise'] as const) settings.push(base(orgIds[key]!, { defaultMarkupPct: key === 'alnoor' ? 8 : 10, payLaterEnabled: key === 'nile', cancellationAdminFeeMinor: key === 'nile' ? 15000 : 0 }));
  settings.push(base(orgIds.delta!, { defaultMarkupPct: 5, maxDiscountPctByRole: { sub_agent_owner: 10 } }));

  const rule = (tenantId: string, layer: MarkupRuleEntity['layer'], patch: Partial<MarkupRuleEntity> & Pick<MarkupRuleEntity, 'name'>): MarkupRuleEntity => ({
    id: s.id('mrule'), ...s.stamp(), tenantId, layer, ruleVersion: 1, status: 'active', match: {}, mode: 'percent', value: 0, priority: 10, isDemoValue: true, ...patch,
  });
  rules.push(
    rule(orgIds.platform!, 'platform', { name: 'Nile Horizon — hotels', value: 6, match: { serviceTypes: ['hotel'], targetAgencyIds: [orgIds.nile!] } }),
    rule(orgIds.platform!, 'platform', { name: 'Umrah packages', value: 4, match: { serviceTypes: ['umrah'] } }),
    rule(orgIds.nile!, 'agency', { name: 'Hotels', value: 12, match: { serviceTypes: ['hotel'] } }),
    rule(orgIds.nile!, 'agency', { name: 'Tours — per person', mode: 'fixed', value: 150, fixedCurrency: 'EGP', fixedPer: 'unit', match: { serviceTypes: ['tour'] } }),
    rule(orgIds.nile!, 'agency', { name: 'VIP customers', value: 8, match: { customerTypes: ['vip'] } }),
    rule(orgIds.direct!, 'agency', { name: 'Hotels — online', value: 14, match: { serviceTypes: ['hotel'], channel: 'b2c' } }),
    rule(orgIds.delta!, 'sub_agent', { name: 'All services', value: 5 }),
  );
  const versions: MarkupRuleVersionEntity[] = rules.map((r) => ({ id: s.id('mrv'), ...s.stamp(), ruleId: r.id, ruleVersion: 1, snapshot: r, changedBy: null }));

  for (const org of orgs.filter((o) => o.type === 'agency')) {
    taxProfiles.push({
      id: s.id('tax'), ...s.stamp(), tenantId: org.id, name: 'VAT 14%', serviceTypes: ['hotel', 'tour', 'activity', 'transfer', 'umrah'],
      rateBp: 1400, inclusive: false, base: 'full_price', isDemoValue: true,
    });
  }
  feeRules.push({ id: s.id('fee'), ...s.stamp(), tenantId: orgIds.direct!, name: 'Online service fee', serviceTypes: [], channel: 'b2c', mode: 'fixed', value: 50, per: 'booking', taxable: false, status: 'active', isDemoValue: true });
  promoCodes.push(
    { id: s.id('promo'), ...s.stamp(), tenantId: orgIds.direct!, code: 'WELCOME10', mode: 'percent', value: 10, serviceTypes: [], validFrom: addDays(s.today, -30), validTo: addDays(s.today, 180), maxUses: 500, uses: 37, status: 'active', isDemoValue: true },
    { id: s.id('promo'), ...s.stamp(), tenantId: orgIds.nile!, code: 'NILE5', mode: 'percent', value: 5, serviceTypes: ['hotel', 'tour'], validFrom: addDays(s.today, -10), validTo: addDays(s.today, 60), maxUses: null, uses: 4, status: 'active', isDemoValue: true },
  );
  return { settings, rules, versions, taxProfiles, feeRules, promoCodes };
}
