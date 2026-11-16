'use client';

import { useQuery } from '@tanstack/react-query';
import { SERVICE_TYPES, type ServiceType } from '@travelta/contracts';
import type { ActivityDto, CrmEntityRef, LeadEntity, RequestCard } from '@travelta/schemas';
import { ApiClientError } from '@travelta/api-client';
import { CalendarClock, MessageSquareText, Send } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { useDemoToday } from '@/features/demo/hooks';
import { useAction } from '@/lib/mutations';
import { useCan } from '@/lib/session';
import { addDays } from '@travelta/shared';

export const CRM_KEYS = [['crm'], ['customers'], ['cart'], ['bookings']] as const;
export const SOURCES = ['walk_in', 'phone', 'whatsapp', 'website', 'referral', 'social', 'storefront'] as const;
export const STAGES = ['pending', 'price_quotation', 'negotiation', 'won', 'lost'] as const;

export function useCrmUsers() {
  const api = useApi();
  return useQuery({ queryKey: ['crm', 'users'], queryFn: () => api.call('crm.users', undefined), staleTime: 300_000 });
}

export function useDateTime() {
  const format = useFormatter();
  return (iso: string) => format.dateTime(new Date(iso), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const errorsOf = (e: unknown) => (e instanceof ApiClientError ? e.fieldErrors() : {});

export function LeadDialog({ lead, onClose }: { lead: LeadEntity | null; onClose: () => void }) {
  const t = useTranslations('crm');
  const api = useApi();
  const users = useCrmUsers();
  const manageAll = useCan('crm.manage_all');
  const [v, setV] = useState({ name: lead?.name ?? '', email: lead?.email ?? '', phone: lead?.phone ?? '', source: lead?.source ?? 'walk_in', ownerUserId: lead?.ownerUserId ?? '', notes: lead?.notes ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => api.call('crm.leads.save', { id: lead?.id, ...v, ownerUserId: v.ownerUserId || undefined }), { success: t('leadSaved'), invalidate: CRM_KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={lead ? t('editLead') : t('newLead')}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(errorsOf(e)) })} loading={save.isPending} data-testid="lead-save">{t('save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2" data-testid="lead-form">
        <Field label={t('name')} required error={errors.name} className="sm:col-span-2"><Input name="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label={t('email')} error={errors.email}><Input name="email" type="email" dir="ltr" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label={t('phone')} error={errors.phone}><Input name="phone" dir="ltr" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
        <Field label={t('source')}><Select name="source" value={v.source} onChange={(e) => setV({ ...v, source: e.target.value as typeof v.source })}>{SOURCES.map((s) => <option key={s} value={s}>{t(`source_${s}`)}</option>)}</Select></Field>
        {manageAll && <Field label={t('owner')}><Select name="owner" value={v.ownerUserId} onChange={(e) => setV({ ...v, ownerUserId: e.target.value })}><option value="">{t('me')}</option>{(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
        <Field label={t('notes')} optional className="sm:col-span-2"><Textarea name="notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

export function RequestDialog({ request, party, onClose, onSaved }: { request: RequestCard | null; party?: { leadId?: string; customerId?: string }; onClose: () => void; onSaved?: (r: RequestCard) => void }) {
  const t = useTranslations('crm');
  const te = useTranslations('enums');
  const api = useApi();
  const today = useDemoToday();
  const users = useCrmUsers();
  const manageAll = useCan('crm.manage_all');
  const leads = useQuery({ queryKey: ['crm', 'leads', 'all'], queryFn: () => api.call('crm.leads.list', { page: 1, pageSize: 100 }), enabled: !request && !party });
  const customers = useQuery({ queryKey: ['customers', 'all'], queryFn: () => api.call('customers.list', { page: 1, pageSize: 100 }), enabled: !request && !party });
  const [v, setV] = useState({
    party: request ? (request.customerId ? `c:${request.customerId}` : `l:${request.leadId}`) : party?.customerId ? `c:${party.customerId}` : party?.leadId ? `l:${party.leadId}` : '',
    title: request?.title ?? '', serviceType: (request?.serviceType ?? 'hotel') as ServiceType, destination: request?.destination ?? '',
    from: request?.from ?? addDays(today, 21), to: request?.to ?? addDays(today, 24), adults: String(request?.adults ?? 2), children: String(request?.children ?? 0),
    priority: request?.priority ?? 'medium', expected: request ? String(request.expectedRevenueMinor / 100) : '', assigneeUserId: request?.assigneeUserId ?? '', notes: request?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => api.call('crm.requests.save', {
    id: request?.id, leadId: v.party.startsWith('l:') ? v.party.slice(2) : null, customerId: v.party.startsWith('c:') ? v.party.slice(2) : null,
    title: v.title, serviceType: v.serviceType, destination: v.destination, from: v.from, to: v.to || null, adults: Number(v.adults || 0), children: Number(v.children || 0),
    priority: v.priority, expectedRevenueMinor: Math.round(Number(v.expected || 0) * 100), assigneeUserId: v.assigneeUserId || undefined, notes: v.notes,
  }), { success: t('requestSaved'), invalidate: CRM_KEYS, onSuccess: (r) => { onSaved?.(r); onClose(); } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={request ? t('editRequest') : t('newRequest')} size="lg"
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate(undefined, { onError: (e) => setErrors(errorsOf(e)) })} loading={save.isPending} data-testid="request-save">{t('save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2" data-testid="request-form">
        {!request && !party && (
          <Field label={t('leadOrCustomer')} required error={errors.customerId} className="sm:col-span-2">
            <Select name="party" value={v.party} onChange={(e) => setV({ ...v, party: e.target.value })}>
              <option value="">{t('choose')}</option>
              <optgroup label={t('leads')}>{(leads.data?.items ?? []).filter((l) => l.status !== 'lost' && l.status !== 'converted').map((l) => <option key={l.id} value={`l:${l.id}`}>{l.name}</option>)}</optgroup>
              <optgroup label={t('customers')}>{(customers.data?.items ?? []).map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}</optgroup>
            </Select>
          </Field>
        )}
        <Field label={t('title')} required error={errors.title} className="sm:col-span-2"><Input name="title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
        <Field label={t('service')}><Select name="serviceType" value={v.serviceType} onChange={(e) => setV({ ...v, serviceType: e.target.value as ServiceType })}>{SERVICE_TYPES.map((s) => <option key={s} value={s}>{te(`serviceType.${s}`)}</option>)}</Select></Field>
        <Field label={t('destination')}><Input name="destination" value={v.destination} onChange={(e) => setV({ ...v, destination: e.target.value })} /></Field>
        <Field label={t('from')} error={errors.from}><Input type="date" name="from" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} /></Field>
        <Field label={t('to')} optional error={errors.to}><Input type="date" name="to" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} /></Field>
        <Field label={t('adults')} error={errors.adults}><Input type="number" min={1} name="adults" value={v.adults} onChange={(e) => setV({ ...v, adults: e.target.value })} /></Field>
        <Field label={t('children')}><Input type="number" min={0} name="children" value={v.children} onChange={(e) => setV({ ...v, children: e.target.value })} /></Field>
        <Field label={t('priority')}><Select name="priority" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value as typeof v.priority })}>{(['low', 'medium', 'high'] as const).map((p) => <option key={p} value={p}>{te(`priority.${p}`)}</option>)}</Select></Field>
        <Field label={t('expectedRevenue')} optional><Input type="number" min={0} name="expected" value={v.expected} onChange={(e) => setV({ ...v, expected: e.target.value })} /></Field>
        {manageAll && <Field label={t('assignee')}><Select name="assignee" value={v.assigneeUserId} onChange={(e) => setV({ ...v, assigneeUserId: e.target.value })}><option value="">{t('me')}</option>{(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
        <Field label={t('notes')} optional className="sm:col-span-2"><Textarea name="notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

export function FollowUpDialog({ entity, onClose }: { entity: CrmEntityRef; onClose: () => void }) {
  const t = useTranslations('crm');
  const api = useApi();
  const today = useDemoToday();
  const users = useCrmUsers();
  const manageAll = useCan('crm.manage_all');
  const [v, setV] = useState({ type: 'call' as 'call' | 'whatsapp' | 'email' | 'meeting', date: addDays(today, 1), time: '10:00', note: '', assigneeUserId: '' });
  const save = useAction(() => api.call('crm.followUps.save', { entity, type: v.type, dueAt: new Date(`${v.date}T${v.time}:00`).toISOString(), note: v.note, assigneeUserId: v.assigneeUserId || undefined }), { success: t('followUpSaved'), invalidate: CRM_KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('scheduleFollowUp')}
      footer={<><Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button onClick={() => save.mutate()} loading={save.isPending} data-testid="followup-save">{t('save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3" data-testid="followup-form">
        <Field label={t('type')}><Select name="type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as typeof v.type })}>{(['call', 'whatsapp', 'email', 'meeting'] as const).map((x) => <option key={x} value={x}>{t(`fu_${x}`)}</option>)}</Select></Field>
        <Field label={t('date')}><Input type="date" name="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        <Field label={t('time')}><Input type="time" name="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} /></Field>
        {manageAll && <Field label={t('assignee')} className="sm:col-span-3"><Select name="assignee" value={v.assigneeUserId} onChange={(e) => setV({ ...v, assigneeUserId: e.target.value })}><option value="">{t('me')}</option>{(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
        <Field label={t('note')} optional className="sm:col-span-3"><Input name="note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

/** Activity timeline with an inline note box. */
export function Timeline({ entity, activities, canNote = true }: { entity: CrmEntityRef; activities: ActivityDto[]; canNote?: boolean }) {
  const t = useTranslations('crm');
  const api = useApi();
  const dt = useDateTime();
  const [text, setText] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const add = useAction(() => api.call('crm.notes.add', { entity, text }), { success: t('noteAdded'), invalidate: CRM_KEYS, onSuccess: () => setText('') });
  return (
    <Card data-testid="timeline">
      <CardHeader title={t('activity')} actions={canNote && <Button size="sm" variant="outline" onClick={() => setFollowUp(true)} data-testid="add-followup"><CalendarClock aria-hidden />{t('followUp')}</Button>} />
      <CardBody className="flex flex-col gap-3">
        {canNote && (
          <div className="flex gap-2">
            <Input name="crmNote" placeholder={t('notePlaceholder')} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('note')} />
            <Button size="icon" variant="outline" onClick={() => add.mutate()} disabled={!text.trim()} loading={add.isPending} aria-label={t('addNote')} data-testid="add-crm-note"><Send aria-hidden /></Button>
          </div>
        )}
        {activities.length === 0 ? <p className="text-sm text-fg-muted">{t('noActivity')}</p> : (
          <ol className="flex flex-col gap-3">
            {activities.map((a) => (
              <li key={a.id} className="flex gap-2.5 text-sm">
                <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0"><p className="text-fg">{a.text}</p><p className="text-xs text-fg-muted">{t(`act_${a.kind}`)} · {a.actorName} · {dt(a.at)}</p></div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
      {followUp && <FollowUpDialog entity={entity} onClose={() => setFollowUp(false)} />}
    </Card>
  );
}
