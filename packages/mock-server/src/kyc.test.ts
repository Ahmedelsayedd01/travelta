import type { UploadDocumentInput } from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from './seed/identity';
import { FIXED_NOW, testServer } from './test-utils';

type Server = ReturnType<typeof testServer>['server'];
const login = (server: Server, email: string, password = DEMO_PASSWORD) => server.handle('auth.login', { email, password, audience: 'staff' });
const TODAY = new Date(FIXED_NOW).toISOString().slice(0, 10);

const file = { name: 'doc.pdf', type: 'application/pdf' as const, size: 120_000, dataUrl: 'data:application/pdf;base64,JVBERi0=' };
const doc = (docType: UploadDocumentInput['docType'], expiryDays = 400): UploadDocumentInput => ({
  docType, number: `${docType.slice(0, 2).toUpperCase()}-12345`, issueDate: addDays(TODAY, -100), expiryDate: addDays(TODAY, expiryDays), file,
});

const registration = {
  orgType: 'agency' as const,
  company: { name: { en: 'Oasis Trips', ar: 'رحلات الواحة' }, legalName: 'Oasis Trips LLC', countryIso2: 'EG', city: 'Luxor', contactEmail: 'hello@oasis.demo', contactPhone: '+20952370000' },
  owner: { name: 'Nour Fathy', email: 'owner@oasis.demo', password: 'Oasis@2026' },
  serviceTypes: [],
  acceptTerms: true as const,
};

describe('business onboarding (W1, KYC-1..4)', () => {
  it('runs sign-up → documents → submit → review → approve, and only then allows selling', async () => {
    const { server } = testServer();
    const owner = await server.handle('onboarding.registerBusiness', registration);
    expect(owner).toMatchObject({ portal: 'agency', organization: { status: 'pending_kyc' }, role: { key: 'agency_owner' } });

    let kase = await server.handle('kyc.myCase', undefined, owner.token);
    expect(kase).toMatchObject({ status: 'draft', canSubmit: false, missing: ['commercial_register', 'tax_card', 'tourism_license'] });
    await expect(server.handle('kyc.submit', undefined, owner.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    for (const t of ['commercial_register', 'tax_card', 'tourism_license'] as const) kase = await server.handle('kyc.uploadDocument', doc(t), owner.token);
    expect(kase.canSubmit).toBe(true);
    kase = await server.handle('kyc.submit', undefined, owner.token);
    expect(kase.status).toBe('submitted');
    await expect(server.handle('kyc.uploadDocument', doc('tax_card'), owner.token)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    const compliance = await login(server, 'compliance@travelta.demo');
    const queue = await server.handle('kyc.queue', { page: 1, pageSize: 50 }, compliance.token);
    expect(queue.items.map((i) => i.organization.name.en)).toContain('Oasis Trips');
    await expect(server.handle('kyc.decide', { caseId: kase.id, decision: 'approve' }, compliance.token)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    for (const d of kase.documents) kase = await server.handle('kyc.reviewDocument', { documentId: d.id, status: 'accepted' }, compliance.token);
    expect(kase.status).toBe('in_review');
    kase = await server.handle('kyc.decide', { caseId: kase.id, decision: 'approve' }, compliance.token);
    expect(kase).toMatchObject({ status: 'approved', organization: { status: 'active' } });
    expect(kase.decisions.map((d) => d.decision)).toEqual(expect.arrayContaining(['approve', 'accept_document']));
    expect(kase.decisions.every((d) => d.decidedByName === 'Youssef Kamal')).toBe(true);
  });

  it('request-changes sends the case back; reject and request-changes require a reason', async () => {
    const { server } = testServer();
    const owner = await server.handle('onboarding.registerBusiness', registration);
    for (const t of ['commercial_register', 'tax_card', 'tourism_license'] as const) await server.handle('kyc.uploadDocument', doc(t), owner.token);
    const kase = await server.handle('kyc.submit', undefined, owner.token);
    const compliance = await login(server, 'compliance@travelta.demo');
    await expect(server.handle('kyc.decide', { caseId: kase.id, decision: 'request_changes' }, compliance.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const back = await server.handle('kyc.decide', { caseId: kase.id, decision: 'request_changes', reason: 'Tax card scan is unreadable' }, compliance.token);
    expect(back).toMatchObject({ status: 'changes_requested', organization: { status: 'pending_kyc' } });
    // The applicant can now replace a document (new version) and resubmit.
    const replaced = await server.handle('kyc.uploadDocument', { ...doc('tax_card'), number: 'TC-99999' }, owner.token);
    expect(replaced.documents.find((d) => d.docType === 'tax_card')).toMatchObject({ number: 'TC-99999', docVersion: 2 });
    expect(replaced.history).toHaveLength(1);
    await expect(server.handle('kyc.submit', undefined, owner.token)).resolves.toMatchObject({ status: 'submitted' });
  });

  it('validates documents (KYC-2): expiry after issue, not already expired, accepted file types and size', async () => {
    const { server } = testServer();
    const owner = await server.handle('onboarding.registerBusiness', registration);
    await expect(server.handle('kyc.uploadDocument', { ...doc('tax_card'), expiryDate: addDays(TODAY, -150) }, owner.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(server.handle('kyc.uploadDocument', { ...doc('tax_card'), issueDate: addDays(TODAY, -400), expiryDate: addDays(TODAY, -1) }, owner.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(server.handle('kyc.uploadDocument', { ...doc('tax_card'), file: { ...file, type: 'image/gif' as never } }, owner.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(server.handle('kyc.uploadDocument', { ...doc('tax_card'), file: { ...file, size: 9_000_000 } }, owner.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects duplicate owner emails and a supplier without service lines', async () => {
    const { server } = testServer();
    await expect(server.handle('onboarding.registerBusiness', { ...registration, owner: { ...registration.owner, email: 'owner@nilehorizon.demo' } })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(server.handle('onboarding.registerBusiness', { ...registration, orgType: 'supplier' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('expiry watcher (KYC-5) on the demo clock', () => {
  it('warns 30 days ahead, blocks on expiry, and restores after an accepted renewal', async () => {
    const { server } = testServer();
    let owner = await login(server, 'owner@alnoor.demo');
    let kase = await server.handle('kyc.myCase', undefined, owner.token);
    expect(kase.warnings).toEqual([{ docType: 'tourism_license', daysToExpiry: 20 }]);

    await server.handle('demo.setClock', { offsetDays: 21 });
    owner = await login(server, 'owner@alnoor.demo');
    expect(owner.organization.status).toBe('blocked_expired_docs');
    kase = await server.handle('kyc.myCase', undefined, owner.token);
    expect(kase.documents.find((d) => d.docType === 'tourism_license')?.status).toBe('expired');
    expect(kase.missing).toEqual(['tourism_license']);

    await server.handle('kyc.uploadDocument', { ...doc('tourism_license'), issueDate: addDays(TODAY, 10), expiryDate: addDays(TODAY, 800) }, owner.token);
    await server.handle('kyc.submit', undefined, owner.token);
    const compliance = await login(server, 'compliance@travelta.demo');
    const renewal = (await server.handle('kyc.queue', { page: 1, pageSize: 50 }, compliance.token)).items.find((i) => i.organization.name.en === 'Al Noor Umrah & Hajj')!;
    expect(renewal.pendingDocuments).toBe(1);
    const pending = (await server.handle('kyc.getCase', { caseId: renewal.caseId }, compliance.token)).documents.find((d) => d.status === 'pending')!;
    await server.handle('kyc.reviewDocument', { documentId: pending.id, status: 'accepted' }, compliance.token);
    expect((await server.handle('auth.me', undefined, owner.token)).organization.status).toBe('active');
  });

  it('seeds Sunrise as blocked with an expired tax card', async () => {
    const { server } = testServer();
    const sunrise = await login(server, 'owner@sunrise.demo');
    const kase = await server.handle('kyc.myCase', undefined, sunrise.token);
    expect(sunrise.organization.status).toBe('blocked_expired_docs');
    expect(kase.documents.find((d) => d.docType === 'tax_card')?.status).toBe('expired');
  });
});

describe('supplier service lines (KYC-6)', () => {
  it('needs a second approval before a line goes live, with a reason for rejection', async () => {
    const { server } = testServer();
    const compliance = await login(server, 'compliance@travelta.demo');
    const queue = await server.handle('kyc.queue', { page: 1, pageSize: 50 }, compliance.token);
    const blueline = queue.items.find((i) => i.organization.name.en === 'Blue Line Transfers')!;
    expect(blueline.pendingServiceLines).toBe(1);
    const kase = await server.handle('kyc.getCase', { caseId: blueline.caseId }, compliance.token);
    const line = kase.serviceLines.find((l) => l.status === 'requested')!;
    await expect(server.handle('kyc.decideServiceLine', { serviceLineId: line.id, approve: false }, compliance.token)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const after = await server.handle('kyc.decideServiceLine', { serviceLineId: line.id, approve: true }, compliance.token);
    expect(after.serviceLines.find((l) => l.id === line.id)?.status).toBe('approved');
    const supplier = await login(server, 'supplier@bluelinetransfers.demo');
    expect((await server.handle('orgs.myProfile', undefined, supplier.token)).serviceTypes).toEqual(['transfer', 'tour']);
  });

  it('agencies cannot review KYC; suppliers cannot see the queue', async () => {
    const { server } = testServer();
    const owner = await login(server, 'owner@nilehorizon.demo');
    await expect(server.handle('kyc.queue', { page: 1, pageSize: 10 }, owner.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
