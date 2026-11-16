import type { DemoSnapshot } from '@travelta/schemas';
import { SCHEMA_VERSION, type Collections } from '../db/collections';
import { createSeedContext } from './context';
import { seedIdentity } from './identity';
import { seedSuppliers } from './suppliers';
import { seedKyc } from './kyc';
import { seedPricing } from './pricing';
import { seedCatalog } from './catalog';
import { seedCustomers } from './commerce';
import { seedFinance } from './finance';
import { seedCrm } from './crm';
import { seedSubscriptions } from './subscriptions';
import { Database } from '../db/database';
import { seedHistory } from './history';
import { defaultStorefront } from '../services/storefront';
import { seedCountries, seedCurrencies, seedDestinations, seedFxRates, seedNationalityGroups, seedPlaces } from './reference';

export const DEFAULT_SEED = 20261115;

const DAY_MS = 86_400_000;

/**
 * Seeds are anchored to the start of the current UTC day: every reset on the same day rebuilds a
 * byte-identical dataset, while seeded history (bookings, FX, expiries) stays relative to "today".
 */
export const seedAnchor = (now: number): number => Math.floor(now / DAY_MS) * DAY_MS;

/**
 * Build the deterministic demo dataset. Same `seed` + same `now` ⇒ byte-identical snapshot,
 * which is what makes "Reset demo data" reproducible (TESTING_STRATEGY §5).
 */
const cache = new Map<string, DemoSnapshot>();

export function buildSeed(opts: { seed?: number; now: number; history?: boolean }): DemoSnapshot {
  const seed = opts.seed ?? DEFAULT_SEED;
  const key = `${seed}:${seedAnchor(opts.now)}:${opts.history !== false}`;
  let snap = cache.get(key);
  if (!snap) { snap = buildSeedUncached(seed, opts.now, opts.history !== false); cache.set(key, snap); }
  return structuredClone(snap);
}

function buildSeedUncached(seed: number, now: number, history: boolean): DemoSnapshot {
  const s = createSeedContext(seed, seedAnchor(now));
  const identity = seedIdentity(s);
  const suppliers = seedSuppliers(s, identity.orgIds);
  const kyc = seedKyc(s, identity.organizations, identity.orgIds, identity.users);
  const pricing = seedPricing(s, identity.organizations, identity.orgIds);
  // Reference data keeps its original generation order so earlier collections stay stable.
  const currencies = seedCurrencies(s);
  const countries = seedCountries(s);
  const nationalityGroups = seedNationalityGroups(s);
  const destinations = seedDestinations(s);
  const fxRates = seedFxRates(s);
  const places = seedPlaces(seed, seedAnchor(now), destinations);
  const products = seedCatalog(s, { orgIds: identity.orgIds, destinations, agencySuppliers: suppliers.agencySuppliers, places });
  const customers = seedCustomers(s, identity.orgIds, identity.users);
  const finance = seedFinance(s, identity.organizations, identity.orgIds, identity.users, identity.memberships);
  const saas = seedSubscriptions(s, identity.orgIds, Object.fromEntries(identity.organizations.map((o) => [o.id, o.name.en])), finance);
  const crm = seedCrm(s, identity.orgIds, identity.users, customers, suppliers.agencySuppliers);
  const collections: { [K in keyof Collections]: Collections[K][] } = {
    currencies,
    countries,
    nationalityGroups,
    destinations,
    places,
    favorites: [],
    savedTravelers: [],
    supportTickets: [],
    fxRates,
    organizations: identity.organizations,
    users: identity.users,
    roles: identity.roles,
    memberships: identity.memberships,
    sessions: [],
    authCodes: [],
    auditLogs: [],
    agencySuppliers: suppliers.agencySuppliers,
    supplierContracts: suppliers.contracts,
    kycCases: kyc.cases,
    kycDocuments: kyc.documents,
    kycDecisions: kyc.decisions,
    serviceLines: kyc.serviceLines,
    commercialSettings: pricing.settings,
    markupRules: pricing.rules,
    markupRuleVersions: pricing.versions,
    taxProfiles: pricing.taxProfiles,
    feeRules: pricing.feeRules,
    promoCodes: pricing.promoCodes,
    products,
    calendarOverrides: [],
    customers,
    carts: [],
    bookings: [],
    bookingItems: [],
    bookingEvents: [],
    supplierRequestLogs: [],
    paymentPlans: [],
    payments: [],
    wallets: finance.wallets,
    walletTransactions: finance.walletTransactions,
    walletHolds: [],
    topUpRequests: finance.topUpRequests,
    invoices: [],
    creditNotes: [],
    cancellations: [],
    ledgerAccounts: finance.ledgerAccounts,
    financialAccounts: finance.financialAccounts,
    journalEntries: finance.journalEntries,
    supplierPayables: [],
    expenses: finance.expenses,
    transfers: finance.transfers,
    leads: crm.leads,
    crmRequests: crm.requests,
    quotations: crm.quotations,
    followUps: crm.followUps,
    activities: crm.activities,
    subscriptionPlans: saas.plans,
    subscriptions: saas.subscriptions,
    subscriptionInvoices: saas.invoices,
    notifications: [],
    outboxMessages: [],
    // M22: Nile (Enterprise, storefront included) and Al Noor (storefront add-on) sell online under their own brand.
    storefronts: [
      { ...defaultStorefront(identity.organizations.find((o) => o.slug === 'nile-horizon')!, s.nowIso, s.id('sf')), published: true, subdomain: 'nilehorizon', primaryColor: '#0E7490', heroColor: '#164E63',
        tagline: { en: 'Nile cruises, Red Sea escapes and Umrah — planned in Cairo since 2009', ar: 'رحلات نيلية ومنتجعات البحر الأحمر وعمرة — من القاهرة منذ ٢٠٠٩' } },
      { ...defaultStorefront(identity.organizations.find((o) => o.slug === 'al-noor-umrah')!, s.nowIso, s.id('sf')), published: true, subdomain: 'alnoor', primaryColor: '#15803D', heroColor: '#14532D',
        tagline: { en: 'Umrah and Hajj programmes with trusted guides', ar: 'برامج العمرة والحج مع مرشدين موثوقين' } },
    ],
  };
  // Booking history is created by the real services, then every clock job settles at the seed instant (reminders already
  // due, auto-travelled items…) with a seeded random source — so first load equals the seed (byte-identical resets).
  const db = new Database();
  db.load({ collections, sequences: { ...finance.sequences, ...crm.sequences } });
  seedHistory(db, s.now, seed, history);
  const settled = db.dump();
  return {
    format: 'travelta-demo',
    schemaVersion: SCHEMA_VERSION,
    seed,
    seededAt: s.nowIso,
    clockOffsetMs: 0,
    sequences: settled.sequences,
    collections: settled.collections as unknown as DemoSnapshot['collections'],
  };
}
