import { isFollowUpOverdue } from '@travelta/domain';
import type { ActivityEntity, CrmEntityRef } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import { forbidden, invalid, notFound } from '../errors';
import { listPage } from '../query';
import { assertPermission } from '../security';
import { bookingListItem, canSeeBooking } from '../services/booking';
import { getCustomerScoped } from '../services/customers';
import {
  activity, activityDto, canWrite, checkEntity, convertLead, crmCustomerId, crmPrincipal, decideQuotation, followUpDto, leadScoped, moveRequest, requestCard, requestScoped,
  saveLead, saveQuotation, saveRequest, seesAll, sendQuotation, setLeadStatus, teamUsers, winRequest,
} from '../services/crm';
import { dueOf, moneyIn } from '../services/finance/money';
import type { HandlerMap } from './types';

type Ops =
  | 'crm.users' | 'crm.leads.list' | 'crm.leads.save' | 'crm.leads.setStatus' | 'crm.leads.convert'
  | 'crm.requests.list' | 'crm.requests.get' | 'crm.requests.save' | 'crm.requests.move' | 'crm.requests.win'
  | 'crm.quotations.save' | 'crm.quotations.send' | 'crm.quotations.decide'
  | 'crm.followUps.list' | 'crm.followUps.save' | 'crm.followUps.complete' | 'crm.notes.add' | 'customers.get360';

const sameRef = (a: CrmEntityRef, b: CrmEntityRef) => a.kind === b.kind && a.id === b.id;

export const crmHandlers: HandlerMap<Ops> = {
  'crm.users': (ctx) => teamUsers(ctx, crmPrincipal(ctx, ctx.principal)),

  'crm.leads.list': (ctx, query) => {
    const p = crmPrincipal(ctx, ctx.principal);
    const now = ctx.clock.nowIso();
    const rows = ctx.db.filter('leads', (l) => l.tenantId === p.org.id && (seesAll(p) || l.ownerUserId === p.user.id)).map((l) => {
      const next = ctx.db.filter('followUps', (f) => f.entity.kind === 'lead' && f.entity.id === l.id && f.doneAt === null).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
      return {
        ...l, ownerName: ctx.db.get('users', l.ownerUserId)?.name ?? '—',
        openRequests: ctx.db.filter('crmRequests', (r) => r.leadId === l.id && r.stage !== 'won' && r.stage !== 'lost').length, nextFollowUpAt: next?.dueAt ?? null,
      };
    });
    return listPage(rows, query, {
      search: (l) => [l.name, l.email, l.phone, ...l.tags],
      sortable: { name: (l) => l.name, createdAt: (l) => l.createdAt, nextFollowUp: (l) => l.nextFollowUpAt ?? '9999' },
      defaultSort: 'createdAt:desc',
      filters: { status: (l, v) => v.includes(l.status), source: (l, v) => v.includes(l.source), owner: (l, v) => v.includes(l.ownerUserId), overdue: (l, v) => v.includes(String(l.nextFollowUpAt !== null && l.nextFollowUpAt < now)) },
    });
  },
  'crm.leads.save': (ctx, input) => saveLead(ctx, crmPrincipal(ctx, ctx.principal), input),
  'crm.leads.setStatus': (ctx, { id, status, reason }) => setLeadStatus(ctx, crmPrincipal(ctx, ctx.principal), id, status, reason),
  'crm.leads.convert': (ctx, { id, customer }) => {
    const p = crmPrincipal(ctx, ctx.principal);
    if (!p.permissions.has('customers.manage')) throw forbidden('Missing permission: customers.manage');
    const lead = leadScoped(ctx, p, id);
    if (!canWrite(p, lead.ownerUserId)) throw forbidden('You cannot convert this lead');
    return convertLead(ctx, p, lead, customer);
  },

  'crm.requests.list': (ctx, query) => {
    const p = crmPrincipal(ctx, ctx.principal);
    const rows = ctx.db.filter('crmRequests', (r) => r.tenantId === p.org.id && (seesAll(p) || r.assigneeUserId === p.user.id)).map((r) => requestCard(ctx, p, r));
    return listPage(rows, query, {
      search: (r) => [r.ref, r.title, r.partyName, r.destination],
      sortable: { createdAt: (r) => r.createdAt, from: (r) => r.from, expected: (r) => r.expectedRevenueMinor, stageChangedAt: (r) => r.stageChangedAt },
      defaultSort: 'stageChangedAt:desc',
      filters: {
        stage: (r, v) => v.includes(r.stage), priority: (r, v) => v.includes(r.priority), service: (r, v) => v.includes(r.serviceType), assignee: (r, v) => v.includes(r.assigneeUserId),
        customer: (r, v) => r.customerId !== null && v.includes(r.customerId), lead: (r, v) => r.leadId !== null && v.includes(r.leadId),
      },
    });
  },
  'crm.requests.get': (ctx, { id }) => {
    const p = crmPrincipal(ctx, ctx.principal);
    const r = requestScoped(ctx, p, id);
    const ref = { kind: 'request' as const, id: r.id };
    const booking = r.bookingId ? ctx.db.get('bookings', r.bookingId) : undefined;
    return {
      request: requestCard(ctx, p, r), lead: r.leadId ? ctx.db.get('leads', r.leadId) ?? null : null, customer: r.customerId ? ctx.db.get('customers', r.customerId) ?? null : null,
      quotations: ctx.db.filter('quotations', (q) => q.requestId === r.id).sort((a, b) => b.revision - a.revision),
      followUps: ctx.db.filter('followUps', (f) => sameRef(f.entity, ref)).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map((f) => followUpDto(ctx, f)),
      activities: ctx.db.filter('activities', (a) => sameRef(a.entity, ref) || (r.leadId !== null && a.entity.kind === 'lead' && a.entity.id === r.leadId)).sort((a, b) => b.at.localeCompare(a.at)).map((a) => activityDto(ctx, a)),
      booking: booking && canSeeBooking(ctx, p, booking) ? bookingListItem(ctx, p, booking) : null,
    };
  },
  'crm.requests.save': (ctx, input) => {
    const p = crmPrincipal(ctx, ctx.principal);
    return requestCard(ctx, p, saveRequest(ctx, p, input));
  },
  'crm.requests.move': (ctx, { id, stage, reason }) => {
    const p = crmPrincipal(ctx, ctx.principal);
    return requestCard(ctx, p, moveRequest(ctx, p, id, stage, reason));
  },
  'crm.requests.win': (ctx, { id, quotationId }) => {
    const p = crmPrincipal(ctx, ctx.principal);
    if (!p.permissions.has('bookings.create')) throw forbidden('Missing permission: bookings.create');
    return winRequest(ctx, p, id, quotationId);
  },

  'crm.quotations.save': (ctx, input) => saveQuotation(ctx, crmPrincipal(ctx, ctx.principal), input),
  'crm.quotations.send': (ctx, { id, via }) => sendQuotation(ctx, crmPrincipal(ctx, ctx.principal), id, via),
  'crm.quotations.decide': (ctx, { id, decision }) => decideQuotation(ctx, crmPrincipal(ctx, ctx.principal), id, decision),

  'crm.followUps.list': (ctx, query) => {
    const p = crmPrincipal(ctx, ctx.principal);
    const now = ctx.clock.nowIso();
    const rows = ctx.db.filter('followUps', (f) => f.tenantId === p.org.id && (seesAll(p) || f.assigneeUserId === p.user.id)).map((f) => followUpDto(ctx, f));
    return listPage(rows, query, {
      search: (f) => [f.entityLabel, f.note, f.assigneeName],
      sortable: { dueAt: (f) => f.dueAt },
      defaultSort: 'dueAt:asc',
      filters: {
        state: (f, v) => v.some((s) => (s === 'open' ? f.doneAt === null : s === 'done' ? f.doneAt !== null : isFollowUpOverdue(f, now))),
        type: (f, v) => v.includes(f.type), mine: (f, v) => v.includes(String(f.assigneeUserId === p.user.id)),
      },
    });
  },
  'crm.followUps.save': (ctx, input) => {
    const p = crmPrincipal(ctx, ctx.principal);
    if (!p.permissions.has('crm.manage_own') && !p.permissions.has('crm.manage_all')) throw forbidden('Missing permission: crm.manage_own');
    const customerId = checkEntity(ctx, p, input.entity);
    const assigneeUserId = input.assigneeUserId ?? p.user.id;
    if (assigneeUserId !== p.user.id && !seesAll(p)) throw forbidden('Only managers assign to others');
    if (!teamUsers(ctx, p).some((u) => u.id === assigneeUserId)) throw invalid([{ field: 'assigneeUserId', issue: 'validation.invalid_value' }]);
    const now = ctx.clock.nowIso();
    const f = ctx.db.insert('followUps', {
      id: createId('fup', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: p.org.id, entity: input.entity, type: input.type, dueAt: input.dueAt,
      note: input.note, assigneeUserId, doneAt: null, outcome: null,
    });
    activity(ctx, p.org.id, input.entity, 'follow_up', `Follow-up (${input.type}) scheduled${input.note ? `: ${input.note}` : ''}`, customerId);
    return followUpDto(ctx, f);
  },
  'crm.followUps.complete': (ctx, { id, outcome }) => {
    const p = crmPrincipal(ctx, ctx.principal);
    const f = ctx.db.get('followUps', id);
    if (!f || f.tenantId !== p.org.id || !(seesAll(p) || f.assigneeUserId === p.user.id)) throw notFound('Follow-up');
    if (f.doneAt) return followUpDto(ctx, f);
    const now = ctx.clock.nowIso();
    const next = { ...f, doneAt: now, outcome: outcome || null, updatedAt: now, version: f.version + 1 };
    ctx.db.replace('followUps', next);
    activity(ctx, p.org.id, f.entity, 'follow_up', `Follow-up (${f.type}) done${outcome ? `: ${outcome}` : ''}`, crmCustomerId(ctx, f.entity));
    if (f.entity.kind === 'lead') {
      const lead = ctx.db.get('leads', f.entity.id);
      if (lead?.status === 'new') ctx.db.replace('leads', { ...lead, status: 'contacted', updatedAt: now, version: lead.version + 1 });
    }
    return followUpDto(ctx, next);
  },
  'crm.notes.add': (ctx, { entity, text }) => {
    const p = crmPrincipal(ctx, ctx.principal);
    const customerId = checkEntity(ctx, p, entity);
    return activityDto(ctx, activity(ctx, p.org.id, entity, 'note', text, customerId));
  },

  /** Customer 360 (W4): requests, bookings, payments, follow-ups and the activity timeline in one view. */
  'customers.get360': (ctx, { id }) => {
    const p = assertPermission(ctx, 'customers.view');
    const customer = getCustomerScoped(ctx, p, id);
    const crm = p.org.type === 'agency' && p.permissions.has('crm.view');
    const bookings = ctx.db.filter('bookings', (b) => b.customerId === customer.id && canSeeBooking(ctx, p, b)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const leads = crm ? ctx.db.filter('leads', (l) => l.customerId === customer.id && (seesAll(p) || l.ownerUserId === p.user.id)) : [];
    const requests = crm ? ctx.db.filter('crmRequests', (r) => (r.customerId === customer.id || (r.leadId !== null && leads.some((l) => l.id === r.leadId))) && (seesAll(p) || r.assigneeUserId === p.user.id)) : [];
    const refs: CrmEntityRef[] = [{ kind: 'customer', id: customer.id }, ...leads.map((l) => ({ kind: 'lead' as const, id: l.id })), ...requests.map((r) => ({ kind: 'request' as const, id: r.id }))];
    const related = (a: { entity: CrmEntityRef; customerId?: string | null }) => refs.some((r) => sameRef(r, a.entity)) || a.customerId === customer.id;
    const active = bookings.filter((b) => b.status !== 'cancelled');
    const money = bookings.reduce((acc, b) => {
      const m = moneyIn(ctx.db, b.id);
      return { due: acc.due + dueOf(ctx.db, b), paid: acc.paid + m.paid - m.refunded };
    }, { due: 0, paid: 0 });
    const payments = ctx.db.filter('payments', (x) => x.bookingId !== null && bookings.some((b) => b.id === x.bookingId) && x.status === 'succeeded')
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .map((x) => ({ ...x, bookingRef: ctx.db.get('bookings', x.bookingId!)?.ref ?? null, customerName: customer.name, accountNames: x.allocations.map((a) => ctx.db.get('financialAccounts', a.financialAccountId)?.name ?? '—'), recordedByName: x.recordedByUserId ? ctx.db.get('users', x.recordedByUserId)?.name ?? null : null }));
    const activities: ActivityEntity[] = crm ? ctx.db.filter('activities', (a) => related(a)) : [];
    for (const b of bookings) {
      activities.push({ id: `bk-${b.id}`, createdAt: b.createdAt, updatedAt: b.createdAt, version: 1, tenantId: b.tenantId, entity: { kind: 'customer', id: customer.id }, customerId: customer.id, kind: 'booking', text: `Booking ${b.ref} · ${b.status}`, actorUserId: b.createdByUserId, at: b.createdAt });
    }
    return {
      customer, leads, requests: requests.map((r) => requestCard(ctx, p, r)), bookings: bookings.map((b) => bookingListItem(ctx, p, b)), payments,
      followUps: crm ? ctx.db.filter('followUps', (f) => refs.some((r) => sameRef(r, f.entity))).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map((f) => followUpDto(ctx, f)) : [],
      activities: activities.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100).map((a) => activityDto(ctx, a)),
      totals: {
        bookedMinor: active.reduce((s, b) => s + b.totals.sellMinor, 0), paidMinor: money.paid, outstandingMinor: Math.max(0, money.due - money.paid),
        currency: bookings[0]?.currency ?? ctx.db.get('organizations', customer.tenantId)?.baseCurrency ?? 'EGP', bookings: active.length, openRequests: requests.filter((r) => r.stage !== 'won' && r.stage !== 'lost').length,
      },
    };
  },
};


