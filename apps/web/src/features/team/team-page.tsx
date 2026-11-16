'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { permissionModule, type Permission } from '@travelta/contracts';
import { inviteMemberInputSchema, roleInputSchema, type InviteMemberInput, type RoleDto, type RoleInput, type TeamMemberDto } from '@travelta/schemas';
import { Lock, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useApi } from '@/components/api-provider';
import { DataTable, useListState, type Column } from '@/components/data/data-table';
import { Can } from '@/components/portal/guards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tab, Tabs, TabsList, TabsPanel } from '@/components/ui/tabs';
import { applyFieldErrors, useAction } from '@/lib/mutations';
import { useCan, useSession } from '@/lib/session';

const statusTone = { active: 'success', invited: 'info', disabled: 'neutral' } as const;

function useRoles() {
  const api = useApi();
  return useQuery({ queryKey: ['roles'], queryFn: () => api.call('roles.list') });
}

function MembersTab() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const format = useFormatter();
  const api = useApi();
  const me = useSession((s) => s.session?.user.id);
  const canManage = useCan('team.manage_users');
  const roles = useRoles();
  const state = useListState({ pageSize: 10, sort: 'name:asc' });
  const result = useQuery({ queryKey: ['team', 'members', state.query], queryFn: () => api.call('team.members', state.query), placeholderData: keepPreviousData });
  const [inviting, setInviting] = useState(false);
  const [toggle, setToggle] = useState<TeamMemberDto | null>(null);

  const update = useAction((input: { userId: string; roleId?: string; status?: 'active' | 'disabled' }) => api.call('team.updateMember', input), {
    success: t('team.updated'), invalidate: [['team'], ['roles']], onSuccess: () => setToggle(null),
  });

  const columns: Column<TeamMemberDto>[] = [
    { key: 'name', header: t('auth.name'), sortKey: 'name', cell: (m) => (
      <div><p className="font-medium">{m.name}{m.userId === me && <span className="ms-2 text-xs text-fg-muted">({t('team.you')})</span>}</p><p className="text-xs text-fg-muted" dir="ltr">{m.email}</p></div>
    ) },
    { key: 'role', header: t('team.role'), sortKey: 'role', cell: (m) =>
      canManage && m.userId !== me && roles.data ? (
        <Select aria-label={`${t('team.changeRole')} — ${m.name}`} className="h-9 min-w-40" value={m.role.id} disabled={update.isPending}
          onChange={(e) => update.mutate({ userId: m.userId, roleId: e.target.value })}>
          {roles.data.map((r) => <option key={r.id} value={r.id}>{r.name[locale]}</option>)}
        </Select>
      ) : <Badge tone={m.role.isSystem ? 'primary' : 'accent'}>{m.role.name[locale]}</Badge> },
    { key: 'status', header: t('team.status'), cell: (m) => (
      <Badge tone={statusTone[m.status]} dot>{t(m.status === 'active' ? 'team.statusActive' : m.status === 'invited' ? 'team.statusInvited' : 'team.statusDisabled')}</Badge>
    ) },
    { key: 'lastLogin', header: t('auth.lastLogin'), sortKey: 'lastLoginAt', hideOnCard: true, cell: (m) =>
      m.lastLoginAt ? format.dateTime(new Date(m.lastLoginAt), { dateStyle: 'medium', timeStyle: 'short' }) : t('auth.never') },
  ];

  return (
    <>
      <DataTable
        label={t('team.members')}
        testId="team-table"
        state={state}
        result={result}
        columns={columns}
        rowKey={(m) => m.userId}
        filters={roles.data ? [{ key: 'role', label: t('team.role'), options: roles.data.map((r) => ({ value: r.key, label: r.name[locale] })) }] : undefined}
        toolbar={<Can permission="team.manage_users"><Button onClick={() => setInviting(true)}><UserPlus aria-hidden />{t('team.invite')}</Button></Can>}
        rowActions={canManage ? (m) => m.userId === me ? null : (
          <Button variant="ghost" size="sm" className={m.status === 'disabled' ? '' : 'text-danger'} onClick={() => setToggle(m)}>
            {m.status === 'disabled' ? t('team.enable') : t('team.disable')}
          </Button>
        ) : undefined}
      />
      <InviteSheet open={inviting} onOpenChange={setInviting} roles={roles.data ?? []} />
      <ConfirmDialog
        open={toggle !== null}
        onOpenChange={(o) => !o && setToggle(null)}
        destructive={toggle?.status !== 'disabled'}
        title={toggle ? (toggle.status === 'disabled' ? t('team.enable') : t('team.disableTitle', { name: toggle.name })) : ''}
        description={toggle?.status === 'disabled' ? undefined : t('team.disableBody')}
        confirmLabel={toggle?.status === 'disabled' ? t('team.enable') : t('team.disable')}
        loading={update.isPending}
        onConfirm={() => { if (toggle) update.mutate({ userId: toggle.userId, status: toggle.status === 'disabled' ? 'active' : 'disabled' }); }}
      />
    </>
  );
}

function InviteSheet({ open, onOpenChange, roles }: { open: boolean; onOpenChange: (o: boolean) => void; roles: RoleDto[] }) {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const form = useForm<InviteMemberInput>({ resolver: zodResolver(inviteMemberInputSchema), defaultValues: { name: '', email: '', roleId: '' } });
  const invite = useAction((input: InviteMemberInput) => api.call('team.invite', input), {
    success: (out, input) => (out.invited ? t('team.invited', { email: input.email }) : t('team.added', { name: input.name })),
    invalidate: [['team'], ['roles']],
    onSuccess: () => { form.reset(); onOpenChange(false); },
  });
  const submit = form.handleSubmit((values) => invite.mutate(values, { onError: (e) => applyFieldErrors(e, form.setError) }));
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('team.inviteTitle')} description={t('team.inviteHelp')}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button loading={invite.isPending} onClick={() => void submit()}>{t('team.invite')}</Button></>}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('auth.name')} required error={form.formState.errors.name?.message}><Input {...form.register('name')} /></Field>
        <Field label={t('auth.email')} required error={form.formState.errors.email?.message}><Input type="email" dir="ltr" {...form.register('email')} /></Field>
        <Field label={t('team.role')} required error={form.formState.errors.roleId?.message}>
          <Select {...form.register('roleId')}>
            <option value="">—</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name[locale]}</option>)}
          </Select>
        </Field>
      </form>
    </Sheet>
  );
}

function RolesTab() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const api = useApi();
  const roles = useRoles();
  const [editing, setEditing] = useState<RoleDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RoleDto | null>(null);
  const remove = useAction((id: string) => api.call('roles.delete', { id }), { success: t('team.roleDeleted'), invalidate: [['roles']], onSuccess: () => setDeleting(null) });

  if (roles.isLoading) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{t('team.systemReadOnly')}</p>
        <Can permission="team.manage_roles"><Button onClick={() => setEditing('new')}><Plus aria-hidden />{t('team.newRole')}</Button></Can>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="roles-grid">
        {roles.data?.map((r) => (
          <Card key={r.id} className="flex flex-col gap-3 p-4" data-role-key={r.key}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-fg">{r.name[locale]}</p>
                <p className="text-xs text-fg-muted">{t('team.memberCount', { count: r.memberCount })} · {t('auth.permissionsCount', { count: r.permissions.length })}</p>
              </div>
              <Badge tone={r.isSystem ? 'primary' : 'accent'}>{r.isSystem ? <><Lock className="size-3" aria-hidden />{t('team.system')}</> : t('team.custom')}</Badge>
            </div>
            {!r.isSystem && (
              <Can permission="team.manage_roles">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(r)}><Pencil aria-hidden />{t('common.edit')}</Button>
                  <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeleting(r)}><Trash2 aria-hidden />{t('common.delete')}</Button>
                </div>
              </Can>
            )}
          </Card>
        ))}
      </div>
      {editing && <RoleEditor role={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)} title={deleting ? t('team.deleteRoleTitle', { name: deleting.name[locale] }) : ''}
        description={t('team.deleteRoleBody')} confirmLabel={t('team.deleteRole')} loading={remove.isPending} onConfirm={() => { if (deleting) remove.mutate(deleting.id); }} />
    </div>
  );
}

/** Custom role editor: only permissions the editor holds are offered (server enforces the same rule). */
function RoleEditor({ role, onClose }: { role: RoleDto | null; onClose: () => void }) {
  const t = useTranslations();
  const api = useApi();
  const myPermissions = useSession((s) => s.session?.permissions ?? []);
  const grouped = useMemo(() => {
    const out: Record<string, Permission[]> = {};
    for (const p of myPermissions) (out[permissionModule(p)] ??= []).push(p);
    return Object.entries(out).sort(([a], [b]) => a.localeCompare(b));
  }, [myPermissions]);
  const form = useForm<RoleInput>({ resolver: zodResolver(roleInputSchema), defaultValues: { name: role?.name ?? { en: '', ar: '' }, permissions: role?.permissions ?? [] } });
  const selected = new Set(form.watch('permissions'));
  const toggle = (p: Permission, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(p); else next.delete(p);
    form.setValue('permissions', [...next], { shouldValidate: form.formState.isSubmitted });
  };
  const save = useAction((input: RoleInput) => (role ? api.call('roles.update', { ...input, id: role.id }) : api.call('roles.create', input)), {
    success: t('team.roleSaved'), invalidate: [['roles'], ['team']], onSuccess: onClose,
  });
  const submit = form.handleSubmit((values) => save.mutate(values, { onError: (e) => applyFieldErrors(e, form.setError) }));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} size="lg" title={role ? t('team.editRole') : t('team.newRole')} description={t('team.grantHint')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => void submit()}>{t('common.save')}</Button></>}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('team.roleNameEn')} required error={form.formState.errors.name?.en?.message}><Input {...form.register('name.en')} /></Field>
          <Field label={t('team.roleNameAr')} required error={form.formState.errors.name?.ar?.message}><Input dir="rtl" {...form.register('name.ar')} /></Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-fg">{t('team.permissions')}</p>
            <span className="text-xs text-fg-muted">{t('team.selected', { count: selected.size })}</span>
          </div>
          {form.formState.errors.permissions?.message && <p role="alert" className="mb-2 text-xs font-medium text-danger">{t(form.formState.errors.permissions.message as never)}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {grouped.map(([module, perms]) => {
              const all = perms.every((p) => selected.has(p));
              return (
                <fieldset key={module} className="rounded-lg border border-border p-3">
                  <legend className="px-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">{module.replace('_', ' ')}</legend>
                  <Checkbox className="mb-1.5 text-xs" checked={all} onCheckedChange={(on) => perms.forEach((p) => toggle(p, on))} label={t('team.selectModule', { module })} />
                  <div className="flex flex-col gap-1.5">
                    {perms.map((p) => <Checkbox key={p} checked={selected.has(p)} onCheckedChange={(on) => toggle(p, on)} label={<code dir="ltr" className="text-xs">{p.slice(module.length + 1)}</code>} />)}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </div>
      </form>
    </Sheet>
  );
}

export function TeamPage() {
  const t = useTranslations('team');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Tabs defaultValue="members">
        <TabsList>
          <Tab value="members">{t('members')}</Tab>
          <Tab value="roles">{t('roles')}</Tab>
        </TabsList>
        <TabsPanel value="members"><MembersTab /></TabsPanel>
        <TabsPanel value="roles"><RolesTab /></TabsPanel>
      </Tabs>
    </>
  );
}
