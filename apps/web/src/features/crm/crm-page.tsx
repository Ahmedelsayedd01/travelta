'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { FollowUpListItem, LeadListItem, RequestCard } from '@travelta/schemas';
import { AlarmClock, CheckCircle2, ClipboardList, GripVertical, PencilLine, Plus, UserPlus, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/api-provider';
import { SERVICE_ICONS } from '@/components/brand/brand';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tab, Tabs, TabsList, TabsPanel } from '@/components/ui/tabs';
import { useDateFormat } from '@/features/bookings/bookings-page';
import { priceOf } from '@/features/search/format';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { useAction } from '@/lib/mutations';
import { useCan } from '@/lib/session';
import { RequestDetailView } from './request-detail';
import { CRM_KEYS, LeadDialog, RequestDialog, SOURCES, STAGES, useCrmUsers, useDateTime } from './shared';

const BASE = '/agency/crm';

/** Lost needs a reason (CRM-1); every other allowed move is one click or one drop. */
export function useMoveRequest() {
  const t = useTranslations('crm');
  const api = useApi();
  const [lostFor, setLostFor] = useState<RequestCard | null>(null);
  const [reason, setReason] = useState('');
  const move = useAction((x: { id: string; stage: RequestCard['stage']; reason?: string }) => api.call('crm.requests.move', x), { success: t('moved'), invalidate: CRM_KEYS, onSuccess: () => { setLostFor(null); setReason(''); } });
  const request = (r: RequestCard, stage: RequestCard['stage']) => (stage === 'lost' ? setLostFor(r) : move.mutate({ id: r.id, stage }));
  const dialog = (
    <Dialog open={lostFor !== null} onOpenChange={(o) => !o && setLostFor(null)} title={t('markLost')} description={lostFor?.title}
      footer={<><Button variant="outline" onClick={() => setLostFor(null)}>{t('cancel')}</Button><Button variant="danger" disabled={reason.trim().length < 3} loading={move.isPending} onClick={() => move.mutate({ id: lostFor!.id, stage: 'lost', reason })} data-testid="lost-submit">{t('markLost')}</Button></>}>
      <Field label={t('lostReason')} required><Input name="lostReason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
    </Dialog>
  );
  return { request, dialog, pending: move.isPending };
}

/** W4 work station: Kanban by stage with drag-and-drop or menu moves (CRM-1). */
function Pipeline() {
  const t = useTranslations('crm');
  const te = useTranslations('enums');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const date = useDateFormat();
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dragging, setDragging] = useState<RequestCard | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const users = useCrmUsers();
  const manageAll = useCan('crm.manage_all');
  const mover = useMoveRequest();
  const board = useQuery({
    queryKey: ['crm', 'requests', 'board', q, assignee],
    queryFn: () => api.call('crm.requests.list', { page: 1, pageSize: 100, q: q || undefined, filters: assignee ? { assignee } : undefined }),
    placeholderData: keepPreviousData,
  });
  const drop = (stage: RequestCard['stage']) => {
    setOver(null);
    if (!dragging || dragging.stage === stage) return;
    if (stage === 'won') { router.push(`${BASE}/requests/${dragging.id}`); return; }
    if (dragging.moves.includes(stage)) mover.request(dragging, stage);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Input type="search" className="max-w-xs" placeholder={t('searchRequests')} aria-label={t('searchRequests')} value={q} onChange={(e) => setQ(e.target.value)} />
        {manageAll && <Select className="max-w-48" aria-label={t('assignee')} value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">{t('everyone')}</option>{(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>}
      </div>
      {!board.data ? <Skeleton className="h-96 w-full" /> : (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="crm-board">
          {STAGES.map((stage) => {
            const rows = board.data.items.filter((r) => r.stage === stage);
            const total = rows.reduce((s, r) => s + (r.quotationTotalMinor ?? r.expectedRevenueMinor), 0);
            const droppable = dragging !== null && (dragging.moves.includes(stage) || (stage === 'won' && dragging.moves.includes('won')));
            return (
              <section key={stage} data-stage={stage} aria-label={te(`requestStage.${stage}`)}
                onDragOver={(e) => { if (droppable) { e.preventDefault(); setOver(stage); } }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); drop(stage); }}
                className={cn('flex min-w-0 flex-col gap-2 rounded-xl bg-subtle/60 p-3 transition-colors', over === stage && 'bg-primary-soft/60 ring-2 ring-primary', dragging && !droppable && dragging.stage !== stage && 'opacity-60')}>
                <header className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-fg">{te(`requestStage.${stage}`)}</h2>
                  <Badge tone="neutral">{rows.length}</Badge>
                </header>
                <p className="tabular px-1 text-xs text-fg-muted">{priceOf(total, 'EGP', locale)}</p>
                {rows.length === 0 && <p className="px-1 py-6 text-center text-xs text-fg-muted">{t('emptyStage')}</p>}
                {rows.map((r) => {
                  const Icon = SERVICE_ICONS[r.serviceType];
                  return (
                    <article key={r.id} draggable={r.moves.length > 0} onDragStart={() => setDragging(r)} onDragEnd={() => { setDragging(null); setOver(null); }}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-xs" data-testid="request-card" data-ref={r.ref}>
                      <button type="button" className="flex items-start gap-2 text-start" onClick={() => router.push(`${BASE}/requests/${r.id}`)}>
                        {r.moves.length > 0 && <GripVertical className="mt-0.5 size-4 shrink-0 cursor-grab text-fg-subtle" aria-hidden />}
                        <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0">
                          <span className="block font-mono text-xs text-fg-muted" dir="ltr">{r.ref}</span>
                          <span className="block text-sm font-semibold text-fg">{r.title}</span>
                          <span className="block truncate text-xs text-fg-muted">{r.partyName} · {date(r.from)}</span>
                        </span>
                      </button>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge tone={r.priority === 'high' ? 'danger' : r.priority === 'medium' ? 'warning' : 'neutral'}>{te(`priority.${r.priority}`)}</Badge>
                        {r.overdueFollowUps > 0 && <Badge tone="danger"><AlarmClock className="size-3" aria-hidden />{r.overdueFollowUps}</Badge>}
                        <span className="tabular ms-auto text-xs font-medium">{priceOf(r.quotationTotalMinor ?? r.expectedRevenueMinor, r.currency, locale)}</span>
                      </div>
                      <p className="text-xs text-fg-muted">{r.assigneeName}</p>
                      {r.moves.length > 0 && (
                        <label className="sr-only" htmlFor={`mv-${r.id}`}>{t('moveTo')}</label>
                      )}
                      {r.moves.length > 0 && (
                        <Select id={`mv-${r.id}`} className="h-8 text-xs" value="" data-testid="move-select" onChange={(e) => {
                          const stage = e.target.value as RequestCard['stage'];
                          if (stage === 'won') router.push(`${BASE}/requests/${r.id}`); else if (stage) mover.request(r, stage);
                        }}>
                          <option value="">{t('moveTo')}…</option>
                          {r.moves.map((m) => <option key={m} value={m}>{te(`requestStage.${m}`)}</option>)}
                        </Select>
                      )}
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
      {mover.dialog}
    </div>
  );
}

function Leads() {
  const t = useTranslations('crm');
  const api = useApi();
  const router = useRouter();
  const date = useDateFormat();
  const dt = useDateTime();
  const canCustomers = useCan('customers.manage');
  const state = useListState({ pageSize: 10, sort: 'createdAt:desc' });
  const result = useQuery({ queryKey: ['crm', 'leads', state.query], queryFn: () => api.call('crm.leads.list', state.query), placeholderData: keepPreviousData });
  const [edit, setEdit] = useState<LeadListItem | 'new' | null>(null);
  const [requestFor, setRequestFor] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<LeadListItem | null>(null);
  const [reason, setReason] = useState('');
  const setStatus = useAction((x: { id: string; status: 'contacted' | 'qualified' | 'lost'; reason?: string }) => api.call('crm.leads.setStatus', x), { success: t('leadUpdated'), invalidate: CRM_KEYS, onSuccess: () => { setLostFor(null); setReason(''); } });
  const convert = useAction((id: string) => api.call('crm.leads.convert', { id }), { success: t('converted'), invalidate: CRM_KEYS, onSuccess: (c) => router.push(`/agency/customers/${c.id}`) });
  const columns: Column<LeadListItem>[] = [
    { key: 'name', header: t('name'), sortKey: 'name', cell: (l) => <div><p className="font-medium">{l.name}</p><p className="text-xs text-fg-muted" dir="ltr">{l.email || l.phone}</p></div> },
    { key: 'source', header: t('source'), hideOnCard: true, cell: (l) => <span className="text-sm">{t(`source_${l.source}`)}</span> },
    { key: 'owner', header: t('owner'), hideOnCard: true, cell: (l) => <span className="text-sm">{l.ownerName}</span> },
    { key: 'status', header: t('status'), cell: (l) => <Badge tone={l.status === 'converted' ? 'success' : l.status === 'lost' ? 'danger' : l.status === 'qualified' ? 'info' : 'neutral'}>{t(`lead_${l.status}`)}</Badge> },
    { key: 'next', header: t('nextFollowUp'), sortKey: 'nextFollowUp', cell: (l) => l.nextFollowUpAt ? <span className="text-sm">{dt(l.nextFollowUpAt)}</span> : <span className="text-fg-subtle">—</span> },
    { key: 'created', header: t('created'), sortKey: 'createdAt', hideOnCard: true, cell: (l) => <span className="tabular text-sm">{date(l.createdAt)}</span> },
  ];
  const open = (l: LeadListItem) => l.status !== 'converted' && l.status !== 'lost';
  return (
    <>
      <DataTable state={state} result={result} columns={columns} rowKey={(l) => l.id} label={t('leads')} testId="leads-table"
        toolbar={<Button onClick={() => setEdit('new')} data-testid="new-lead"><UserPlus aria-hidden />{t('newLead')}</Button>}
        filters={[
          { key: 'status', label: t('status'), options: (['new', 'contacted', 'qualified', 'converted', 'lost'] as const).map((s) => ({ value: s, label: t(`lead_${s}`) })) },
          { key: 'source', label: t('source'), options: SOURCES.map((s) => ({ value: s, label: t(`source_${s}`) })) },
        ]}
        rowActions={(l) => (
          <div className="flex flex-wrap justify-end gap-1">
            {open(l) && <Button size="sm" variant="outline" onClick={() => setRequestFor(l.id)} data-action="lead-request"><Plus aria-hidden />{t('request')}</Button>}
            {open(l) && l.status === 'new' && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: l.id, status: 'contacted' })}>{t('markContacted')}</Button>}
            {open(l) && canCustomers && <Button size="sm" variant="ghost" onClick={() => convert.mutate(l.id)} data-action="convert"><Users aria-hidden />{t('convert')}</Button>}
            {open(l) && <Button size="sm" variant="ghost" onClick={() => setLostFor(l)} aria-label={t('markLost')}>{t('lost')}</Button>}
            {l.status === 'converted' && l.customerId && <Button size="sm" variant="ghost" onClick={() => router.push(`/agency/customers/${l.customerId}`)}>{t('viewCustomer')}</Button>}
            <Button size="icon" variant="ghost" onClick={() => setEdit(l)} aria-label={t('editLead')}><PencilLine aria-hidden /></Button>
          </div>
        )}
        empty={<EmptyState icon={<UserPlus aria-hidden />} title={t('noLeads')} body={t('noLeadsBody')} />} />
      {edit && <LeadDialog lead={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {requestFor && <RequestDialog request={null} party={{ leadId: requestFor }} onClose={() => setRequestFor(null)} onSaved={(r) => router.push(`${BASE}/requests/${r.id}`)} />}
      <Dialog open={lostFor !== null} onOpenChange={(o) => !o && setLostFor(null)} title={t('markLost')} description={lostFor?.name}
        footer={<><Button variant="outline" onClick={() => setLostFor(null)}>{t('cancel')}</Button><Button variant="danger" disabled={reason.trim().length < 3} onClick={() => setStatus.mutate({ id: lostFor!.id, status: 'lost', reason })}>{t('markLost')}</Button></>}>
        <Field label={t('lostReason')} required><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Dialog>
    </>
  );
}

export function FollowUps({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('crm');
  const api = useApi();
  const router = useRouter();
  const dt = useDateTime();
  const state = useListState({ pageSize: compact ? 5 : 10, sort: 'dueAt:asc' });
  const query = compact ? { ...state.query, filters: { state: 'open', mine: 'true' } } : state.query;
  const result = useQuery({ queryKey: ['crm', 'followups', compact, state.query], queryFn: () => api.call('crm.followUps.list', query), placeholderData: keepPreviousData });
  const [completing, setCompleting] = useState<FollowUpListItem | null>(null);
  const [outcome, setOutcome] = useState('');
  const complete = useAction(() => api.call('crm.followUps.complete', { id: completing!.id, outcome }), { success: t('followUpDone'), invalidate: CRM_KEYS, onSuccess: () => { setCompleting(null); setOutcome(''); } });
  const go = (f: FollowUpListItem) => router.push(f.entity.kind === 'request' ? `${BASE}/requests/${f.entity.id}` : f.entity.kind === 'customer' ? `/agency/customers/${f.entity.id}` : `${BASE}/leads`);
  const columns: Column<FollowUpListItem>[] = [
    { key: 'dueAt', header: t('due'), sortKey: 'dueAt', cell: (f) => <div className="flex flex-col gap-0.5"><span className="text-sm">{dt(f.dueAt)}</span>{f.overdue && <Badge tone="danger"><AlarmClock className="size-3" aria-hidden />{t('overdue')}</Badge>}{f.doneAt && <Badge tone="success">{t('done')}</Badge>}</div> },
    { key: 'what', header: t('followUp'), cell: (f) => <div className="min-w-0"><p className="text-sm font-medium">{t(`fu_${f.type}`)} · {f.entityLabel}</p><p className="truncate text-xs text-fg-muted">{f.outcome ?? f.note}</p></div> },
    { key: 'assignee', header: t('assignee'), hideOnCard: true, cell: (f) => <span className="text-sm">{f.assigneeName}</span> },
  ];
  return (
    <>
      <DataTable state={state} result={result} columns={columns} rowKey={(f) => f.id} label={t('followUps')} testId="followups-table" onRowClick={go}
        filters={compact ? undefined : [
          { key: 'state', label: t('status'), options: [{ value: 'open', label: t('open') }, { value: 'overdue', label: t('overdue') }, { value: 'done', label: t('done') }] },
          { key: 'type', label: t('type'), options: (['call', 'whatsapp', 'email', 'meeting'] as const).map((x) => ({ value: x, label: t(`fu_${x}`) })) },
        ]}
        rowActions={(f) => f.doneAt ? null : <Button size="sm" variant="outline" onClick={() => setCompleting(f)} data-action="complete-followup"><CheckCircle2 aria-hidden />{t('markDone')}</Button>}
        empty={<EmptyState icon={<CheckCircle2 aria-hidden />} title={t('noFollowUps')} />} />
      <Dialog open={completing !== null} onOpenChange={(o) => !o && setCompleting(null)} title={t('markDone')} description={completing?.entityLabel}
        footer={<><Button variant="outline" onClick={() => setCompleting(null)}>{t('cancel')}</Button><Button onClick={() => complete.mutate()} loading={complete.isPending} data-testid="followup-done">{t('markDone')}</Button></>}>
        <Field label={t('outcome')} optional><Input name="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} /></Field>
      </Dialog>
    </>
  );
}

/** /crm (pipeline, leads, follow-ups) and /crm/requests/:id. */
export function CrmScreen({ segments }: { segments: string[] }) {
  const t = useTranslations('crm');
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  if (segments[0] === 'requests' && segments[1]) return <RequestDetailView id={segments[1]} />;
  const tab = ['leads', 'follow-ups'].includes(segments[0] ?? '') ? segments[0]! : 'pipeline';
  return (
    <>
      <PageHeader title={t('pageTitle')} description={t('pageDescription')} actions={<Button onClick={() => setCreating(true)} data-testid="new-request"><ClipboardList aria-hidden />{t('newRequest')}</Button>} />
      <Tabs value={tab} onValueChange={(v) => router.replace(v === 'pipeline' ? BASE : `${BASE}/${String(v)}`)}>
        <TabsList>
          <Tab value="pipeline" data-testid="crm-tab-pipeline">{t('pipeline')}</Tab>
          <Tab value="leads" data-testid="crm-tab-leads">{t('leads')}</Tab>
          <Tab value="follow-ups" data-testid="crm-tab-followups">{t('followUps')}</Tab>
        </TabsList>
        <TabsPanel value="pipeline"><Pipeline /></TabsPanel>
        <TabsPanel value="leads"><Leads /></TabsPanel>
        <TabsPanel value="follow-ups"><FollowUps /></TabsPanel>
      </Tabs>
      {creating && <RequestDialog request={null} onClose={() => setCreating(false)} onSaved={(r) => router.push(`${BASE}/requests/${r.id}`)} />}
    </>
  );
}
