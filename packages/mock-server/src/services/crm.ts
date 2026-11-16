import { checkRequestMove, documentNumber, isFollowUpOverdue, REQUEST_MOVES } from '@travelta/domain';
import type {
  ActivityDto, ActivityEntity, BookingEntity, CrmEntityRef, CrmRequestEntity, CustomerEntity, FollowUpEntity, FollowUpListItem, LeadEntity, QuotationEntity, RequestCard,
} from '@travelta/schemas';
import { leadInputSchema, quotationInputSchema, requestInputSchema, type LeadInput, type QuotationInput, type RequestInput } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../context';
import { ApiException, forbidden, invalid, notFound } from '../errors';
import type { Principal } from '../security';
import { audit } from './audit';
import { addManualItem, cartViewer, loadCart, priceManual } from './cart';
import { saveCustomer } from './customers';
import { quotationSent } from './notifications/events';

// ---- Scope (CRM-4) ---------------------------------------------------------------------------------------------------
/** Agency staff only. Sales agents see their own leads and requests; `crm.manage_all` sees everyone's. */
export function crmPrincipal(ctx: RequestContext, p: Principal | null): Principal {
  if (!p || p.user.userType !== 'staff' || p.org.type !== 'agency' || !p.permissions.has('crm.view')) throw forbidden('CRM is available to agency staff');
  return p;
}
export const seesAll = (p: Principal) => p.permissions.has('crm.manage_all');
export const canWrite = (p: Principal, ownerId: string) => p.permissions.has('crm.manage_all') || (p.permissions.has('crm.manage_own') && ownerId === p.user.id);

function visibleLead(p: Principal, l: LeadEntity) { return l.tenantId === p.org.id && (seesAll(p) || l.ownerUserId === p.user.id); }
function visibleRequest(p: Principal, r: CrmRequestEntity) { return r.tenantId === p.org.id && (seesAll(p) || r.assigneeUserId === p.user.id); }

export function leadScoped(ctx: RequestContext, p: Principal, id: string): LeadEntity {
  const l = ctx.db.get('leads', id);
  if (!l || !visibleLead(p, l)) throw notFound('Lead');
  return l;
}
export function requestScoped(ctx: RequestContext, p: Principal, id: string): CrmRequestEntity {
  const r = ctx.db.get('crmRequests', id);
  if (!r || !visibleRequest(p, r)) throw notFound('Request');
  return r;
}

/** Team members of the agency who can own leads and requests. */
export function teamUsers(ctx: RequestContext, p: Principal) {
  return ctx.db.filter('memberships', (m) => m.tenantId === p.org.id && m.status === 'active')
    .map((m) => ctx.db.get('users', m.userId)).filter((u): u is NonNullable<typeof u> => !!u && u.status === 'active')
    .map((u) => ({ id: u.id, name: u.name }));
}
function assignee(ctx: RequestContext, p: Principal, requested: string | undefined, current?: string): string {
  if (!requested || requested === current) return current ?? p.user.id;
  if (!seesAll(p)) throw forbidden('Only managers assign to others');
  if (!teamUsers(ctx, p).some((u) => u.id === requested)) throw invalid([{ field: 'assigneeUserId', issue: 'validation.invalid_value' }]);
  return requested;
}

// ---- Activity timeline -------------------------------------------------------------------------------------------------
export function activity(ctx: RequestContext, tenantId: string, entity: CrmEntityRef, kind: ActivityEntity['kind'], text: string, customerId: string | null = null): ActivityEntity {
  const now = ctx.clock.nowIso();
  return ctx.db.insert('activities', {
    id: createId('act', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId, entity, customerId, kind, text: text.slice(0, 1000), actorUserId: ctx.principal?.user.id ?? null, at: now,
  });
}
export const activityDto = (ctx: RequestContext, a: ActivityEntity): ActivityDto => ({ ...a, actorName: a.actorUserId ? ctx.db.get('users', a.actorUserId)?.name ?? '—' : 'System' });

const customerOfRequest = (r: CrmRequestEntity, ctx: RequestContext) => r.customerId ?? (r.leadId ? ctx.db.get('leads', r.leadId)?.customerId ?? null : null);

// ---- Leads -------------------------------------------------------------------------------------------------------------
export function saveLead(ctx: RequestContext, p: Principal, raw: LeadInput): LeadEntity {
  const input = leadInputSchema.parse(raw);
  const now = ctx.clock.nowIso();
  if (input.id) {
    const prev = leadScoped(ctx, p, input.id);
    if (!canWrite(p, prev.ownerUserId)) throw forbidden('You cannot edit this lead');
    const next: LeadEntity = { ...prev, name: input.name, email: input.email, phone: input.phone, source: input.source, tags: input.tags, notes: input.notes, ownerUserId: assignee(ctx, p, input.ownerUserId, prev.ownerUserId), updatedAt: now, version: prev.version + 1 };
    ctx.db.replace('leads', next);
    if (next.ownerUserId !== prev.ownerUserId) activity(ctx, p.org.id, { kind: 'lead', id: prev.id }, 'assigned', `Owner → ${ctx.db.get('users', next.ownerUserId)?.name}`, prev.customerId);
    return next;
  }
  if (!p.permissions.has('crm.manage_own') && !p.permissions.has('crm.manage_all')) throw forbidden('Missing permission: crm.manage_own');
  const lead = ctx.db.insert('leads', {
    id: createId('lead', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: p.org.id, name: input.name, email: input.email, phone: input.phone,
    source: input.source, ownerUserId: assignee(ctx, p, input.ownerUserId), status: 'new', customerId: null, lostReason: null, tags: input.tags, notes: input.notes,
  });
  activity(ctx, p.org.id, { kind: 'lead', id: lead.id }, 'created', `Lead captured (${lead.source})`);
  audit(ctx, { tenantId: p.org.id, action: 'crm.lead_created', entity: 'lead', entityId: lead.id, after: { name: lead.name } });
  return lead;
}

export function setLeadStatus(ctx: RequestContext, p: Principal, id: string, status: 'new' | 'contacted' | 'qualified' | 'lost', reason?: string): LeadEntity {
  const prev = leadScoped(ctx, p, id);
  if (!canWrite(p, prev.ownerUserId)) throw forbidden('You cannot change this lead');
  if (prev.status === 'converted') throw new ApiException('INVALID_TRANSITION', 'A converted lead is closed');
  if (status === 'lost' && !(reason && reason.trim().length >= 3)) throw invalid([{ field: 'reason', issue: 'validation.reason_required' }]);
  const next: LeadEntity = { ...prev, status, lostReason: status === 'lost' ? reason!.trim() : null, updatedAt: ctx.clock.nowIso(), version: prev.version + 1 };
  ctx.db.replace('leads', next);
  activity(ctx, p.org.id, { kind: 'lead', id }, 'stage', `Status ${prev.status} → ${status}${status === 'lost' ? `: ${reason}` : ''}`, prev.customerId);
  return next;
}

/** CRM-3: a lead becomes a customer (explicitly, or at its first booking). Idempotent. */
export function convertLead(ctx: RequestContext, p: Principal, lead: LeadEntity, patch?: Partial<Parameters<typeof saveCustomer>[2]>): CustomerEntity {
  if (lead.customerId) return ctx.db.get('customers', lead.customerId)!;
  const existing = lead.email ? ctx.db.find('customers', (c) => c.tenantId === lead.tenantId && c.email === lead.email) : undefined;
  const customer = existing ?? saveCustomer(ctx, p, {
    kind: 'individual', name: lead.name, email: lead.email, phone: lead.phone, nationalityIso2: null, customerType: 'individual', source: lead.source, tags: lead.tags, notes: lead.notes, ...patch,
  }, lead.tenantId);
  ctx.db.replace('leads', { ...ctx.db.get('leads', lead.id)!, customerId: customer.id, status: 'converted', updatedAt: ctx.clock.nowIso(), version: lead.version + 1 });
  for (const r of ctx.db.filter('crmRequests', (x) => x.leadId === lead.id && x.customerId === null)) ctx.db.replace('crmRequests', { ...r, customerId: customer.id });
  for (const a of ctx.db.filter('activities', (x) => (x.entity.kind === 'lead' && x.entity.id === lead.id) || (x.entity.kind === 'request' && ctx.db.get('crmRequests', x.entity.id)?.leadId === lead.id))) {
    ctx.db.replace('activities', { ...a, customerId: customer.id });
  }
  activity(ctx, lead.tenantId, { kind: 'lead', id: lead.id }, 'converted', `Converted to customer ${customer.name}`, customer.id);
  return customer;
}

// ---- Requests ------------------------------------------------------------------------------------------------------------
export function requestCard(ctx: RequestContext, p: Principal, r: CrmRequestEntity): RequestCard {
  const lead = r.leadId ? ctx.db.get('leads', r.leadId) : undefined;
  const customer = r.customerId ? ctx.db.get('customers', r.customerId) : undefined;
  const latest = ctx.db.filter('quotations', (q) => q.requestId === r.id && q.status !== 'superseded').sort((a, b) => b.revision - a.revision)[0];
  const now = ctx.clock.nowIso();
  const write = canWrite(p, r.assigneeUserId);
  return {
    ...r, partyName: customer?.name ?? lead?.name ?? '—', assigneeName: ctx.db.get('users', r.assigneeUserId)?.name ?? '—', quotationTotalMinor: latest?.totalMinor ?? null,
    overdueFollowUps: ctx.db.filter('followUps', (f) => f.entity.kind === 'request' && f.entity.id === r.id && isFollowUpOverdue(f, now)).length,
    moves: write ? [...REQUEST_MOVES[r.stage]] : [], canEdit: write && r.stage !== 'won' && r.stage !== 'lost',
  };
}

export function saveRequest(ctx: RequestContext, p: Principal, raw: RequestInput): CrmRequestEntity {
  const input = requestInputSchema.parse(raw);
  const now = ctx.clock.nowIso();
  if (input.leadId) leadScoped(ctx, p, input.leadId);
  if (input.customerId) {
    const c = ctx.db.get('customers', input.customerId);
    if (!c || c.tenantId !== p.org.id) throw invalid([{ field: 'customerId', issue: 'validation.invalid_value' }]);
  }
  const fields = {
    leadId: input.leadId, customerId: input.customerId ?? (input.leadId ? ctx.db.get('leads', input.leadId)?.customerId ?? null : null), title: input.title, serviceType: input.serviceType,
    destination: input.destination, from: input.from, to: input.to, adults: input.adults, children: input.children, infants: input.infants, priority: input.priority,
    expectedRevenueMinor: input.expectedRevenueMinor, notes: input.notes,
  };
  if (input.id) {
    const prev = requestScoped(ctx, p, input.id);
    if (!canWrite(p, prev.assigneeUserId) || prev.stage === 'won' || prev.stage === 'lost') throw forbidden('This request cannot be edited');
    const next: CrmRequestEntity = { ...prev, ...fields, assigneeUserId: assignee(ctx, p, input.assigneeUserId, prev.assigneeUserId), updatedAt: now, version: prev.version + 1 };
    ctx.db.replace('crmRequests', next);
    if (next.assigneeUserId !== prev.assigneeUserId) activity(ctx, p.org.id, { kind: 'request', id: prev.id }, 'assigned', `Assigned to ${ctx.db.get('users', next.assigneeUserId)?.name}`, customerOfRequest(next, ctx));
    return next;
  }
  if (!p.permissions.has('crm.manage_own') && !p.permissions.has('crm.manage_all')) throw forbidden('Missing permission: crm.manage_own');
  const today = ctx.clock.today();
  const row = ctx.db.insert('crmRequests', {
    id: createId('req', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: p.org.id,
    ref: `REQ-${today.slice(2, 4)}${today.slice(5, 7)}-${String(ctx.db.nextSequence(`request:${p.org.id}`)).padStart(4, '0')}`,
    ...fields, currency: ctx.db.get('organizations', p.org.id)!.baseCurrency, stage: 'pending', stageChangedAt: now, assigneeUserId: assignee(ctx, p, input.assigneeUserId), lostReason: null, bookingId: null,
  });
  if (row.leadId) {
    const lead = ctx.db.get('leads', row.leadId)!;
    if (lead.status === 'new') ctx.db.replace('leads', { ...lead, status: 'qualified', updatedAt: now, version: lead.version + 1 });
  }
  activity(ctx, p.org.id, { kind: 'request', id: row.id }, 'created', `Request ${row.ref} created`, customerOfRequest(row, ctx));
  audit(ctx, { tenantId: p.org.id, action: 'crm.request_created', entity: 'crmRequest', entityId: row.id, after: { ref: row.ref, title: row.title } });
  return row;
}

function setStage(ctx: RequestContext, r: CrmRequestEntity, stage: CrmRequestEntity['stage'], text: string, patch: Partial<CrmRequestEntity> = {}): CrmRequestEntity {
  const now = ctx.clock.nowIso();
  const next = { ...r, ...patch, stage, stageChangedAt: now, updatedAt: now, version: r.version + 1 };
  ctx.db.replace('crmRequests', next);
  activity(ctx, r.tenantId, { kind: 'request', id: r.id }, 'stage', text, customerOfRequest(next, ctx));
  return next;
}

/** CRM-1 manual move (Kanban drag or menu). */
export function moveRequest(ctx: RequestContext, p: Principal, id: string, stage: CrmRequestEntity['stage'], reason?: string): CrmRequestEntity {
  const r = requestScoped(ctx, p, id);
  if (!canWrite(p, r.assigneeUserId)) throw forbidden('You cannot move this request');
  const issue = checkRequestMove(r.stage, stage, reason);
  if (issue === 'invalid_move') throw new ApiException('INVALID_TRANSITION', `A request cannot move from ${r.stage} to ${stage}`);
  if (issue === 'use_win') throw new ApiException('INVALID_TRANSITION', 'Win the request from an accepted quotation');
  if (issue === 'reason_required') throw invalid([{ field: 'reason', issue: 'validation.reason_required' }]);
  return setStage(ctx, r, stage, `Stage ${r.stage} → ${stage}${stage === 'lost' ? `: ${reason}` : ''}`, stage === 'lost' ? { lostReason: reason!.trim() } : {});
}

// ---- Quotations (items priced via the engine) ----------------------------------------------------------------------------
export function saveQuotation(ctx: RequestContext, p: Principal, raw: QuotationInput): QuotationEntity {
  const input = quotationInputSchema.parse(raw);
  const r = requestScoped(ctx, p, input.requestId);
  if (!canWrite(p, r.assigneeUserId) || r.stage === 'won' || r.stage === 'lost') throw forbidden('This request is closed');
  if (input.validUntil < ctx.clock.today()) throw invalid([{ field: 'validUntil', issue: 'validation.date_in_past' }]);
  const viewer = cartViewer(ctx);
  const lines = input.lines.map((item, i) => {
    try {
      const priced = priceManual(ctx, viewer, item);
      const b = priced.breakdown;
      return {
        item, title: { en: item.title, ar: item.title }, supplierName: priced.supplierName, sellMinor: b.totals.customerTotalMinor, taxMinor: b.totals.taxMinor,
        costMinor: priced.ownership === 'agency_own' ? b.totals.netMinor : (b.buyPrices.subAgencyBuyMinor ?? b.buyPrices.agencyBuyMinor),
      };
    } catch (e) {
      if (e instanceof ApiException && e.details) throw new ApiException(e.code, e.message, e.details.map((d) => ({ ...d, field: `lines.${i}.${d.field ?? ''}` })));
      throw e;
    }
  });
  const now = ctx.clock.nowIso();
  const today = ctx.clock.today();
  const previous = ctx.db.filter('quotations', (q) => q.requestId === r.id);
  for (const q of previous.filter((x) => x.status === 'draft' || x.status === 'sent')) ctx.db.replace('quotations', { ...q, status: 'superseded', updatedAt: now, version: q.version + 1 });
  const stored = ctx.db.insert('quotations', {
    id: createId('qt', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: r.tenantId, requestId: r.id,
    number: documentNumber('QT', today, ctx.db.nextSequence(`quotation:${r.tenantId}:${today.slice(0, 4)}`)), revision: previous.length + 1,
    lines, totalMinor: lines.reduce((s, l) => s + l.sellMinor, 0), costMinor: lines.reduce((s, l) => s + l.costMinor, 0), currency: viewer.currency,
    validUntil: input.validUntil, status: 'draft', sentAt: null, sentVia: null, notes: input.notes, createdByUserId: p.user.id,
  });
  activity(ctx, r.tenantId, { kind: 'request', id: r.id }, 'quotation', `Quotation ${stored.number} (v${stored.revision}) prepared`, customerOfRequest(r, ctx));
  if (r.stage === 'pending') setStage(ctx, ctx.db.get('crmRequests', r.id)!, 'price_quotation', 'Stage pending → price_quotation (quotation prepared)');
  return stored;
}

function quotationScoped(ctx: RequestContext, p: Principal, id: string) {
  const q = ctx.db.get('quotations', id);
  if (!q) throw notFound('Quotation');
  const r = requestScoped(ctx, p, q.requestId);
  if (!canWrite(p, r.assigneeUserId)) throw forbidden('You cannot change this quotation');
  return { q, r };
}

/** Simulated send (email / WhatsApp, rendered in the outbox by M19); the request moves into negotiation. */
export function sendQuotation(ctx: RequestContext, p: Principal, id: string, via: 'email' | 'whatsapp'): QuotationEntity {
  const { q, r } = quotationScoped(ctx, p, id);
  if (q.status !== 'draft' && q.status !== 'sent') throw new ApiException('INVALID_TRANSITION', `Quotation is ${q.status}`);
  const now = ctx.clock.nowIso();
  const next: QuotationEntity = { ...q, status: 'sent', sentAt: now, sentVia: via, updatedAt: now, version: q.version + 1 };
  ctx.db.replace('quotations', next);
  activity(ctx, r.tenantId, { kind: 'request', id: r.id }, 'quotation', `Quotation ${q.number} sent by ${via}`, customerOfRequest(r, ctx));
  if (r.stage === 'price_quotation') setStage(ctx, ctx.db.get('crmRequests', r.id)!, 'negotiation', 'Stage price_quotation → negotiation (quotation sent)');
  quotationSent(ctx, next, via);
  return next;
}

export function decideQuotation(ctx: RequestContext, p: Principal, id: string, decision: 'accepted' | 'rejected'): QuotationEntity {
  const { q, r } = quotationScoped(ctx, p, id);
  if (q.status !== 'sent' && q.status !== 'draft') throw new ApiException('INVALID_TRANSITION', `Quotation is ${q.status}`);
  const next: QuotationEntity = { ...q, status: decision, updatedAt: ctx.clock.nowIso(), version: q.version + 1 };
  ctx.db.replace('quotations', next);
  activity(ctx, r.tenantId, { kind: 'request', id: r.id }, 'quotation', `Customer ${decision} quotation ${q.number}`, customerOfRequest(r, ctx));
  return next;
}

/**
 * CRM-2 win: the request becomes `won`, the lead becomes a customer if needed (CRM-3), and every quotation line is put in
 * the user's cart as a manual item — the checkout then opens pre-filled with this customer and links the booking.
 */
export function winRequest(ctx: RequestContext, p: Principal, id: string, quotationId: string): { customerId: string; cartItems: number; requestId: string } {
  const r = requestScoped(ctx, p, id);
  if (!canWrite(p, r.assigneeUserId)) throw forbidden('You cannot win this request');
  if (!REQUEST_MOVES[r.stage].includes('won')) throw new ApiException('INVALID_TRANSITION', 'Only a request in negotiation can be won');
  const q = ctx.db.get('quotations', quotationId);
  if (!q || q.requestId !== r.id || q.status === 'superseded' || q.status === 'rejected') throw invalid([{ field: 'quotationId', issue: 'validation.invalid_value' }]);
  if (q.validUntil < ctx.clock.today()) throw new ApiException('QUOTE_EXPIRED', 'The quotation has expired — prepare a new one');
  let customerId = r.customerId;
  if (!customerId && r.leadId) customerId = convertLead(ctx, p, ctx.db.get('leads', r.leadId)!).id;
  if (!customerId) throw invalid([{ field: 'customerId', issue: 'validation.customer_required' }]);
  const viewer = cartViewer(ctx);
  let cart = loadCart(ctx, viewer);
  for (const line of q.lines) cart = addManualItem(ctx, cart, viewer, line.item);
  if (q.status !== 'accepted') ctx.db.replace('quotations', { ...q, status: 'accepted', updatedAt: ctx.clock.nowIso(), version: q.version + 1 });
  setStage(ctx, ctx.db.get('crmRequests', r.id)!, 'won', `Won with quotation ${q.number} — booking prepared`, { customerId });
  audit(ctx, { tenantId: r.tenantId, action: 'crm.request_won', entity: 'crmRequest', entityId: r.id, after: { quotation: q.number, total: q.totalMinor } });
  return { customerId, cartItems: cart.items.length, requestId: r.id };
}

/** Checkout of a won request links the booking (CRM-2) and closes the lead as converted (CRM-3). */
export function linkRequestBooking(ctx: RequestContext, requestId: string, booking: BookingEntity): void {
  const p = ctx.principal;
  if (!p) return;
  const r = ctx.db.get('crmRequests', requestId);
  if (!r || r.tenantId !== booking.tenantId || r.stage !== 'won' || r.bookingId) return;
  ctx.db.replace('crmRequests', { ...r, bookingId: booking.id, customerId: booking.customerId ?? r.customerId, updatedAt: ctx.clock.nowIso(), version: r.version + 1 });
  if (r.leadId) {
    const lead = ctx.db.get('leads', r.leadId)!;
    if (lead.status !== 'converted') ctx.db.replace('leads', { ...lead, status: 'converted', customerId: lead.customerId ?? booking.customerId, updatedAt: ctx.clock.nowIso(), version: lead.version + 1 });
  }
  activity(ctx, r.tenantId, { kind: 'request', id: r.id }, 'booking', `Booking ${booking.ref} created`, booking.customerId);
}

// ---- Follow-ups ------------------------------------------------------------------------------------------------------------
export function entityLabel(ctx: RequestContext, ref: CrmEntityRef): string {
  if (ref.kind === 'lead') return ctx.db.get('leads', ref.id)?.name ?? '—';
  if (ref.kind === 'request') { const r = ctx.db.get('crmRequests', ref.id); return r ? `${r.ref} · ${r.title}` : '—'; }
  return ctx.db.get('customers', ref.id)?.name ?? '—';
}

export function followUpDto(ctx: RequestContext, f: FollowUpEntity): FollowUpListItem {
  return { ...f, entityLabel: entityLabel(ctx, f.entity), assigneeName: ctx.db.get('users', f.assigneeUserId)?.name ?? '—', overdue: isFollowUpOverdue(f, ctx.clock.nowIso()) };
}

/** The entity a follow-up or note is attached to must be visible to the caller. Returns the related customer. */
export function checkEntity(ctx: RequestContext, p: Principal, ref: CrmEntityRef): string | null {
  if (ref.kind === 'lead') return leadScoped(ctx, p, ref.id).customerId;
  if (ref.kind === 'request') return customerOfRequest(requestScoped(ctx, p, ref.id), ctx);
  const c = ctx.db.get('customers', ref.id);
  if (!c || c.tenantId !== p.org.id) throw notFound('Customer');
  return c.id;
}

export function crmCustomerId(ctx: RequestContext, ref: CrmEntityRef): string | null {
  if (ref.kind === 'customer') return ref.id;
  if (ref.kind === 'lead') return ctx.db.get('leads', ref.id)?.customerId ?? null;
  const r = ctx.db.get('crmRequests', ref.id);
  return r ? customerOfRequest(r, ctx) : null;
}
