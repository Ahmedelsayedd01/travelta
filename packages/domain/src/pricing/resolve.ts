import type { InventorySource, MarkupLayer, ServiceType } from '@travelta/contracts';
import type { CustomerType, MarkupRuleEntity } from '@travelta/schemas';

/** What a rule is matched against (PRICING_ENGINE §4). */
export interface MatchContext {
  serviceType: ServiceType;
  source: InventorySource;
  supplierId: string;
  /** The tier below the rule owner: platform rules target agencies, agency rules target sub-agencies. */
  targetAgencyId: string | null;
  productId: string | null;
  destinationId: string | null;
  nationalityGroupId: string | null;
  customerType: CustomerType;
  channel: 'b2b' | 'b2c';
  bookingDate: string;
  travelDate: string;
}

/** Specificity weights: the most specific matching rule wins (proposal order: product → destination → nationality → customer group). */
export const SPECIFICITY = {
  product: 64,
  supplier: 32,
  targetAgency: 16,
  destination: 8,
  nationalityGroup: 4,
  customerType: 2,
  serviceType: 1,
  source: 1,
  channel: 1,
} as const;

const inList = <T>(list: readonly T[] | undefined, value: T | null) => list === undefined || list.length === 0 || (value !== null && list.includes(value));
const inWindow = (w: { from?: string; to?: string } | undefined, date: string) => !w || ((!w.from || date >= w.from) && (!w.to || date <= w.to));

export function ruleMatches(rule: MarkupRuleEntity, ctx: MatchContext): boolean {
  const m = rule.match;
  return (
    rule.status === 'active' &&
    inList(m.serviceTypes, ctx.serviceType) &&
    inList(m.sources, ctx.source) &&
    inList(m.supplierIds, ctx.supplierId) &&
    inList(m.targetAgencyIds, ctx.targetAgencyId) &&
    inList(m.productIds, ctx.productId) &&
    inList(m.destinationIds, ctx.destinationId) &&
    inList(m.nationalityGroupIds, ctx.nationalityGroupId) &&
    inList(m.customerTypes, ctx.customerType) &&
    (m.channel === undefined || m.channel === ctx.channel) &&
    inWindow(m.bookingWindow, ctx.bookingDate) &&
    inWindow(m.travelWindow, ctx.travelDate)
  );
}

const has = (list: readonly unknown[] | undefined) => (list?.length ?? 0) > 0;

export function specificity(rule: MarkupRuleEntity): number {
  const m = rule.match;
  return (
    (has(m.productIds) ? SPECIFICITY.product : 0) +
    (has(m.supplierIds) ? SPECIFICITY.supplier : 0) +
    (has(m.targetAgencyIds) ? SPECIFICITY.targetAgency : 0) +
    (has(m.destinationIds) ? SPECIFICITY.destination : 0) +
    (has(m.nationalityGroupIds) ? SPECIFICITY.nationalityGroup : 0) +
    (has(m.customerTypes) ? SPECIFICITY.customerType : 0) +
    (has(m.serviceTypes) ? SPECIFICITY.serviceType : 0) +
    (has(m.sources) ? SPECIFICITY.source : 0) +
    (m.channel ? SPECIFICITY.channel : 0)
  );
}

export interface ResolvedRule {
  rule: MarkupRuleEntity;
  score: number;
  /** Other rules that also matched, ordered by precedence (shown in the pricing simulator). */
  alsoMatched: { id: string; name: string; score: number }[];
}

/** Pick the winning rule of one layer owned by `ownerTenantId`: highest specificity, then priority, then newest. */
export function resolveRule(rules: readonly MarkupRuleEntity[], layer: MarkupLayer, ownerTenantId: string, ctx: MatchContext): ResolvedRule | null {
  const candidates = rules
    .filter((r) => r.layer === layer && r.tenantId === ownerTenantId && ruleMatches(r, ctx))
    .map((rule) => ({ rule, score: specificity(rule) }))
    .sort((a, b) => b.score - a.score || b.rule.priority - a.rule.priority || b.rule.updatedAt.localeCompare(a.rule.updatedAt));
  const [best, ...rest] = candidates;
  if (!best) return null;
  return { ...best, alsoMatched: rest.map((c) => ({ id: c.rule.id, name: c.rule.name, score: c.score })) };
}
