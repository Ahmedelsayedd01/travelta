import type { MarkupLayer } from '@travelta/contracts';
import type { CommercialSettingsEntity, MarkupRuleEntity, OrganizationEntity } from '@travelta/schemas';
import { createId, toMinor } from '@travelta/shared';
import type { RequestContext } from '../context';
import { ApiException, forbidden, notFound } from '../errors';
import { listPage } from '../query';
import { assertPermission, requireStaff } from '../security';
import { audit } from '../services/audit';
import { audienceOf, projectBreakdown, quote } from '../services/pricing';
import type { HandlerMap } from './types';

const stamp = (ctx: RequestContext) => {
  const now = ctx.clock.nowIso();
  return { createdAt: now, updatedAt: now, version: 1 };
};

function layerOf(org: OrganizationEntity): MarkupLayer {
  if (org.type === 'platform') return 'platform';
  if (org.type === 'agency') return org.parentId ? 'sub_agent' : 'agency';
  throw forbidden('Suppliers do not set markups');
}

/** Default settings used until a tenant saves its own (all DEMO values). */
export function defaultSettings(ctx: RequestContext, org: OrganizationEntity): CommercialSettingsEntity {
  return {
    id: `cs_${org.id}`, ...stamp(ctx), tenantId: org.id, defaultMarkupPct: org.type === 'platform' ? 0 : 10,
    platformDefaults: org.type === 'platform' ? { apiPct: 8, networkPct: 5 } : null, childGuardrails: {},
    defaultGuardrail: { minPct: 0, maxPct: org.type === 'platform' ? 40 : 20 }, fxBufferPct: 0, rounding: {},
    maxDiscountPctByRole: {}, defaultCreditLimitMinor: null, payLaterEnabled: false, cancellationAdminFeeMinor: 0, isDemoValue: true,
  };
}

const settingsFor = (ctx: RequestContext, org: OrganizationEntity) => ctx.db.find('commercialSettings', (s) => s.tenantId === org.id) ?? defaultSettings(ctx, org);

/** The guardrail a layer's percent markups must respect: platform's for agencies, the parent agency's for sub-agencies. */
function guardrailFor(ctx: RequestContext, org: OrganizationEntity, rule: { match: { serviceTypes?: string[] } }) {
  const layer = layerOf(org);
  if (layer === 'platform') return null;
  const above = layer === 'agency' ? ctx.db.find('organizations', (o) => o.type === 'platform') : ctx.db.get('organizations', org.parentId!);
  if (!above) return null;
  const s = settingsFor(ctx, above);
  const services = rule.match.serviceTypes?.length ? rule.match.serviceTypes : null;
  const ranges = services ? services.map((t) => s.childGuardrails[t as keyof typeof s.childGuardrails] ?? s.defaultGuardrail) : [s.defaultGuardrail];
  return { minPct: Math.max(...ranges.map((r) => r.minPct)), maxPct: Math.min(...ranges.map((r) => r.maxPct)) };
}

export const pricingHandlers: HandlerMap<
  | 'pricing.rules.list' | 'pricing.rules.save' | 'pricing.rules.versions' | 'pricing.simulate' | 'commercialSettings.get' | 'commercialSettings.update'
  | 'pricing.taxProfiles.list' | 'pricing.taxProfiles.save' | 'pricing.fees.list' | 'pricing.fees.save' | 'promoCodes.list' | 'promoCodes.save'
> = {
  'pricing.rules.list': (ctx, query) => {
    const { org } = assertPermission(ctx, 'pricing.view');
    return listPage(ctx.db.filter('markupRules', (r) => r.tenantId === org.id), query, {
      search: (r) => [r.name],
      sortable: { name: (r) => r.name, priority: (r) => r.priority, updatedAt: (r) => r.updatedAt, value: (r) => r.value },
      defaultSort: 'updatedAt:desc',
      filters: { status: (r, v) => v.includes(r.status), service: (r, v) => !r.match.serviceTypes?.length || r.match.serviceTypes.some((s) => v.includes(s)) },
    });
  },

  /** Create or edit a rule. Edits create a new version; the previous one is kept for bookings that used it (PRC-14). */
  'pricing.rules.save': (ctx, { id, ...input }) => {
    const p = assertPermission(ctx, 'pricing.manage_rules');
    const layer = layerOf(p.org);
    const g = guardrailFor(ctx, p.org, input);
    if (g && input.mode === 'percent' && input.status === 'active' && (input.value < g.minPct || input.value > g.maxPct)) {
      throw new ApiException('VALIDATION_ERROR', `Markup must be between ${g.minPct}% and ${g.maxPct}%`, [{ field: 'value', issue: 'validation.outside_guardrail', params: g }]);
    }
    for (const target of input.match.targetAgencyIds ?? []) {
      const t = ctx.db.get('organizations', target);
      const ok = layer === 'platform' ? t?.type === 'agency' : t?.parentId === p.org.id;
      if (!ok) throw new ApiException('VALIDATION_ERROR', 'Unknown target agency', [{ field: 'match.targetAgencyIds', issue: 'validation.invalid_value' }]);
    }
    const now = ctx.clock.nowIso();
    let saved: MarkupRuleEntity;
    if (id) {
      const existing = ctx.db.get('markupRules', id);
      if (!existing || existing.tenantId !== p.org.id) throw notFound('Rule');
      saved = ctx.db.replace('markupRules', { ...existing, ...input, ruleVersion: existing.ruleVersion + 1, version: existing.version + 1, updatedAt: now, isDemoValue: false });
      audit(ctx, { tenantId: p.org.id, action: 'pricing.rule_updated', entity: 'markup_rule', entityId: id, before: { value: existing.value, mode: existing.mode, status: existing.status }, after: { value: saved.value, mode: saved.mode, status: saved.status } });
    } else {
      saved = ctx.db.insert('markupRules', { id: createId('mrule', ctx.clock.now()), ...stamp(ctx), tenantId: p.org.id, layer, ruleVersion: 1, isDemoValue: false, ...input });
      audit(ctx, { tenantId: p.org.id, action: 'pricing.rule_created', entity: 'markup_rule', entityId: saved.id, after: { name: saved.name, value: saved.value, mode: saved.mode } });
    }
    ctx.db.insert('markupRuleVersions', { id: createId('mrv', ctx.clock.now()), ...stamp(ctx), ruleId: saved.id, ruleVersion: saved.ruleVersion, snapshot: saved, changedBy: p.user.id });
    return saved;
  },

  'pricing.rules.versions': (ctx, { ruleId }) => {
    const { org } = assertPermission(ctx, 'pricing.view');
    const rule = ctx.db.get('markupRules', ruleId);
    if (!rule || rule.tenantId !== org.id) throw notFound('Rule');
    return ctx.db.filter('markupRuleVersions', (v) => v.ruleId === ruleId).sort((a, b) => b.ruleVersion - a.ruleVersion);
  },

  /** Pricing simulator: the full waterfall for a scenario, redacted to the caller's audience (TENANCY §4). */
  'pricing.simulate': (ctx, input) => {
    const p = assertPermission(ctx, 'pricing.simulate');
    let sellerOrgId: string;
    if (p.org.type === 'platform') {
      const retail = ctx.db.find('organizations', (o) => o.isPlatformRetail);
      sellerOrgId = input.subAgencyId ?? input.agencyId ?? retail!.id;
    } else {
      if (input.agencyId || input.subAgencyId) {
        const target = input.subAgencyId ?? input.agencyId!;
        const t = ctx.db.get('organizations', target);
        if (!t || (t.id !== p.org.id && t.parentId !== p.org.id)) throw forbidden('You can only simulate your own organization or your sub-agencies');
        sellerOrgId = target;
      } else sellerOrgId = p.org.id;
    }
    const result = quote(ctx.db, ctx.clock, {
      serviceType: input.serviceType, source: input.source, ownership: input.ownership, supplierId: input.supplierId ?? 'simulated-supplier',
      productId: input.productId, destinationId: input.destinationId, nationalityGroupId: input.nationalityGroupId, customerType: input.customerType,
      channel: input.channel, currency: input.targetCurrency, travelDate: input.travelDate, sellerOrgId, promoCode: input.promoCode,
      lines: [{ key: 'scenario', label: { en: 'Scenario', ar: 'سيناريو' }, unitType: input.unitType, quantity: input.quantity, netUnitMinor: toMinor(input.netAmount, input.netCurrency), currency: input.netCurrency }],
    });
    const audience = audienceOf(p.org, 'staff');
    if (audience === 'customer' || audience === 'supplier') throw forbidden();
    return {
      breakdown: projectBreakdown(result.breakdown, audience),
      audience,
      resolution: result.resolution.map((r) => (audience !== 'platform' && r.layer === 'platform' && r.source !== 'skipped' ? { ...r, ruleId: null, ruleName: null, score: null, source: 'hidden' as const, alsoMatched: [] } : r)),
    };
  },

  'commercialSettings.get': (ctx) => {
    const p = requireStaff(ctx);
    if (!p.permissions.has('commercial_settings.view') && !p.permissions.has('pricing.view')) throw forbidden();
    return settingsFor(ctx, p.org);
  },

  /** PRC-13: every commercial number is editable here; edits clear the DEMO flag and are audited. */
  'commercialSettings.update': (ctx, input) => {
    const p = requireStaff(ctx);
    const allowed = p.org.type === 'platform' ? p.permissions.has('commercial_settings.manage') : p.permissions.has('pricing.manage_rules');
    if (!allowed) throw forbidden();
    const current = settingsFor(ctx, p.org);
    const next: CommercialSettingsEntity = {
      ...current, ...input,
      // Platform-only values cannot be set by tenants.
      platformDefaults: p.org.type === 'platform' ? input.platformDefaults : null,
      fxBufferPct: p.org.type === 'platform' ? input.fxBufferPct : 0,
      version: current.version + 1, updatedAt: ctx.clock.nowIso(), isDemoValue: false,
    };
    const exists = ctx.db.get('commercialSettings', current.id);
    const saved = exists ? ctx.db.replace('commercialSettings', next) : ctx.db.insert('commercialSettings', { ...next, version: 1 });
    audit(ctx, { tenantId: p.org.id, action: 'commercial_settings.updated', entity: 'commercial_settings', entityId: saved.id, before: { defaultMarkupPct: current.defaultMarkupPct, platformDefaults: current.platformDefaults, defaultGuardrail: current.defaultGuardrail }, after: { defaultMarkupPct: saved.defaultMarkupPct, platformDefaults: saved.platformDefaults, defaultGuardrail: saved.defaultGuardrail } });
    return saved;
  },

  'pricing.taxProfiles.list': (ctx) => ctx.db.filter('taxProfiles', (t) => t.tenantId === assertPermission(ctx, 'pricing.view').org.id),
  'pricing.taxProfiles.save': (ctx, { id, ...input }) => {
    const { org } = assertPermission(ctx, 'pricing.manage_rules');
    if (id) {
      const row = ctx.db.get('taxProfiles', id);
      if (!row || row.tenantId !== org.id) throw notFound('Tax profile');
      const saved = ctx.db.replace('taxProfiles', { ...row, ...input, version: row.version + 1, updatedAt: ctx.clock.nowIso(), isDemoValue: false });
      audit(ctx, { tenantId: org.id, action: 'pricing.tax_profile_updated', entity: 'tax_profile', entityId: id, before: { rateBp: row.rateBp }, after: { rateBp: saved.rateBp } });
      return saved;
    }
    return ctx.db.insert('taxProfiles', { id: createId('tax', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, ...input, isDemoValue: false });
  },

  'pricing.fees.list': (ctx) => ctx.db.filter('feeRules', (f) => f.tenantId === assertPermission(ctx, 'pricing.view').org.id),
  'pricing.fees.save': (ctx, { id, ...input }) => {
    const { org } = assertPermission(ctx, 'pricing.manage_rules');
    if (id) {
      const row = ctx.db.get('feeRules', id);
      if (!row || row.tenantId !== org.id) throw notFound('Fee');
      return ctx.db.replace('feeRules', { ...row, ...input, version: row.version + 1, updatedAt: ctx.clock.nowIso(), isDemoValue: false });
    }
    return ctx.db.insert('feeRules', { id: createId('fee', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, ...input, isDemoValue: false });
  },

  'promoCodes.list': (ctx) => ctx.db.filter('promoCodes', (p) => p.tenantId === assertPermission(ctx, 'pricing.view').org.id),
  'promoCodes.save': (ctx, { id, ...input }) => {
    const { org } = assertPermission(ctx, 'pricing.discount');
    const code = input.code.toUpperCase();
    if (ctx.db.find('promoCodes', (p) => p.tenantId === org.id && p.code === code && p.id !== id)) {
      throw new ApiException('CONFLICT', 'This code already exists', [{ field: 'code', issue: 'validation.name_taken' }]);
    }
    if (id) {
      const row = ctx.db.get('promoCodes', id);
      if (!row || row.tenantId !== org.id) throw notFound('Promo code');
      return ctx.db.replace('promoCodes', { ...row, ...input, code, version: row.version + 1, updatedAt: ctx.clock.nowIso(), isDemoValue: false });
    }
    const row = ctx.db.insert('promoCodes', { id: createId('promo', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, ...input, code, uses: 0, isDemoValue: false });
    audit(ctx, { tenantId: org.id, action: 'promo.created', entity: 'promo_code', entityId: row.id, after: { code } });
    return row;
  },
};
