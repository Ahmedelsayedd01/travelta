import type { Permission } from '@travelta/contracts';
import type { BookingEntity, NotificationTopic, OutboxMessageEntity } from '@travelta/schemas';
import { addDays, createId, createRng, hashString } from '@travelta/shared';
import type { DemoClock } from '../../clock';
import type { Database } from '../../db/database';
import { fill, TEMPLATES } from './templates';

/** Anything with a database and a clock can notify (request contexts and clock jobs alike). */
export interface Sink { db: Database; clock: DemoClock }
type Var = string | number | { en: string; ar: string };
export type Vars = Record<string, Var>;

/** Reminders with a dedupe key get ids derived from it, so clock jobs stay deterministic (identical reset datasets). */
const idFor = (s: Sink, prefix: string, key: string | null | undefined) => (key ? createId(prefix, s.clock.now(), createRng(hashString(key)).next) : createId(prefix, s.clock.now()));

/** Arabic messages isolate every inserted value (FSI…PDI) so Latin refs and numbers keep their order inside RTL text. */
const isolate = (v: string | number, locale: 'en' | 'ar') => (locale === 'ar' && String(v) !== '' ? `\u2068${v}\u2069` : v);
const pick = (vars: Vars, locale: 'en' | 'ar') => Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, isolate(typeof v === 'object' ? v[locale] : v, locale)]));
const render = (topic: NotificationTopic, vars: Vars) => {
  const t = TEMPLATES[topic];
  return {
    title: { en: fill(t.title.en, pick(vars, 'en')), ar: fill(t.title.ar, pick(vars, 'ar')) },
    body: { en: fill(t.body.en, pick(vars, 'en')), ar: fill(t.body.ar, pick(vars, 'ar')) },
    severity: t.severity,
  };
};

/** Locale-aware money and date values for templates. */
export const money = (minor: number, currency: string): Var => ({
  en: new Intl.NumberFormat('en-EG', { style: 'currency', currency }).format(minor / 100),
  ar: new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(minor / 100),
});
export const day = (iso: string): Var => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return { en: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }), ar: d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) };
};

/** Users who should hear about an org event: active members, optionally only those holding a permission. */
export function orgRecipients(db: Database, orgId: string, permission?: Permission): string[] {
  return db.filter('memberships', (m) => m.tenantId === orgId && m.status === 'active').filter((m) => {
    if (!permission) return true;
    return db.get('roles', m.roleId)?.permissions.includes(permission) ?? false;
  }).map((m) => m.userId);
}

/** In-app notification to users (deduplicated per user by `dedupeKey`). */
export function notify(s: Sink, n: { topic: NotificationTopic; users: string[]; orgId: string | null; vars: Vars; link?: string | null; dedupeKey?: string }): number {
  const r = render(n.topic, n.vars);
  const now = s.clock.nowIso();
  let count = 0;
  for (const userId of new Set(n.users)) {
    if (n.dedupeKey && s.db.find('notifications', (x) => x.userId === userId && x.dedupeKey === n.dedupeKey)) continue;
    s.db.insert('notifications', {
      id: idFor(s, 'ntf', n.dedupeKey ? `${n.dedupeKey}:${userId}` : null), createdAt: now, updatedAt: now, version: 1, userId, orgId: n.orgId, topic: n.topic, title: r.title, body: r.body,
      link: n.link ?? null, severity: r.severity, readAt: null, at: now, dedupeKey: n.dedupeKey ?? null,
    });
    count++;
  }
  return count;
}

/** Notify every member of an organization (optionally only those with a permission). */
export const notifyOrg = (s: Sink, orgId: string, n: Omit<Parameters<typeof notify>[1], 'users' | 'orgId'> & { permission?: Permission }) =>
  notify(s, { ...n, orgId, users: orgRecipients(s.db, orgId, n.permission) });

/** Simulated email / WhatsApp to an external party; both languages are rendered for preview, `locale` is what was sent. */
export function message(s: Sink, m: {
  tenantId: string; topic: NotificationTopic; to: { name: string; email?: string | null; phone?: string | null }; locale?: 'en' | 'ar'; vars: Vars;
  channels?: ('email' | 'whatsapp')[]; related?: { kind: string; id: string } | null; dedupeKey?: string;
}): OutboxMessageEntity[] {
  const r = render(m.topic, m.vars);
  const now = s.clock.nowIso();
  const out: OutboxMessageEntity[] = [];
  for (const channel of m.channels ?? ['email']) {
    const address = channel === 'email' ? m.to.email : m.to.phone;
    if (!address) continue;
    const key = m.dedupeKey ? `${m.dedupeKey}:${channel}` : null;
    if (key && s.db.find('outboxMessages', (x) => x.dedupeKey === key)) continue;
    out.push(s.db.insert('outboxMessages', {
      id: idFor(s, 'msg', key), createdAt: now, updatedAt: now, version: 1, tenantId: m.tenantId, channel, topic: m.topic, toName: m.to.name, toAddress: address,
      locale: m.locale ?? 'en', subject: r.title, body: r.body, status: 'sent', related: m.related ?? null, at: now, dedupeKey: key,
    }));
  }
  return out;
}

/** The booking's customer as a message recipient (their account locale when they have one). */
export function customerContact(db: Database, b: BookingEntity): { name: string; email: string | null; phone: string | null; locale: 'en' | 'ar' } {
  const c = b.customerId ? db.get('customers', b.customerId) : undefined;
  const user = c?.userId ? db.get('users', c.userId) : undefined;
  return { name: c?.name ?? b.leadTraveller, email: c?.email || null, phone: c?.phone || null, locale: user?.locale ?? (c?.nationalityIso2 === 'EG' || c?.nationalityIso2 === 'SA' ? 'ar' : 'en') };
}

export const bookingLink = (db: Database, b: BookingEntity, audience: 'seller' | 'supplier' | 'customer' | 'platform') => {
  if (audience === 'supplier') return `/supplier/reservations/${b.id}`;
  if (audience === 'platform') return `/admin/bookings/${b.id}`;
  if (audience === 'customer') return `/account/bookings/${b.id}`;
  return db.get('organizations', b.tenantId)?.isPlatformRetail ? `/admin/bookings/${b.id}` : `/agency/bookings/${b.id}`;
};
export const platformOrgId = (db: Database) => db.find('organizations', (o) => o.type === 'platform')!.id;

// ---- Clock-driven reminders (PAY-5, travel, KYC-5, CRM-4) ------------------------------------------------------------------
/**
 * Reminders run with the demo clock: instalments 3 days before and on the due date (customer) and once overdue (seller);
 * upcoming travel 2 days before (customer); KYC documents 30 days before expiry (org); follow-ups due today (assignee).
 * Every reminder has a dedupe key, so moving the clock back and forth never sends twice.
 */
export function runReminderJob(db: Database, clock: DemoClock): boolean {
  const s: Sink = { db, clock };
  const today = clock.today();
  let sent = 0;
  for (const plan of db.all('paymentPlans')) {
    const b = db.get('bookings', plan.bookingId);
    if (!b || b.status === 'cancelled') continue;
    const contact = customerContact(db, b);
    for (const i of plan.installments) {
      if (i.status === 'paid' || i.status === 'cancelled') continue;
      const open = i.amountMinor - i.paidMinor;
      const vars = { name: contact.name, seq: i.seq, amount: money(open, b.currency), ref: b.ref, due: day(i.dueDate), customer: contact.name };
      for (const [when, tag] of [[addDays(i.dueDate, -3), 'd-3'], [i.dueDate, 'd0']] as const) {
        if (today >= when && today <= i.dueDate) {
          sent += message(s, { tenantId: b.tenantId, topic: 'payment.reminder', to: contact, locale: contact.locale, vars, channels: ['email', 'whatsapp'], related: { kind: 'booking', id: b.id }, dedupeKey: `inst:${b.id}:${i.seq}:${tag}` }).length;
        }
      }
      if (i.dueDate < today) {
        sent += notifyOrg(s, b.tenantId, { topic: 'payment.overdue', permission: 'payments.collect', vars, link: bookingLink(db, b, 'seller'), dedupeKey: `overdue:${b.id}:${i.seq}` });
      }
    }
  }
  for (const b of db.filter('bookings', (x) => x.status !== 'cancelled' && x.travelStart > today && x.travelStart <= addDays(today, 2))) {
    const contact = customerContact(db, b);
    const first = db.filter('bookingItems', (i) => i.bookingId === b.id).sort((a, c) => a.seq - c.seq)[0];
    sent += message(s, { tenantId: b.tenantId, topic: 'travel.upcoming', to: contact, locale: contact.locale, vars: { name: contact.name, title: first?.title ?? b.ref, date: day(b.travelStart), ref: b.ref }, channels: ['email', 'whatsapp'], related: { kind: 'booking', id: b.id }, dedupeKey: `travel:${b.id}` }).length;
    const user = b.customerId ? db.get('customers', b.customerId)?.userId : null;
    if (user) sent += notify(s, { topic: 'travel.upcoming', users: [user], orgId: b.tenantId, vars: { name: contact.name, title: first?.title ?? b.ref, date: day(b.travelStart), ref: b.ref }, link: bookingLink(db, b, 'customer'), dedupeKey: `travel:${b.id}` });
  }
  const DOC: Record<string, { en: string; ar: string }> = { commercial_register: { en: 'Commercial register', ar: 'السجل التجاري' }, tax_card: { en: 'Tax card', ar: 'البطاقة الضريبية' }, tourism_license: { en: 'Tourism licence', ar: 'الترخيص السياحي' } };
  for (const d of db.filter('kycDocuments', (x) => x.current && x.status === 'accepted' && x.expiryDate >= today && x.expiryDate <= addDays(today, 30))) {
    sent += notifyOrg(s, d.tenantId, { topic: 'kyc.expiring', permission: 'kyc.view_own', vars: { doc: DOC[d.docType] ?? { en: d.docType, ar: d.docType }, date: day(d.expiryDate) }, link: null, dedupeKey: `kycexp:${d.id}` });
  }
  const FU: Record<string, { en: string; ar: string }> = { call: { en: 'Call', ar: 'مكالمة' }, whatsapp: { en: 'WhatsApp', ar: 'واتساب' }, email: { en: 'Email', ar: 'بريد' }, meeting: { en: 'Meeting', ar: 'اجتماع' } };
  for (const f of db.filter('followUps', (x) => x.doneAt === null && x.dueAt.slice(0, 10) <= today)) {
    const what = f.entity.kind === 'request' ? db.get('crmRequests', f.entity.id)?.title : f.entity.kind === 'lead' ? db.get('leads', f.entity.id)?.name : db.get('customers', f.entity.id)?.name;
    const link = f.entity.kind === 'request' ? `/agency/crm/requests/${f.entity.id}` : f.entity.kind === 'customer' ? `/agency/customers/${f.entity.id}` : '/agency/crm/leads';
    sent += notify(s, { topic: 'crm.follow_up_due', users: [f.assigneeUserId], orgId: f.tenantId, vars: { what: what ?? '—', type: FU[f.type]!, note: f.note || '—' }, link, dedupeKey: `fu:${f.id}` });
  }
  return sent > 0;
}
