import { z } from 'zod';
import { currencySchema, isoDateSchema, listQuerySchema } from '../primitives';
import { countryEntitySchema, currencyEntitySchema, destinationEntitySchema, fxRateEntitySchema, nationalityGroupEntitySchema } from '../entities/reference';
import { op } from './define';

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), page: z.number().int(), pageSize: z.number().int(), total: z.number().int() });

export const referenceOperations = {
  'reference.currencies': op({ input: z.void(), output: z.array(currencyEntitySchema), http: { method: 'GET', path: '/reference/currencies' }, auth: 'public' }),
  'reference.countries': op({ input: z.void(), output: z.array(countryEntitySchema), http: { method: 'GET', path: '/reference/countries' }, auth: 'public' }),
  'reference.nationalityGroups': op({ input: z.void(), output: z.array(nationalityGroupEntitySchema), http: { method: 'GET', path: '/reference/nationality-groups' }, auth: 'public' }),
  'reference.destinations': op({ input: listQuerySchema, output: pageOf(destinationEntitySchema), http: { method: 'GET', path: '/reference/destinations' }, auth: 'public' }),
  'fx.latest': op({
    input: z.object({ base: currencySchema }),
    output: z.array(fxRateEntitySchema),
    http: { method: 'GET', path: '/fx/rates/latest' },
    auth: 'public',
  }),
  'fx.history': op({
    input: z.object({ base: currencySchema, quote: currencySchema, from: isoDateSchema.optional(), to: isoDateSchema.optional() }),
    output: z.array(fxRateEntitySchema),
    http: { method: 'GET', path: '/fx/rates/history' },
    auth: 'public',
  }),
} as const;
