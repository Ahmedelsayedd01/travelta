import { describe, expect, it } from 'vitest';
import { login } from './test-flows';
import { testServer } from './test-utils';

/** SUB-1..4 through the API. */
describe('SaaS subscriptions', () => {
  it('seeds DEMO plans and one subscription per agency; the platform sees MRR (SUB-1)', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const plans = await server.handle('subscriptions.plans', undefined, admin.token);
    expect(plans.map((p) => p.key)).toEqual(['starter', 'growth', 'enterprise']);
    expect(plans.every((p) => p.isDemoValue)).toBe(true);
    const subs = await server.handle('subscriptions.list', { page: 1, pageSize: 20 }, admin.token);
    expect(subs.items.map((s) => [s.orgName, s.status])).toEqual(expect.arrayContaining([['Nile Horizon Travel', 'active'], ['Sunrise Tours', 'past_due'], ['Red Sea Journeys', 'trialing']]));
    const nile = await login(server, 'owner@nilehorizon.demo');
    await expect(server.handle('subscriptions.list', { page: 1, pageSize: 5 }, nile.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const mine = await server.handle('subscriptions.mine', undefined, nile.token);
    expect(mine.subscription).toMatchObject({ status: 'active', writable: true });
    expect(mine.invoices.length).toBeGreaterThan(0);
  });

  it('plan modules gate whole features; limits are enforced on create (SUB-3)', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const plans = await server.handle('subscriptions.plans', undefined, admin.token);
    const starter = plans.find((p) => p.key === 'starter')!;
    // Platform edits the DEMO plan: Starter allows 1 user.
    await server.handle('subscriptions.savePlan', { ...starter, limits: { ...starter.limits, users: 1 } }, admin.token);
    const nile = await login(server, 'owner@nilehorizon.demo');
    const downgrade = server.handle('subscriptions.changePlan', { planId: starter.id }, nile.token);
    await expect(downgrade).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: expect.arrayContaining([expect.objectContaining({ issue: 'validation.plan_users' }), expect.objectContaining({ issue: 'validation.plan_sub_agencies' })]) });

    const alnoor = await login(server, 'owner@alnoor.demo');
    const growth = plans.find((p) => p.key === 'growth')!;
    await server.handle('subscriptions.savePlan', { ...growth, modules: ['accounting', 'sub_agencies'] }, admin.token);
    await expect(server.handle('crm.leads.list', { page: 1, pageSize: 5 }, alnoor.token)).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
    await server.handle('subscriptions.savePlan', { ...growth, limits: { ...growth.limits, users: 1 } }, admin.token);
    const roles = await server.handle('roles.list', undefined, alnoor.token);
    await expect(server.handle('team.invite', { name: 'New Agent', email: 'agent2@alnoor.demo', roleId: roles[0]!.id }, alnoor.token)).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
  });

  it('upgrades charge a prorated invoice now; downgrades wait for the period end (SUB-4)', async () => {
    const { server } = testServer();
    const alnoor = await login(server, 'owner@alnoor.demo');
    const plans = await server.handle('subscriptions.plans', undefined, alnoor.token);
    const up = await server.handle('subscriptions.changePlan', { planId: plans.find((p) => p.key === 'enterprise')!.id }, alnoor.token);
    expect(up.effective).toBe('now');
    expect(up.chargedMinor).toBeGreaterThan(0);
    expect(up.subscription.plan.key).toBe('enterprise');
    const mine = await server.handle('subscriptions.mine', undefined, alnoor.token);
    expect(mine.invoices[0]).toMatchObject({ kind: 'upgrade', status: 'paid', totalMinor: up.chargedMinor });
    const down = await server.handle('subscriptions.changePlan', { planId: plans.find((p) => p.key === 'growth')!.id }, alnoor.token);
    expect(down).toMatchObject({ effective: 'period_end', chargedMinor: 0 });
    expect(down.subscription.pendingPlan!.key).toBe('growth');
    expect(down.subscription.plan.key).toBe('enterprise');
  });

  it('trial → past_due without a card → suspended after 7 days (read-only) → pay → active (SUB-2)', async () => {
    const { server } = testServer();
    await server.handle('demo.setClock', { offsetDays: 9 }); // Red Sea trial ends
    let redsea = await login(server, 'owner@redsea.demo');
    expect((await server.handle('subscriptions.mine', undefined, redsea.token)).subscription!.status).toBe('past_due');
    await server.handle('demo.setClock', { offsetDays: 16 });
    redsea = await login(server, 'owner@redsea.demo');
    const s = (await server.handle('subscriptions.mine', undefined, redsea.token)).subscription!;
    expect(s).toMatchObject({ status: 'suspended', writable: false });
    await expect(server.handle('customers.save', { kind: 'individual', name: 'Blocked Write', phone: '+201000000001' }, redsea.token)).rejects.toMatchObject({ code: 'ORG_NOT_ELIGIBLE' });
    expect((await server.handle('customers.list', { page: 1, pageSize: 5 }, redsea.token)).items).toBeDefined(); // reads still work
    await expect(server.handle('subscriptions.payNow', undefined, redsea.token)).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    await server.handle('subscriptions.updateCard', { number: '4242 4242 4242 4242', expiry: '12/29', cvc: '123', holder: 'Laila Mahmoud' }, redsea.token);
    const paid = await server.handle('subscriptions.payNow', undefined, redsea.token);
    expect(paid).toMatchObject({ status: 'active', writable: true });
    await server.handle('customers.save', { kind: 'individual', name: 'Now Allowed', phone: '+201000000002' }, redsea.token);
  });

  it('a new agency gets a 14-day trial; platform can extend, suspend and reactivate', async () => {
    const { server } = testServer();
    const admin = await login(server, 'admin@travelta.demo');
    const sunrise = (await server.handle('subscriptions.list', { page: 1, pageSize: 20, q: 'Sunrise' }, admin.token)).items[0]!;
    const re = await server.handle('subscriptions.adminAction', { subscriptionId: sunrise.id, action: 'reactivate' }, admin.token);
    expect(re.status).toBe('active');
    const sus = await server.handle('subscriptions.adminAction', { subscriptionId: sunrise.id, action: 'suspend' }, admin.token);
    expect(sus.status).toBe('suspended');
    const trial = (await server.handle('subscriptions.list', { page: 1, pageSize: 20, filters: { status: 'trialing' } }, admin.token)).items[0]!;
    const ext = await server.handle('subscriptions.adminAction', { subscriptionId: trial.id, action: 'extend_trial' }, admin.token);
    expect(ext.daysLeftInTrial).toBe(trial.daysLeftInTrial! + 7);
  });
});
