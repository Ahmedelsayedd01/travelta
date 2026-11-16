import { KYC_DOC_TYPES, type KycDocType } from '@travelta/contracts';
import type { KycCaseEntity, KycDecisionEntity, KycDocumentEntity, OrganizationEntity, ServiceLineEntity, UserEntity } from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import type { SeedContext } from './context';

const FILE_NAMES: Record<KycDocType, string> = {
  commercial_register: 'commercial-register.pdf',
  tax_card: 'tax-card.pdf',
  tourism_license: 'tourism-license.pdf',
};
const PREFIX: Record<KycDocType, string> = { commercial_register: 'CR', tax_card: 'TC', tourism_license: 'TL' };

/**
 * KYC dataset (MOCK_DATA_ARCHITECTURE §4): approved cases for active tenants, plus the demo scenarios —
 * Al Noor's tourism licence expires in 20 days (warning), Sunrise's tax card expired (blocked),
 * Red Sea is submitted and waiting in the compliance queue, Blue Line has a service line awaiting approval.
 */
export function seedKyc(s: SeedContext, orgs: OrganizationEntity[], orgIds: Record<string, string>, users: UserEntity[]) {
  const admin = users.find((u) => u.email === 'admin@travelta.demo')!;
  const cases: KycCaseEntity[] = [];
  const documents: KycDocumentEntity[] = [];
  const decisions: KycDecisionEntity[] = [];
  const serviceLines: ServiceLineEntity[] = [];
  const keyOf = Object.fromEntries(Object.entries(orgIds).map(([k, id]) => [id, k]));

  for (const org of orgs) {
    if (org.type === 'platform' || org.isPlatformRetail || org.parentId) continue;
    const key = keyOf[org.id]!;
    const submitted = key === 'redsea';
    const caseId = s.id('kyc');
    const submittedAt = new Date(s.now - (submitted ? 2 : s.rng.int(120, 400)) * 86_400_000).toISOString();
    cases.push({
      id: caseId, ...s.stamp(), tenantId: org.id, status: submitted ? 'submitted' : 'approved', submittedAt,
      decidedAt: submitted ? null : new Date(Date.parse(submittedAt) + 2 * 86_400_000).toISOString(),
    });
    for (const docType of KYC_DOC_TYPES) {
      let expiry = addDays(s.today, s.rng.int(120, 700));
      let status: KycDocumentEntity['status'] = submitted ? 'pending' : 'accepted';
      if (key === 'alnoor' && docType === 'tourism_license') expiry = addDays(s.today, 20);
      if (key === 'sunrise' && docType === 'tax_card') { expiry = addDays(s.today, -5); status = 'expired'; }
      documents.push({
        id: s.id('kdoc'), ...s.stamp(), tenantId: org.id, caseId, docType, number: `${PREFIX[docType]}-${s.rng.int(100000, 999999)}`,
        issueDate: addDays(s.today, -s.rng.int(200, 900)), expiryDate: expiry,
        file: { name: FILE_NAMES[docType], type: 'application/pdf', size: s.rng.int(180_000, 900_000), dataUrl: null },
        status, docVersion: 1, current: true, reviewNote: null,
      });
    }
    if (!submitted) {
      decisions.push({ id: s.id('kdec'), ...s.stamp(), tenantId: org.id, caseId, decision: 'approve', reason: null, documentId: null, decidedBy: admin.id, at: new Date(Date.parse(submittedAt) + 2 * 86_400_000).toISOString() });
    }
    if (org.type === 'supplier') {
      for (const serviceType of org.serviceTypes) {
        serviceLines.push({ id: s.id('sline'), ...s.stamp(), tenantId: org.id, serviceType, status: 'approved', decidedBy: admin.id, decidedAt: s.nowIso, reason: null });
      }
      if (key === 'blueline') {
        serviceLines.push({ id: s.id('sline'), ...s.stamp(), tenantId: org.id, serviceType: 'tour', status: 'requested', decidedBy: null, decidedAt: null, reason: null });
      }
    }
  }
  return { cases, documents, decisions, serviceLines };
}
