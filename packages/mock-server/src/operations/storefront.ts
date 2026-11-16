import { requirePrincipal } from '../security';
import { getStorefront, publicStorefront, requestDomain, saveStorefront, setPublished, simulateDns, verifyDomain } from '../services/storefront';
import type { HandlerMap } from './types';

type Ops = 'storefront.get' | 'storefront.save' | 'storefront.setPublished' | 'storefront.requestDomain' | 'storefront.simulateDns' | 'storefront.verifyDomain' | 'storefront.public';

export const storefrontHandlers: HandlerMap<Ops> = {
  'storefront.get': (ctx) => getStorefront(ctx, requirePrincipal(ctx)),
  'storefront.save': (ctx, input) => saveStorefront(ctx, requirePrincipal(ctx), input),
  'storefront.setPublished': (ctx, { published }) => setPublished(ctx, requirePrincipal(ctx), published),
  'storefront.requestDomain': (ctx, { domain }) => requestDomain(ctx, requirePrincipal(ctx), domain),
  'storefront.simulateDns': (ctx) => simulateDns(ctx, requirePrincipal(ctx)),
  'storefront.verifyDomain': (ctx) => verifyDomain(ctx, requirePrincipal(ctx)),
  'storefront.public': (ctx, q) => publicStorefront(ctx.db, q),
};
