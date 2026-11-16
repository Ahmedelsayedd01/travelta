import type { CartItemDto, CheckoutInput, SearchInput, Traveller } from '@travelta/schemas';
import { DEMO_PASSWORD } from './seed/identity';
import type { testServer } from './test-utils';

/** Reusable end-to-end flows for commerce tests (search → cart → checkout → lifecycle). */
export type Server = ReturnType<typeof testServer>['server'];

export const login = (server: Server, email: string) => server.handle('auth.login', { email, password: DEMO_PASSWORD, audience: 'staff' });
export const loginCustomer = (server: Server, email = 'customer@example.com', storefront?: string) =>
  server.handle('auth.login', { email, password: DEMO_PASSWORD, audience: 'customer', storefront });

export async function destId(server: Server, code: string): Promise<string> {
  return (await server.handle('reference.destinations', { page: 1, pageSize: 100 })).items.find((d) => d.code === code)!.id;
}

export async function findOffer(server: Server, token: string | null, input: Partial<SearchInput> & { serviceType: SearchInput['serviceType'] }, pick: (name: string, ownership: string) => boolean = () => true) {
  const out = await server.handle('search.run', { from: '2026-12-01', adults: 2, children: 0, infants: 0, pageSize: 50, ...input } as SearchInput, token);
  for (const r of out.items) {
    const o = r.options.find((x) => pick(r.name.en, x.ownership));
    if (o) return { result: r, option: o };
  }
  throw new Error(`No offer for ${input.serviceType}`);
}

let n = 0;
export function traveller(type: Traveller['type'], patch: Partial<Traveller> = {}): Traveller {
  n += 1;
  return {
    type, title: type === 'adult' ? 'mr' : 'mstr', firstName: `Guest${n}`, lastName: 'Demo', dateOfBirth: type === 'adult' ? null : type === 'child' ? '2018-05-01' : '2026-01-01',
    nationalityIso2: 'EG', passportNo: `A${1000000 + n}`, passportExpiry: '2030-01-01', mahram: null, lead: false, ...patch,
  };
}

/** Travellers matching an item's occupancy, first adult as lead. */
export function travellersFor(item: Pick<CartItemDto, 'serviceType' | 'occupancy'>): Traveller[] {
  const hotel = item.serviceType === 'hotel' && item.occupancy.rooms.length > 0;
  const adults = hotel ? item.occupancy.rooms.reduce((a, r) => a + r.adults, 0) : item.occupancy.adults;
  const children = hotel ? item.occupancy.rooms.reduce((a, r) => a + r.childAges.length, 0) : item.occupancy.children;
  const infants = hotel ? 0 : item.occupancy.infants;
  return [
    ...Array.from({ length: adults }, (_, i) => traveller('adult', { lead: i === 0 })),
    ...Array.from({ length: children }, () => traveller('child')),
    ...Array.from({ length: infants }, () => traveller('infant')),
  ];
}

export async function checkoutCart(server: Server, token: string, patch: Partial<CheckoutInput> & { details?: Record<string, CheckoutInput['items'][number]['details']> } = {}) {
  const cart = await server.handle('cart.get', {}, token);
  const { details, ...rest } = patch;
  return server.handle('checkout.submit', {
    idempotencyKey: `key-${Math.random().toString(36).slice(2, 12)}`,
    customerId: null,
    items: cart.items.map((i) => ({ itemId: i.id, travellers: travellersFor(i), details: details?.[i.serviceType] ?? {}, acceptedPriceMinor: i.priceMinor })),
    payment: { method: 'plan', type: 'full', installments: [] },
    ...rest,
  }, token);
}

export async function firstCustomer(server: Server, token: string): Promise<string> {
  return (await server.handle('customers.list', { page: 1, pageSize: 1 }, token)).items[0]!.id;
}
