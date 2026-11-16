import { financeReady } from '../finance';
import { placeHolds } from '../finance/wallet';
import type { SubmitHooks } from './index';
import { bookApiItems } from './lifecycle';

/**
 * Side effects of submitting a checkout, composed from the wallet (holds for network/API stock, WAL-3/4) and the
 * lifecycle (API adapters book immediately). Importing the finance module registers its confirmation effects.
 */
export const submitHooks: SubmitHooks = {
  placeHolds: (ctx, booking, items) => (financeReady ? placeHolds(ctx, booking, items) : new Set()),
  afterSubmit: bookApiItems,
};
