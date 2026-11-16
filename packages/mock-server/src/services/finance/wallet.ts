import { balanceFromTransactions, canHold, creditUsed, walletAvailable } from '@travelta/domain';
import type { BookingEntity, BookingItemEntity, TopUpRequestEntity, WalletDto, WalletEntity, WalletHoldEntity } from '@travelta/schemas';
import { createId } from '@travelta/shared';
import type { RequestContext } from '../../context';
import type { Database } from '../../db/database';
import { ApiException, forbidden, notFound } from '../../errors';
import type { Principal } from '../../security';
import { audit } from '../audit';
import { topUpDecided, topUpRequested } from '../notifications/events';
import { defaultFinancialAccount, financialAccountScoped, post } from './ledger';

const platformId = (db: Database) => db.find('organizations', (o) => o.type === 'platform')!.id;

/** WAL-1: agencies hold their wallet with the platform, sub-agencies with their parent. Created on first use. */
export function ensureWallet(ctx: RequestContext, orgId: string): WalletEntity {
  const existing = ctx.db.find('wallets', (w) => w.tenantId === orgId);
  if (existing) return existing;
  const org = ctx.db.get('organizations', orgId)!;
  const now = ctx.clock.nowIso();
  return ctx.db.insert('wallets', {
    id: createId('wal', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: orgId, heldAtOrgId: org.parentId ?? platformId(ctx.db),
    currency: org.baseCurrency, balanceMinor: 0, creditLimitMinor: 0, status: 'active',
  });
}

const activeHolds = (db: Database, walletId: string, except?: string) =>
  db.filter('walletHolds', (h) => h.walletId === walletId && h.status === 'active' && !h.awaitingApproval && h.id !== except).reduce((s, h) => s + h.amountMinor, 0);

export function figures(db: Database, w: WalletEntity, except?: string) {
  return { balanceMinor: w.balanceMinor, creditLimitMinor: w.creditLimitMinor, activeHoldsMinor: activeHolds(db, w.id, except) };
}

export function walletDto(db: Database, w: WalletEntity): WalletDto {
  const f = figures(db, w);
  const txs = db.filter('walletTransactions', (t) => t.walletId === w.id);
  return {
    ...w,
    ownerName: db.get('organizations', w.tenantId)?.name.en ?? '—',
    holderName: db.get('organizations', w.heldAtOrgId)?.name.en ?? '—',
    availableMinor: walletAvailable(f), creditUsedMinor: creditUsed(w.balanceMinor), activeHoldsMinor: f.activeHoldsMinor,
    awaitingMinor: db.filter('walletHolds', (h) => h.walletId === w.id && h.status === 'active' && h.awaitingApproval).reduce((s, h) => s + h.amountMinor, 0),
    pendingTopUps: db.filter('topUpRequests', (t) => t.walletId === w.id && t.status === 'pending').length,
    balanceVerified: balanceFromTransactions(txs) === w.balanceMinor,
  };
}

/** A wallet movement: the signed transaction and the cached balance change together (WAL-6). */
export function walletTx(ctx: RequestContext, w: WalletEntity, type: 'top_up' | 'booking_debit' | 'refund_credit' | 'adjustment', amountMinor: number, note: string, bookingId: string | null = null): WalletEntity {
  const now = ctx.clock.nowIso();
  const fresh = ctx.db.get('wallets', w.id)!;
  const balanceAfterMinor = fresh.balanceMinor + amountMinor;
  ctx.db.insert('walletTransactions', {
    id: createId('wtx', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: fresh.tenantId, walletId: fresh.id, type, amountMinor, balanceAfterMinor,
    bookingId, note: note.slice(0, 300), at: now, actorUserId: ctx.principal?.user.id ?? null,
  });
  const next = { ...fresh, balanceMinor: balanceAfterMinor, updatedAt: now, version: fresh.version + 1 };
  ctx.db.replace('wallets', next);
  return next;
}

// ---- Legs: who pays whom for network / API stock (WAL-3, ACC-2) -----------------------------------------------------------
export interface Leg { payerOrgId: string; holderOrgId: string; amountMinor: number }

/**
 * For each B2B item bought from network or API stock, every tier pays the tier above from its wallet:
 * sub-agency → parent (sub-agency buy price), agency → platform (agency buy price). Own suppliers and platform retail
 * have no legs (they settle with their supplier directly).
 */
export function legsFor(db: Database, b: BookingEntity, item: BookingItemEntity): Leg[] {
  const seller = db.get('organizations', b.tenantId);
  if (!seller || seller.type !== 'agency' || seller.isPlatformRetail || item.ownership === 'agency_own') return [];
  const platform = platformId(db);
  const agencyBuy = item.breakdown.buyPrices.agencyBuyMinor;
  if (seller.parentId) {
    return [
      { payerOrgId: seller.id, holderOrgId: seller.parentId, amountMinor: item.breakdown.buyPrices.subAgencyBuyMinor ?? agencyBuy },
      { payerOrgId: seller.parentId, holderOrgId: platform, amountMinor: agencyBuy },
    ];
  }
  return [{ payerOrgId: seller.id, holderOrgId: platform, amountMinor: agencyBuy }];
}

/** Submit hook (WAL-3/4): one hold per leg; items whose holds don't fit wait for a top-up or over-limit approval. */
export function placeHolds(ctx: RequestContext, b: BookingEntity, items: BookingItemEntity[]): Set<string> {
  const waiting = new Set<string>();
  const now = ctx.clock.nowIso();
  for (const item of items) {
    for (const leg of legsFor(ctx.db, b, item)) {
      if (leg.amountMinor <= 0) continue;
      const w = ensureWallet(ctx, leg.payerOrgId);
      const fits = w.status === 'active' && canHold(figures(ctx.db, w), leg.amountMinor);
      ctx.db.insert('walletHolds', {
        id: createId('hld', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: w.tenantId, walletId: w.id, bookingId: b.id, itemId: item.id,
        amountMinor: leg.amountMinor, status: 'active', awaitingApproval: !fits, approvedByUserId: null,
      });
      if (!fits) waiting.add(item.id);
    }
  }
  return waiting;
}

export const itemHolds = (db: Database, itemId: string) => db.filter('walletHolds', (h) => h.itemId === itemId && h.status === 'active');

/** Confirmation: each hold becomes a booking debit on its wallet. */
export function captureHolds(ctx: RequestContext, b: BookingEntity, item: BookingItemEntity): void {
  for (const h of itemHolds(ctx.db, item.id)) {
    walletTx(ctx, ctx.db.get('wallets', h.walletId)!, 'booking_debit', -h.amountMinor, `${b.ref} · ${item.title.en}`, b.id);
    ctx.db.replace('walletHolds', { ...h, status: 'captured', awaitingApproval: false, updatedAt: ctx.clock.nowIso(), version: h.version + 1 });
  }
}

export function releaseHolds(ctx: RequestContext, item: BookingItemEntity): void {
  for (const h of itemHolds(ctx.db, item.id)) ctx.db.replace('walletHolds', { ...h, status: 'released', updatedAt: ctx.clock.nowIso(), version: h.version + 1 });
}

/** Called once no hold of an item awaits approval any more: the item goes back to the supplier queue. */
type Unblock = (ctx: RequestContext, b: BookingEntity, item: BookingItemEntity, reason: string) => void;
let onUnblocked: Unblock = () => undefined;
export function setUnblockHandler(fn: Unblock): void { onUnblocked = fn; }

function settle(ctx: RequestContext, item: BookingItemEntity, reason: string): void {
  const fresh = ctx.db.get('bookingItems', item.id)!;
  if (fresh.status !== 'pending' || fresh.holdReason !== 'awaiting_credit_approval') return;
  if (itemHolds(ctx.db, item.id).some((h) => h.awaitingApproval)) return;
  onUnblocked(ctx, ctx.db.get('bookings', fresh.bookingId)!, fresh, reason);
}

/** WAL-4/5: after money arrives or the limit rises, waiting holds that now fit are released into the active set (FIFO). */
export function recheckAwaiting(ctx: RequestContext, walletId: string): void {
  const waiting = ctx.db.filter('walletHolds', (h) => h.walletId === walletId && h.status === 'active' && h.awaitingApproval).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const h of waiting) {
    const w = ctx.db.get('wallets', walletId)!;
    if (w.status !== 'active' || !canHold(figures(ctx.db, w), h.amountMinor)) break;
    ctx.db.replace('walletHolds', { ...h, awaitingApproval: false, updatedAt: ctx.clock.nowIso(), version: h.version + 1 });
    settle(ctx, ctx.db.get('bookingItems', h.itemId)!, 'Funds available');
  }
}

/** WAL-4 over-limit exception: platform ops (or the parent-agency owner for its sub-agency) approves the waiting holds. */
export function approveCredit(ctx: RequestContext, p: Principal, b: BookingEntity, item: BookingItemEntity): void {
  const mine = itemHolds(ctx.db, item.id).filter((h) => h.awaitingApproval && (p.org.type === 'platform' || ctx.db.get('wallets', h.walletId)?.heldAtOrgId === p.org.id));
  if (mine.length === 0) throw forbidden('No waiting hold of this item is yours to approve');
  for (const h of mine) ctx.db.replace('walletHolds', { ...h, awaitingApproval: false, approvedByUserId: p.user.id, updatedAt: ctx.clock.nowIso(), version: h.version + 1 });
  audit(ctx, { tenantId: b.tenantId, action: 'wallet.credit_approved', entity: 'bookingItem', entityId: item.id, after: { ref: b.ref, amount: mine.reduce((s, h) => s + h.amountMinor, 0) } });
  settle(ctx, item, `Over-limit approved by ${p.user.name}`);
}

// ---- Access ---------------------------------------------------------------------------------------------------------
/** Owners see their wallet; the holder (platform / parent agency) sees and manages the wallets held with it. */
export function walletScoped(ctx: RequestContext, p: Principal, walletId?: string): WalletEntity {
  if (!p.permissions.has('wallet.view')) throw forbidden('Missing permission: wallet.view');
  if (!walletId) {
    if (p.org.type !== 'agency' || p.org.isPlatformRetail) throw notFound('Wallet');
    return ensureWallet(ctx, p.org.id);
  }
  const w = ctx.db.get('wallets', walletId);
  if (!w || (w.tenantId !== p.org.id && w.heldAtOrgId !== p.org.id && p.org.type !== 'platform')) throw notFound('Wallet');
  return w;
}

export const holdsDetail = (db: Database, w: WalletEntity) =>
  db.filter('walletHolds', (h) => h.walletId === w.id && h.status === 'active').map((h) => ({
    ...h, bookingRef: db.get('bookings', h.bookingId)?.ref ?? '—', itemTitle: db.get('bookingItems', h.itemId)?.title ?? { en: '—', ar: '—' },
  }));

export function requestTopUp(ctx: RequestContext, p: Principal, input: { amountMinor: number; method: TopUpRequestEntity['method']; reference: string; proof: TopUpRequestEntity['proof']; walletId?: string }): TopUpRequestEntity {
  if (!p.permissions.has('wallet.top_up_request')) throw forbidden('Missing permission: wallet.top_up_request');
  const w = walletScoped(ctx, p, input.walletId);
  if (w.tenantId !== p.org.id) throw forbidden('You can only top up your own wallet');
  const now = ctx.clock.nowIso();
  const row = ctx.db.insert('topUpRequests', {
    id: createId('tup', ctx.clock.now()), createdAt: now, updatedAt: now, version: 1, tenantId: w.tenantId, walletId: w.id, amountMinor: input.amountMinor,
    method: input.method, reference: input.reference, proof: input.proof, status: 'pending', requestedByUserId: p.user.id, decidedByUserId: null, decidedAt: null, reason: null,
  });
  topUpRequested(ctx, row);
  audit(ctx, { tenantId: w.tenantId, action: 'wallet.top_up_requested', entity: 'topUpRequest', entityId: row.id, after: { amount: input.amountMinor, method: input.method } });
  return row;
}

export const canDecideTopUp = (ctx: RequestContext, p: Principal, t: TopUpRequestEntity) =>
  t.status === 'pending' && p.permissions.has('wallet.top_up_approve') && ctx.db.get('wallets', t.walletId)?.heldAtOrgId === p.org.id;

const METHOD_KIND = { bank_transfer: 'bank', cash: 'cash', instapay: 'instapay', vodafone_cash: 'vodafone_cash', card: 'card_gateway' } as const;

/** WAL-5: approval credits the wallet (repaying used credit first, by construction) and posts both ledgers. */
export function decideTopUp(ctx: RequestContext, p: Principal, t: TopUpRequestEntity, decision: 'approve' | 'reject', reason?: string, financialAccountId?: string): TopUpRequestEntity {
  if (!canDecideTopUp(ctx, p, t)) throw t.status !== 'pending' ? new ApiException('INVALID_TRANSITION', `Top-up is ${t.status}`) : forbidden('Only the wallet holder decides top-ups');
  if (decision === 'reject' && !(reason && reason.trim().length >= 3)) throw new ApiException('VALIDATION_ERROR', 'A reason is required', [{ field: 'reason', issue: 'validation.reason_required' }]);
  const now = ctx.clock.nowIso();
  const next: TopUpRequestEntity = { ...t, status: decision === 'approve' ? 'approved' : 'rejected', decidedByUserId: p.user.id, decidedAt: now, reason: reason?.trim() || null, updatedAt: now, version: t.version + 1 };
  ctx.db.replace('topUpRequests', next);
  if (decision === 'approve') {
    const w = ctx.db.get('wallets', t.walletId)!;
    walletTx(ctx, w, 'top_up', t.amountMinor, `Top-up ${t.reference} (${t.method})`);
    const owner = ctx.db.get('organizations', w.tenantId)!;
    const holderAcc = financialAccountId ? financialAccountScoped(ctx, w.heldAtOrgId, financialAccountId) : defaultFinancialAccount(ctx, w.heldAtOrgId, METHOD_KIND[t.method]);
    const ownerAcc = defaultFinancialAccount(ctx, w.tenantId, METHOD_KIND[t.method]);
    post(ctx, {
      tenantId: w.heldAtOrgId, memo: `Wallet top-up · ${owner.name.en} · ${t.reference}`, source: 'top_up', sourceId: t.id, currency: w.currency,
      lines: [{ accountId: holderAcc.ledgerAccountId, debitMinor: t.amountMinor, creditMinor: 0 }, { key: 'agency_wallet_liability', debitMinor: 0, creditMinor: t.amountMinor, party: { kind: 'agency', id: owner.id, name: owner.name.en } }],
    });
    post(ctx, {
      tenantId: w.tenantId, memo: `Wallet top-up · ${t.reference}`, source: 'top_up', sourceId: t.id, currency: w.currency,
      lines: [{ key: 'prepaid_wallet', debitMinor: t.amountMinor, creditMinor: 0 }, { accountId: ownerAcc.ledgerAccountId, debitMinor: 0, creditMinor: t.amountMinor }],
    });
    recheckAwaiting(ctx, w.id);
  }
  topUpDecided(ctx, next);
  audit(ctx, { tenantId: t.tenantId, action: `wallet.top_up_${next.status}`, entity: 'topUpRequest', entityId: t.id, after: { amount: t.amountMinor, reason: next.reason } });
  return next;
}

export function setCreditLimit(ctx: RequestContext, p: Principal, w: WalletEntity, creditLimitMinor: number): WalletEntity {
  if (!p.permissions.has('wallet.credit_manage') || w.heldAtOrgId !== p.org.id) throw forbidden('Only the wallet holder sets the credit limit');
  const next = { ...w, creditLimitMinor, updatedAt: ctx.clock.nowIso(), version: w.version + 1 };
  ctx.db.replace('wallets', next);
  audit(ctx, { tenantId: w.tenantId, action: 'wallet.credit_limit_set', entity: 'wallet', entityId: w.id, before: { creditLimitMinor: w.creditLimitMinor }, after: { creditLimitMinor } });
  recheckAwaiting(ctx, w.id);
  return ctx.db.get('wallets', w.id)!;
}

export function setWalletStatus(ctx: RequestContext, p: Principal, w: WalletEntity, status: WalletEntity['status']): WalletEntity {
  if (!p.permissions.has('wallet.credit_manage') || w.heldAtOrgId !== p.org.id) throw forbidden('Only the wallet holder freezes a wallet');
  const next = { ...w, status, updatedAt: ctx.clock.nowIso(), version: w.version + 1 };
  ctx.db.replace('wallets', next);
  audit(ctx, { tenantId: w.tenantId, action: `wallet.${status === 'frozen' ? 'frozen' : 'unfrozen'}`, entity: 'wallet', entityId: w.id });
  if (status === 'active') recheckAwaiting(ctx, w.id);
  return next;
}

export type { WalletHoldEntity };
