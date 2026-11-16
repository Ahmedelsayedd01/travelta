import { KYC_DOC_TYPES } from '@travelta/contracts';
import type { KycQueueItem } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../context';
import { ApiException, forbidden, notFound } from '../errors';
import { listPage } from '../query';
import { assertPermission } from '../security';
import { audit } from '../services/audit';
import { issueSession, toSessionDto } from '../services/auth';
import { caseFor, daysBetween, runKycExpiryJob, toCaseDto } from '../services/kyc';
import { createSystemRoles } from '../services/orgs';
import { simHash } from '../services/passwords';
import { newTrial } from '../services/subscriptions';
import { kycDecided } from '../services/notifications/events';
import type { HandlerMap } from './types';

const stamp = (ctx: RequestContext) => {
  const now = ctx.clock.nowIso();
  return { createdAt: now, updatedAt: now, version: 1 };
};

function logDecision(ctx: RequestContext, tenantId: string, caseId: string, decision: 'approve' | 'reject' | 'request_changes' | 'accept_document' | 'reject_document', reason: string | null, documentId: string | null) {
  ctx.db.insert('kycDecisions', {
    id: createId('kdec', ctx.clock.now()), ...stamp(ctx), tenantId, caseId, decision, reason, documentId,
    decidedBy: ctx.principal!.user.id, at: ctx.clock.nowIso(),
  });
}

function slugFor(ctx: RequestContext, name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company';
  let slug = base;
  for (let i = 2; ctx.db.find('organizations', (o) => o.slug === slug); i++) slug = `${base}-${i}`;
  return slug;
}

export const kycHandlers: HandlerMap<
  | 'onboarding.registerBusiness' | 'kyc.myCase' | 'kyc.uploadDocument' | 'kyc.submit' | 'kyc.queue' | 'kyc.getCase'
  | 'kyc.reviewDocument' | 'kyc.decide' | 'kyc.decideServiceLine' | 'kyc.requestServiceLine'
> = {
  /** Onboarding step 1 (W1): organization `pending_kyc` + owner + draft KYC case; signs the owner in for step 2. */
  'onboarding.registerBusiness': (ctx, input) => {
    if (ctx.db.find('users', (u) => u.email === input.owner.email)) {
      throw new ApiException('CONFLICT', 'An account with this email already exists', [{ field: 'owner.email', issue: 'validation.email_taken' }]);
    }
    const org = ctx.db.insert('organizations', {
      id: createId('org', ctx.clock.now()), ...stamp(ctx), type: input.orgType, parentId: null, name: input.company.name,
      legalName: input.company.legalName, slug: slugFor(ctx, input.company.name.en), countryIso2: input.company.countryIso2, city: input.company.city,
      baseCurrency: input.company.countryIso2 === 'SA' ? 'SAR' : 'EGP', status: 'pending_kyc', kycStatus: 'draft',
      serviceTypes: [], isPlatformRetail: false, contactEmail: input.company.contactEmail, contactPhone: input.company.contactPhone,
    });
    const roles = createSystemRoles(ctx, org);
    const ownerRole = input.orgType === 'agency' ? roles.agency_owner : roles.supplier_admin;
    const salt = createId('slt', ctx.clock.now()).slice(4, 14);
    const user = ctx.db.insert('users', {
      id: createId('usr', ctx.clock.now()), ...stamp(ctx), email: input.owner.email, name: input.owner.name, phone: null, locale: 'en',
      userType: 'staff', status: 'active', passwordHash: simHash(input.owner.password, salt), sellerTenantId: null, lastLoginAt: ctx.clock.nowIso(), emailVerifiedAt: null,
    });
    ctx.db.insert('memberships', { id: createId('mem', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, userId: user.id, roleId: ownerRole.id, status: 'active' });
    ctx.db.insert('kycCases', { id: createId('kyc', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, status: 'draft', submittedAt: null, decidedAt: null });
    // SUB-2: new agencies start a 14-day trial.
    if (input.orgType === 'agency') newTrial(ctx, org.id);
    for (const serviceType of new Set(input.serviceTypes)) {
      if (input.orgType !== 'supplier') break;
      ctx.db.insert('serviceLines', { id: createId('sline', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, serviceType, status: 'requested', decidedBy: null, decidedAt: null, reason: null });
    }
    audit(ctx, { tenantId: org.id, action: 'onboarding.registered', entity: 'organization', entityId: org.id, actorUserId: user.id, after: { orgType: input.orgType, name: input.company.name } });
    return toSessionDto(ctx.db, ctx.clock, issueSession(ctx.db, ctx.clock, user, org.id, 'staff'));
  },

  'kyc.myCase': (ctx) => {
    const { org } = assertPermission(ctx, 'kyc.view_own');
    return toCaseDto(ctx, caseFor(ctx.db, org.id));
  },

  /** Upload or replace a document (new version). KYC-2 validation; allowed in draft/changes_requested, or as a renewal later. */
  'kyc.uploadDocument': (ctx, input) => {
    const { org } = assertPermission(ctx, 'kyc.submit');
    const kase = caseFor(ctx.db, org.id);
    if (kase.status === 'submitted' || kase.status === 'in_review' || kase.status === 'rejected') {
      throw new ApiException('INVALID_TRANSITION', `Documents can't be changed while the case is ${kase.status}`);
    }
    if (input.expiryDate <= ctx.clock.today()) {
      throw new ApiException('VALIDATION_ERROR', 'The document is already expired', [{ field: 'expiryDate', issue: 'validation.already_expired' }]);
    }
    const previous = ctx.db.find('kycDocuments', (d) => d.tenantId === org.id && d.docType === input.docType && d.current);
    if (previous) ctx.db.replace('kycDocuments', { ...previous, current: false, version: previous.version + 1, updatedAt: ctx.clock.nowIso() });
    ctx.db.insert('kycDocuments', {
      id: createId('kdoc', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, caseId: kase.id, docType: input.docType, number: input.number,
      issueDate: input.issueDate, expiryDate: input.expiryDate, file: input.file, status: 'pending', docVersion: (previous?.docVersion ?? 0) + 1,
      current: true, reviewNote: null,
    });
    audit(ctx, { tenantId: org.id, action: previous ? 'kyc.document_replaced' : 'kyc.document_uploaded', entity: 'kyc_document', entityId: input.docType, after: { number: input.number, expiryDate: input.expiryDate } });
    return toCaseDto(ctx, caseFor(ctx.db, org.id));
  },

  'kyc.submit': (ctx) => {
    const { org } = assertPermission(ctx, 'kyc.submit');
    const kase = caseFor(ctx.db, org.id);
    const dto = toCaseDto(ctx, kase);
    // Approved organizations submit renewals: replacement documents go straight to review.
    if (kase.status === 'approved') {
      if (!dto.documents.some((d) => d.status === 'pending')) throw new ApiException('INVALID_TRANSITION', 'No new documents to submit');
    } else if (!dto.canSubmit) {
      throw new ApiException('VALIDATION_ERROR', 'All three documents are required before submitting', dto.missing.map((m) => ({ field: m, issue: 'validation.required' })));
    }
    const status = kase.status === 'approved' ? 'approved' : 'submitted';
    ctx.db.replace('kycCases', { ...kase, status, submittedAt: ctx.clock.nowIso(), version: kase.version + 1, updatedAt: ctx.clock.nowIso() });
    if (status === 'submitted') ctx.db.replace('organizations', { ...org, kycStatus: 'submitted', version: org.version + 1, updatedAt: ctx.clock.nowIso() });
    audit(ctx, { tenantId: org.id, action: 'kyc.submitted', entity: 'kyc_case', entityId: kase.id });
    return toCaseDto(ctx, caseFor(ctx.db, org.id));
  },

  /** Compliance queue: cases awaiting a decision and approved organizations with pending renewals or service lines. */
  'kyc.queue': (ctx, query) => {
    assertPermission(ctx, 'kyc.review');
    const items: KycQueueItem[] = ctx.db.all('kycCases').flatMap((c) => {
      const pendingDocuments = ctx.db.filter('kycDocuments', (d) => d.caseId === c.id && d.current && d.status === 'pending').length;
      const pendingServiceLines = ctx.db.filter('serviceLines', (s) => s.tenantId === c.tenantId && s.status === 'requested').length;
      const org = ctx.db.get('organizations', c.tenantId);
      if (!org) return [];
      const open = c.status === 'submitted' || c.status === 'in_review' || pendingDocuments > 0 || pendingServiceLines > 0 || c.status === 'changes_requested';
      if (!open && !query.filters?.status) return [];
      return [{
        caseId: c.id, organization: { id: org.id, type: org.type, name: org.name, legalName: org.legalName, status: org.status, city: org.city },
        status: c.status, submittedAt: c.submittedAt, pendingDocuments, pendingServiceLines,
        ageDays: c.submittedAt ? daysBetween(c.submittedAt, ctx.clock.nowIso()) : 0,
      }];
    });
    return listPage(items, query, {
      search: (i) => [i.organization.name.en, i.organization.name.ar, i.organization.legalName],
      sortable: { submittedAt: (i) => i.submittedAt, name: (i) => i.organization.name.en, age: (i) => i.ageDays },
      defaultSort: 'submittedAt:asc', // oldest first (W1 step 3)
      filters: { status: (i, v) => v.includes(i.status), type: (i, v) => v.includes(i.organization.type) },
    });
  },

  'kyc.getCase': (ctx, { caseId }) => {
    assertPermission(ctx, 'kyc.review');
    const kase = ctx.db.get('kycCases', caseId);
    if (!kase) throw notFound('KYC case');
    return toCaseDto(ctx, kase);
  },

  'kyc.reviewDocument': (ctx, { documentId, status, note }) => {
    assertPermission(ctx, 'kyc.review');
    const doc = ctx.db.get('kycDocuments', documentId);
    if (!doc || !doc.current) throw notFound('Document');
    if (doc.status !== 'pending') throw new ApiException('INVALID_TRANSITION', 'Only pending documents can be reviewed');
    if (status === 'rejected' && !note?.trim()) throw new ApiException('VALIDATION_ERROR', 'A reason is required', [{ field: 'note', issue: 'validation.required' }]);
    ctx.db.replace('kycDocuments', { ...doc, status, reviewNote: note?.trim() || null, version: doc.version + 1, updatedAt: ctx.clock.nowIso() });
    const kase = ctx.db.get('kycCases', doc.caseId)!;
    if (kase.status === 'submitted') {
      ctx.db.replace('kycCases', { ...kase, status: 'in_review', version: kase.version + 1, updatedAt: ctx.clock.nowIso() });
      const org = ctx.db.get('organizations', doc.tenantId)!;
      ctx.db.replace('organizations', { ...org, kycStatus: 'in_review', version: org.version + 1, updatedAt: ctx.clock.nowIso() });
    }
    logDecision(ctx, doc.tenantId, doc.caseId, status === 'accepted' ? 'accept_document' : 'reject_document', note?.trim() || null, doc.id);
    audit(ctx, { tenantId: doc.tenantId, action: `kyc.document_${status}`, entity: 'kyc_document', entityId: doc.id, after: { note } });
    // A renewal accepted for an approved organization may lift an expiry block immediately.
    runKycExpiryJob(ctx.db, ctx.clock);
    return toCaseDto(ctx, ctx.db.get('kycCases', doc.caseId)!);
  },

  /** KYC-3: approve (all three current documents accepted and valid), reject, or request changes — reasons logged. */
  'kyc.decide': (ctx, { caseId, decision, reason }) => {
    assertPermission(ctx, 'kyc.review');
    const kase = ctx.db.get('kycCases', caseId);
    if (!kase) throw notFound('KYC case');
    if (kase.status !== 'submitted' && kase.status !== 'in_review') throw new ApiException('INVALID_TRANSITION', `Case is ${kase.status}`);
    const org = ctx.db.get('organizations', kase.tenantId)!;
    const docs = ctx.db.filter('kycDocuments', (d) => d.caseId === caseId && d.current);
    if (decision === 'approve') {
      const ok = KYC_DOC_TYPES.every((t) => docs.some((d) => d.docType === t && d.status === 'accepted' && d.expiryDate > ctx.clock.today()));
      if (!ok) throw new ApiException('INVALID_TRANSITION', 'All three documents must be accepted and valid before approval');
    }
    const caseStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'changes_requested';
    const now = ctx.clock.nowIso();
    ctx.db.replace('kycCases', { ...kase, status: caseStatus, decidedAt: now, version: kase.version + 1, updatedAt: now });
    const orgStatus = decision === 'approve' ? (org.status === 'suspended' ? 'suspended' : 'active') : decision === 'reject' ? 'rejected' : 'pending_kyc';
    ctx.db.replace('organizations', { ...org, status: orgStatus, kycStatus: caseStatus, version: org.version + 1, updatedAt: now });
    logDecision(ctx, org.id, caseId, decision, reason?.trim() || null, null);
    kycDecided(ctx, org.id, decision, reason?.trim() || null);
    audit(ctx, { tenantId: org.id, action: `kyc.${decision}`, entity: 'kyc_case', entityId: caseId, before: { status: kase.status }, after: { status: caseStatus, reason } });
    return toCaseDto(ctx, ctx.db.get('kycCases', caseId)!);
  },

  /** KYC-6: a supplier's service line goes live only after this second approval. */
  'kyc.decideServiceLine': (ctx, { serviceLineId, approve, reason }) => {
    assertPermission(ctx, 'kyc.review');
    const line = ctx.db.get('serviceLines', serviceLineId);
    if (!line) throw notFound('Service line');
    if (line.status !== 'requested') throw new ApiException('INVALID_TRANSITION', 'Already decided');
    if (!approve && !reason?.trim()) throw new ApiException('VALIDATION_ERROR', 'A reason is required', [{ field: 'reason', issue: 'validation.required' }]);
    const org = ctx.db.get('organizations', line.tenantId)!;
    if (approve && org.kycStatus !== 'approved') throw new ApiException('ORG_NOT_ELIGIBLE', 'Approve the company KYC before its service lines');
    const now = ctx.clock.nowIso();
    ctx.db.replace('serviceLines', { ...line, status: approve ? 'approved' : 'rejected', decidedBy: ctx.principal!.user.id, decidedAt: now, reason: reason?.trim() || null, version: line.version + 1, updatedAt: now });
    if (approve && !org.serviceTypes.includes(line.serviceType)) {
      ctx.db.replace('organizations', { ...org, serviceTypes: [...org.serviceTypes, line.serviceType], version: org.version + 1, updatedAt: now });
    }
    audit(ctx, { tenantId: org.id, action: approve ? 'kyc.service_line_approved' : 'kyc.service_line_rejected', entity: 'service_line', entityId: line.id, after: { serviceType: line.serviceType, reason } });
    return toCaseDto(ctx, caseFor(ctx.db, org.id));
  },

  'kyc.requestServiceLine': (ctx, { serviceType }) => {
    const { org } = assertPermission(ctx, 'kyc.submit');
    if (org.type !== 'supplier') throw forbidden('Only suppliers request service lines');
    if (ctx.db.find('serviceLines', (s) => s.tenantId === org.id && s.serviceType === serviceType && s.status !== 'rejected')) {
      throw new ApiException('CONFLICT', 'This service line is already requested or approved');
    }
    ctx.db.insert('serviceLines', { id: createId('sline', ctx.clock.now()), ...stamp(ctx), tenantId: org.id, serviceType, status: 'requested', decidedBy: null, decidedAt: null, reason: null });
    audit(ctx, { tenantId: org.id, action: 'kyc.service_line_requested', entity: 'service_line', entityId: serviceType });
    return toCaseDto(ctx, caseFor(ctx.db, org.id));
  },
};
