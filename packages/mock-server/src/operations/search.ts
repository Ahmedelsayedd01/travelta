import { offerDetail, runSearch } from '../services/search';
import type { HandlerMap } from './types';

export const searchHandlers: HandlerMap<'search.run' | 'search.offer'> = {
  /** Public: anonymous storefront visitors, customers and staff all search; the viewer decides seller & redaction. */
  'search.run': (ctx, params) => runSearch(ctx, params),
  'search.offer': (ctx, { offerId, storefront, customerType, channel, currency, nationalityIso2 }) => {
    const { result, option, breakdown } = offerDetail(ctx, offerId, { storefront, customerType, channel, currency, nationalityIso2 });
    return { result, option, breakdown };
  },
};
