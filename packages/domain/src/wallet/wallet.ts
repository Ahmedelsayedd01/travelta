/**
 * WAL-2: available = balance + creditLimit − activeHolds. The balance may go negative down to −creditLimit;
 * credit used = max(0, −balance).
 */
export interface WalletFigures { balanceMinor: number; creditLimitMinor: number; activeHoldsMinor: number }

export function walletAvailable(w: WalletFigures): number {
  return w.balanceMinor + w.creditLimitMinor - w.activeHoldsMinor;
}

export function creditUsed(balanceMinor: number): number {
  return Math.max(0, -balanceMinor);
}

/** WAL-3/4: a hold is placed if it fits; otherwise the booking waits for a top-up or an over-limit approval. */
export function canHold(w: WalletFigures, amountMinor: number): boolean {
  return amountMinor <= walletAvailable(w);
}

/** WAL-6: the cached balance must equal the sum of transactions. */
export function balanceFromTransactions(txs: readonly { amountMinor: number }[]): number {
  return txs.reduce((a, t) => a + t.amountMinor, 0);
}
