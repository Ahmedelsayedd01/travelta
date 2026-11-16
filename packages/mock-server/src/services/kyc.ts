import { KYC_DOC_TYPES, type KycDocType } from '@travelta/contracts';
import type { KycCaseDto, KycCaseEntity, KycDocumentDto, KycDocumentEntity } from '@travelta/schemas';
import { diffDays } from '@travelta/shared';
import type { DemoClock } from '../clock';
import type { RequestContext } from '../context';
import type { Database } from '../db/database';
import { ApiException } from '../errors';

/** KYC-5: warn this many days before a document expires. */
export const KYC_WARNING_DAYS = 30;

export const currentDocuments = (db: Database, tenantId: string) =>
  db.filter('kycDocuments', (d) => d.tenantId === tenantId && d.current);

function toDocDto(clock: DemoClock, d: KycDocumentEntity): KycDocumentDto {
  const daysToExpiry = diffDays(clock.today(), d.expiryDate);
  return { ...d, daysToExpiry, expiringSoon: d.status !== 'expired' && daysToExpiry >= 0 && daysToExpiry <= KYC_WARNING_DAYS };
}

export function toCaseDto(ctx: RequestContext, kase: KycCaseEntity): KycCaseDto {
  const org = ctx.db.get('organizations', kase.tenantId);
  if (!org) throw new ApiException('NOT_FOUND', 'Organization not found');
  const all = ctx.db.filter('kycDocuments', (d) => d.caseId === kase.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const documents = KYC_DOC_TYPES.flatMap((t) => all.filter((d) => d.docType === t && d.current)).map((d) => toDocDto(ctx.clock, d));
  const present = new Set(documents.filter((d) => d.status !== 'rejected' && d.status !== 'expired').map((d) => d.docType));
  const missing = KYC_DOC_TYPES.filter((t) => !present.has(t));
  return {
    id: kase.id, status: kase.status, submittedAt: kase.submittedAt, decidedAt: kase.decidedAt,
    organization: { id: org.id, type: org.type, name: org.name, legalName: org.legalName, status: org.status, city: org.city },
    documents,
    history: all.filter((d) => !d.current).map((d) => toDocDto(ctx.clock, d)),
    decisions: ctx.db.filter('kycDecisions', (x) => x.caseId === kase.id).sort((a, b) => b.at.localeCompare(a.at))
      .map((x) => ({ ...x, decidedByName: ctx.db.get('users', x.decidedBy)?.name ?? '—' })),
    serviceLines: ctx.db.filter('serviceLines', (s) => s.tenantId === org.id),
    missing,
    canSubmit: (kase.status === 'draft' || kase.status === 'changes_requested') && missing.length === 0,
    warnings: documents.filter((d) => d.expiringSoon).map((d) => ({ docType: d.docType, daysToExpiry: d.daysToExpiry })),
  };
}

export function caseFor(db: Database, tenantId: string): KycCaseEntity {
  const kase = db.find('kycCases', (c) => c.tenantId === tenantId);
  if (!kase) throw new ApiException('NOT_FOUND', 'KYC case not found');
  return kase;
}

/**
 * Clock-driven compliance job (KYC-5), run before every request:
 *  - accepted documents past their expiry become `expired`;
 *  - an active organization with an expired required document becomes `blocked_expired_docs`;
 *  - a blocked organization whose current documents are all accepted and valid is restored to `active`.
 * Returns true when anything changed (so the server persists).
 */
export function runKycExpiryJob(db: Database, clock: DemoClock): boolean {
  const today = clock.today();
  const now = clock.nowIso();
  let changed = false;
  for (const d of db.filter('kycDocuments', (x) => x.current && x.status === 'accepted' && x.expiryDate < today)) {
    db.replace('kycDocuments', { ...d, status: 'expired', version: d.version + 1, updatedAt: now });
    changed = true;
  }
  for (const org of db.filter('organizations', (o) => (o.type === 'agency' || o.type === 'supplier') && o.parentId === null)) {
    const docs = currentDocuments(db, org.id);
    if (docs.length === 0) continue;
    const valid = (t: KycDocType) => docs.some((d) => d.docType === t && d.status === 'accepted' && d.expiryDate >= today);
    const allValid = KYC_DOC_TYPES.every(valid);
    if (org.status === 'active' && org.kycStatus === 'approved' && !allValid && docs.some((d) => d.status === 'expired')) {
      db.replace('organizations', { ...org, status: 'blocked_expired_docs', version: org.version + 1, updatedAt: now });
      changed = true;
    } else if (org.status === 'blocked_expired_docs' && allValid) {
      db.replace('organizations', { ...org, status: 'active', version: org.version + 1, updatedAt: now });
      changed = true;
    }
  }
  return changed;
}

/**
 * KYC-4/5 + SUB: organizations that are not active (pending KYC, expired documents, suspended, rejected)
 * can't book or sell. Booking, checkout and supplier publishing operations call this.
 */
export function assertOrgEligible(ctx: RequestContext): void {
  const org = ctx.principal?.org;
  if (!org) throw new ApiException('UNAUTHENTICATED', 'Sign in required');
  if (org.status !== 'active') {
    throw new ApiException('ORG_NOT_ELIGIBLE', `Organization status ${org.status} does not allow booking or selling`);
  }
}

export function daysBetween(fromIso: string, toIso: string): number {
  return diffDays(fromIso.slice(0, 10), toIso.slice(0, 10));
}
