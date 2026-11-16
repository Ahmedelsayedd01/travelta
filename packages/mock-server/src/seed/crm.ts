import { documentNumber } from '@travelta/domain';
import type {
  ActivityEntity, AgencySupplierEntity, CrmRequestEntity, CustomerEntity, FollowUpEntity, LeadEntity, QuotationEntity, QuotationLine, UserEntity,
} from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import type { SeedContext } from './context';

type Stage = CrmRequestEntity['stage'];
type ManualItemInput = QuotationLine['item'];

/**
 * Nile Horizon's pipeline (W4) — fictional leads and requests in every stage, with quotations, follow-ups (some overdue,
 * CRM-4) and an activity trail. Quotation lines are manual items on Nile's own suppliers, priced as quoted at the time.
 */
export function seedCrm(s: SeedContext, orgIds: Record<string, string>, users: UserEntity[], customers: CustomerEntity[], agencySuppliers: AgencySupplierEntity[]) {
  const nile = orgIds.nile!;
  const owner = users.find((u) => u.email === 'owner@nilehorizon.demo')!.id;
  const sales = users.find((u) => u.email === 'sales@nilehorizon.demo')!.id;
  const hotelSupplier = agencySuppliers.find((a) => a.tenantId === nile && a.serviceTypes.includes('hotel'))!;
  const tourSupplier = agencySuppliers.find((a) => a.tenantId === nile && a.serviceTypes.includes('tour'))!;
  const transferSupplier = agencySuppliers.find((a) => a.tenantId === nile && a.serviceTypes.includes('transfer'))!;
  const at = (days: number, hour = 10) => `${addDays(s.today, days)}T${String(hour).padStart(2, '0')}:00:00.000Z`;

  const leads: LeadEntity[] = [];
  const requests: CrmRequestEntity[] = [];
  const quotations: QuotationEntity[] = [];
  const followUps: FollowUpEntity[] = [];
  const activities: ActivityEntity[] = [];
  const sequences: Record<string, number> = {};
  const act = (entity: ActivityEntity['entity'], kind: ActivityEntity['kind'], text: string, when: string, actor: string, customerId: string | null = null) =>
    activities.push({ id: s.id('act'), ...s.stamp(), createdAt: when, updatedAt: when, tenantId: nile, entity, customerId, kind, text, actorUserId: actor, at: when });

  const LEADS: [name: string, email: string, phone: string, source: LeadEntity['source'], ownerId: string, status: LeadEntity['status'], daysAgo: number][] = [
    ['Yasmin Fouad', 'yasmin.fouad@example.com', '+201005550101', 'social', sales, 'qualified', 12],
    ['Hassan Shokry', 'hassan.shokry@example.com', '+201005550102', 'whatsapp', sales, 'contacted', 8],
    ['Nour El-Din Family', '', '+201005550103', 'phone', owner, 'qualified', 20],
    ['Cairo Tech Summit (events)', 'events@cts.example.com', '+20225550104', 'referral', owner, 'new', 2],
    ['Salma Raouf', 'salma.raouf@example.com', '', 'website', sales, 'lost', 30],
  ];
  for (const [name, email, phone, source, ownerUserId, status, daysAgo] of LEADS) {
    const when = at(-daysAgo, 9);
    const lead: LeadEntity = {
      id: s.id('lead'), ...s.stamp(), createdAt: when, updatedAt: when, tenantId: nile, name, email, phone, source, ownerUserId, status, customerId: null,
      lostReason: status === 'lost' ? 'Booked with another agency' : null, tags: source === 'referral' ? ['corporate'] : [], notes: '',
    };
    leads.push(lead);
    act({ kind: 'lead', id: lead.id }, 'created', `Lead captured (${source})`, when, ownerUserId);
  }
  const omar = customers.find((c) => c.tenantId === nile && c.name === 'Omar Hassan')!;
  const mona = customers.find((c) => c.tenantId === nile && c.name === 'Mona Adel')!;
  const delta = customers.find((c) => c.tenantId === nile && c.name === 'Delta Petroleum Co.')!;

  const hotel = (title: string, from: string, nights: number, cost: number, adults = 2): ManualItemInput => ({
    serviceType: 'hotel', supplier: { kind: 'own', id: hotelSupplier.id }, title, destinationId: null, from, to: addDays(from, nights),
    occupancy: { adults, children: 0, infants: 0, rooms: [] }, netMinor: cost * 100, netCurrency: 'EGP', markup: { mode: 'percent', value: 15 }, taxProfileId: null,
    policy: { nonRefundable: false, rules: [{ daysBefore: 7, feeType: 'percent', value: 50 }] }, details: {}, customerType: 'individual', channel: 'b2c',
  });
  const service = (serviceType: 'tour' | 'transfer', supplierId: string, title: string, from: string, cost: number, adults = 2): ManualItemInput => ({
    serviceType, supplier: { kind: 'own', id: supplierId }, title, destinationId: null, from, to: null, occupancy: { adults, children: 0, infants: 0, rooms: [] },
    netMinor: cost * 100, netCurrency: 'EGP', markup: { mode: 'percent', value: 20 }, taxProfileId: null,
    policy: { nonRefundable: false, rules: [{ daysBefore: 3, feeType: 'percent', value: 100 }] }, details: {}, customerType: 'individual', channel: 'b2c',
  });

  const REQUESTS: { title: string; service: CrmRequestEntity['serviceType']; dest: string; from: number; nights: number | null; adults: number; children?: number; priority: CrmRequestEntity['priority']; expected: number; stage: Stage; party: { lead?: number; customer?: CustomerEntity }; assignee: string; ageDays: number; lines?: ManualItemInput[]; quoteStatus?: QuotationEntity['status']; lost?: string }[] = [
    { title: 'Honeymoon — Luxor & Aswan', service: 'hotel', dest: 'Luxor', from: 30, nights: 5, adults: 2, priority: 'high', expected: 60_000, stage: 'negotiation', party: { lead: 0 }, assignee: sales, ageDays: 10,
      lines: [hotel('Golden Pyramids — Nile view suite, 5 nights', addDays(s.today, 30), 5, 38_000), service('tour', tourSupplier.id, 'Aswan felucca & Philae temple tour', addDays(s.today, 33), 4_200)], quoteStatus: 'sent' },
    { title: 'Family Sahel weekend', service: 'hotel', dest: 'North Coast', from: 18, nights: 3, adults: 2, children: 2, priority: 'medium', expected: 24_000, stage: 'price_quotation', party: { lead: 1 }, assignee: sales, ageDays: 6,
      lines: [hotel('Golden Pyramids — family room, 3 nights', addDays(s.today, 18), 3, 19_500, 2)], quoteStatus: 'draft' },
    { title: 'Umrah — 10 nights, 5 pilgrims', service: 'umrah', dest: 'Makkah & Madinah', from: 45, nights: 10, adults: 5, priority: 'high', expected: 210_000, stage: 'pending', party: { lead: 2 }, assignee: owner, ageDays: 3 },
    { title: 'Conference delegates — airport transfers', service: 'transfer', dest: 'Cairo', from: 25, nights: null, adults: 40, priority: 'medium', expected: 35_000, stage: 'pending', party: { lead: 3 }, assignee: owner, ageDays: 1 },
    { title: 'Anniversary stay — Giza', service: 'hotel', dest: 'Giza', from: 12, nights: 2, adults: 2, priority: 'low', expected: 14_000, stage: 'negotiation', party: { customer: mona }, assignee: owner, ageDays: 5,
      lines: [hotel('Golden Pyramids — pyramid view, 2 nights', addDays(s.today, 12), 2, 11_000), service('transfer', transferSupplier.id, 'Private airport transfer (round trip)', addDays(s.today, 12), 1_400)], quoteStatus: 'accepted' },
    { title: 'Corporate retreat — Hurghada', service: 'hotel', dest: 'Hurghada', from: 60, nights: 3, adults: 20, priority: 'high', expected: 320_000, stage: 'price_quotation', party: { customer: delta }, assignee: owner, ageDays: 4 },
    { title: 'Nile cruise for parents', service: 'tour', dest: 'Aswan', from: 40, nights: null, adults: 2, priority: 'medium', expected: 18_000, stage: 'lost', party: { customer: omar }, assignee: sales, ageDays: 25, lost: 'Customer postponed travel to next year' },
    { title: 'Weekend escape — lead lost', service: 'hotel', dest: 'Ain Sokhna', from: 9, nights: 2, adults: 2, priority: 'low', expected: 9_000, stage: 'lost', party: { lead: 4 }, assignee: sales, ageDays: 29, lost: 'Booked with another agency' },
  ];
  const year = s.today.slice(0, 4);
  REQUESTS.forEach((r, i) => {
    const created = at(-r.ageDays, 11);
    const lead = r.party.lead !== undefined ? leads[r.party.lead]! : null;
    const seq = (sequences[`request:${nile}`] = (sequences[`request:${nile}`] ?? 0) + 1);
    const row: CrmRequestEntity = {
      id: s.id('req'), ...s.stamp(), createdAt: created, updatedAt: created, tenantId: nile,
      ref: `REQ-${s.today.slice(2, 4)}${s.today.slice(5, 7)}-${String(seq).padStart(4, '0')}`, leadId: lead?.id ?? null, customerId: r.party.customer?.id ?? null,
      title: r.title, serviceType: r.service, destination: r.dest, from: addDays(s.today, r.from), to: r.nights ? addDays(s.today, r.from + r.nights) : null,
      adults: r.adults, children: r.children ?? 0, infants: 0, priority: r.priority, expectedRevenueMinor: r.expected * 100, currency: 'EGP', stage: r.stage,
      stageChangedAt: at(-Math.max(0, r.ageDays - 2), 15), assigneeUserId: r.assignee, lostReason: r.lost ?? null, bookingId: null, notes: '',
    };
    requests.push(row);
    const ref = { kind: 'request' as const, id: row.id };
    act(ref, 'created', `Request ${row.ref} created`, created, r.assignee, row.customerId);
    if (r.lines) {
      const lines = r.lines.map((item) => {
        const markup = item.markup.mode === 'percent' ? Math.round(item.netMinor * item.markup.value / 100) : Math.round(item.markup.value * 100);
        return { item, title: { en: item.title, ar: item.title }, supplierName: agencySuppliers.find((a) => a.id === (item.supplier as { id: string }).id)!.name, sellMinor: item.netMinor + markup, taxMinor: 0, costMinor: item.netMinor };
      });
      const qSeq = (sequences[`quotation:${nile}:${year}`] = (sequences[`quotation:${nile}:${year}`] ?? 0) + 1);
      const when = at(-Math.max(0, r.ageDays - 1), 13);
      quotations.push({
        id: s.id('qt'), ...s.stamp(), createdAt: when, updatedAt: when, tenantId: nile, requestId: row.id, number: documentNumber('QT', s.today, qSeq), revision: 1, lines,
        totalMinor: lines.reduce((a, l) => a + l.sellMinor, 0), costMinor: lines.reduce((a, l) => a + l.costMinor, 0), currency: 'EGP', validUntil: addDays(s.today, 10),
        status: r.quoteStatus ?? 'draft', sentAt: r.quoteStatus === 'draft' ? null : when, sentVia: r.quoteStatus === 'draft' ? null : i % 2 ? 'email' : 'whatsapp', notes: 'Prices valid for 10 days, subject to availability.', createdByUserId: r.assignee,
      });
      act(ref, 'quotation', `Quotation ${documentNumber('QT', s.today, qSeq)} (v1) prepared`, when, r.assignee, row.customerId);
    }
    if (r.stage !== 'pending') act(ref, 'stage', `Stage → ${r.stage}${r.lost ? `: ${r.lost}` : ''}`, row.stageChangedAt, r.assignee, row.customerId);
  });

  const FOLLOW: [entity: ActivityEntity['entity'], type: FollowUpEntity['type'], dueDays: number, note: string, assignee: string, done: boolean][] = [
    [{ kind: 'request', id: requests[0]!.id }, 'whatsapp', -2, 'Check if they reviewed the honeymoon quotation', sales, false],
    [{ kind: 'request', id: requests[1]!.id }, 'call', 1, 'Confirm children ages and room type', sales, false],
    [{ kind: 'lead', id: leads[1]!.id }, 'call', -1, 'Second call — interested in Sharm packages', sales, false],
    [{ kind: 'request', id: requests[2]!.id }, 'meeting', 3, 'Office meeting to choose Makkah hotel distance', owner, false],
    [{ kind: 'request', id: requests[5]!.id }, 'email', 2, 'Send rooming list template to HR', owner, false],
    [{ kind: 'customer', id: mona.id }, 'call', -6, 'Welcome call after last trip', owner, true],
    [{ kind: 'lead', id: leads[3]!.id }, 'email', 0, 'Introduce corporate rates', owner, false],
  ];
  for (const [entity, type, dueDays, note, assigneeUserId, done] of FOLLOW) {
    followUps.push({
      id: s.id('fup'), ...s.stamp(), tenantId: nile, entity, type, dueAt: at(dueDays, 14), note, assigneeUserId, doneAt: done ? at(dueDays, 15) : null, outcome: done ? 'Happy with the service — wants Umrah offers' : null,
    });
  }
  return { leads, requests, quotations, followUps, activities, sequences };
}
