import { ROLE_TEMPLATES, type OrgStatus, type OrgType, type RoleTemplateKey, type ServiceType } from '@travelta/contracts';
import type { MembershipEntity, OrganizationEntity, RoleEntity, UserEntity } from '@travelta/schemas';
import { simHash } from '../services/passwords';
import type { SeedContext } from './context';

export const DEMO_PASSWORD = 'Demo@1234';

const ROLE_NAMES: Record<RoleTemplateKey, [en: string, ar: string]> = {
  super_admin: ['Super admin', 'مدير عام'],
  compliance_ops: ['Compliance & operations', 'الامتثال والعمليات'],
  agency_owner: ['Agency owner', 'مالك الوكالة'],
  sales_agent: ['Sales agent', 'مندوب مبيعات'],
  operations: ['Operations', 'العمليات'],
  accountant: ['Accountant', 'محاسب'],
  sub_agent_owner: ['Sub-agency owner', 'مالك الوكالة الفرعية'],
  supplier_admin: ['Supplier admin', 'مدير المورّد'],
  supplier_staff: ['Supplier staff', 'موظف المورّد'],
};

interface OrgSeed {
  key: string;
  type: OrgType;
  parent?: string;
  en: string;
  ar: string;
  legal: string;
  slug: string;
  country: string;
  city: string;
  currency: OrganizationEntity['baseCurrency'];
  status: OrgStatus;
  kyc: OrganizationEntity['kycStatus'];
  services?: ServiceType[];
  retail?: boolean;
  domain: string;
}

/** Fictional organizations (MOCK_DATA_ARCHITECTURE §4). */
const ORGS: OrgSeed[] = [
  { key: 'platform', type: 'platform', en: 'Travelta', ar: 'ترافيلتا', legal: 'Travelta for Travel Technology S.A.E.', slug: 'travelta', country: 'EG', city: 'Cairo', currency: 'EGP', status: 'active', kyc: 'approved', domain: 'travelta' },
  { key: 'direct', type: 'agency', en: 'Travelta Direct', ar: 'ترافيلتا دايركت', legal: 'Travelta for Travel Technology S.A.E.', slug: 'travelta-direct', country: 'EG', city: 'Cairo', currency: 'EGP', status: 'active', kyc: 'approved', retail: true, domain: 'travelta' },
  { key: 'nile', type: 'agency', en: 'Nile Horizon Travel', ar: 'نايل هورايزن للسياحة', legal: 'Nile Horizon Travel L.L.C.', slug: 'nile-horizon', country: 'EG', city: 'Cairo', currency: 'EGP', status: 'active', kyc: 'approved', domain: 'nilehorizon' },
  { key: 'delta', type: 'agency', parent: 'nile', en: 'Delta Gate Travel', ar: 'دلتا جيت للسياحة', legal: 'Delta Gate Travel', slug: 'delta-gate', country: 'EG', city: 'Tanta', currency: 'EGP', status: 'active', kyc: 'approved', domain: 'deltagate' },
  { key: 'redsea', type: 'agency', en: 'Red Sea Journeys', ar: 'رحلات البحر الأحمر', legal: 'Red Sea Journeys Tourism Co.', slug: 'red-sea-journeys', country: 'EG', city: 'Hurghada', currency: 'EGP', status: 'pending_kyc', kyc: 'in_review', domain: 'redsea' },
  { key: 'alnoor', type: 'agency', en: 'Al Noor Umrah & Hajj', ar: 'النور للعمرة والحج', legal: 'Al Noor Umrah & Hajj Tourism', slug: 'al-noor-umrah', country: 'EG', city: 'Alexandria', currency: 'EGP', status: 'active', kyc: 'approved', domain: 'alnoor' },
  { key: 'sunrise', type: 'agency', en: 'Sunrise Tours', ar: 'صن رايز تورز', legal: 'Sunrise Tours Egypt', slug: 'sunrise-tours', country: 'EG', city: 'Giza', currency: 'EGP', status: 'blocked_expired_docs', kyc: 'approved', domain: 'sunrise' },
  { key: 'pharaoh', type: 'supplier', en: 'Pharaoh Stays Group', ar: 'مجموعة فرعون للإقامة', legal: 'Pharaoh Stays Hotels Management', slug: 'pharaoh-stays', country: 'EG', city: 'Cairo', currency: 'EGP', status: 'active', kyc: 'approved', services: ['hotel'], domain: 'pharaohstays' },
  { key: 'cairovisa', type: 'supplier', en: 'Cairo Visa Desk', ar: 'مكتب القاهرة للتأشيرات', legal: 'Cairo Visa Desk Services', slug: 'cairo-visa-desk', country: 'EG', city: 'Cairo', currency: 'EGP', status: 'active', kyc: 'approved', services: ['visa'], domain: 'cairovisa' },
  { key: 'makkah', type: 'supplier', en: 'Makkah Gateway Services', ar: 'بوابة مكة للخدمات', legal: 'Makkah Gateway Pilgrim Services Est.', slug: 'makkah-gateway', country: 'SA', city: 'Makkah', currency: 'SAR', status: 'active', kyc: 'approved', services: ['umrah', 'hotel', 'transfer'], domain: 'makkahgateway' },
  { key: 'desert', type: 'supplier', en: 'Desert Pulse Adventures', ar: 'ديزرت بالس للمغامرات', legal: 'Desert Pulse Adventures', slug: 'desert-pulse', country: 'EG', city: 'Hurghada', currency: 'EGP', status: 'active', kyc: 'approved', services: ['activity', 'tour'], domain: 'desertpulse' },
  { key: 'blueline', type: 'supplier', en: 'Blue Line Transfers', ar: 'بلو لاين للنقل', legal: 'Blue Line Land Transport', slug: 'blue-line-transfers', country: 'EG', city: 'Cairo', currency: 'EGP', status: 'active', kyc: 'approved', services: ['transfer'], domain: 'bluelinetransfers' },
  { key: 'skybridge', type: 'supplier', en: 'SkyBridge Ticketing', ar: 'سكاي بريدج لحجز الطيران', legal: 'SkyBridge Air Ticketing', slug: 'skybridge-ticketing', country: 'EG', city: 'Cairo', currency: 'EGP', status: 'active', kyc: 'approved', services: ['flight'], domain: 'skybridge' },
];

/** Role templates seeded per organization. */
function templatesFor(org: OrgSeed): RoleTemplateKey[] {
  if (org.type === 'platform') return ['super_admin', 'compliance_ops'];
  if (org.type === 'supplier') return ['supplier_admin', 'supplier_staff'];
  if (org.parent) return ['sub_agent_owner', 'sales_agent'];
  return ['agency_owner', 'sales_agent', 'operations', 'accountant'];
}

/** Named demo accounts — one per role (MOCK_DATA_ARCHITECTURE §4). Password for all: Demo@1234. */
export const DEMO_ACCOUNTS: { email: string; name: string; org: string; role: RoleTemplateKey | 'customer'; also?: [org: string, role: RoleTemplateKey][] }[] = [
  { email: 'admin@travelta.demo', name: 'Hana Mostafa', org: 'platform', role: 'super_admin', also: [['direct', 'agency_owner']] },
  { email: 'compliance@travelta.demo', name: 'Youssef Kamal', org: 'platform', role: 'compliance_ops' },
  { email: 'owner@nilehorizon.demo', name: 'Ahmed Samir', org: 'nile', role: 'agency_owner' },
  { email: 'sales@nilehorizon.demo', name: 'Mariam Adel', org: 'nile', role: 'sales_agent' },
  { email: 'ops@nilehorizon.demo', name: 'Khaled Fawzy', org: 'nile', role: 'operations' },
  { email: 'accounts@nilehorizon.demo', name: 'Nadia Hassan', org: 'nile', role: 'accountant' },
  { email: 'owner@deltagate.demo', name: 'Tarek Nabil', org: 'delta', role: 'sub_agent_owner' },
  { email: 'owner@redsea.demo', name: 'Laila Mahmoud', org: 'redsea', role: 'agency_owner' },
  { email: 'owner@alnoor.demo', name: 'Ibrahim Saleh', org: 'alnoor', role: 'agency_owner' },
  { email: 'owner@sunrise.demo', name: 'Mona Farouk', org: 'sunrise', role: 'agency_owner' },
  { email: 'supplier@pharaohstays.demo', name: 'Sherif Gamal', org: 'pharaoh', role: 'supplier_admin' },
  { email: 'supplier@cairovisa.demo', name: 'Rania Ezzat', org: 'cairovisa', role: 'supplier_admin' },
  { email: 'supplier@makkahgateway.demo', name: 'Abdullah Al-Harbi', org: 'makkah', role: 'supplier_admin' },
  { email: 'supplier@desertpulse.demo', name: 'Omar Zaki', org: 'desert', role: 'supplier_admin' },
  { email: 'supplier@bluelinetransfers.demo', name: 'Hany Lotfy', org: 'blueline', role: 'supplier_admin' },
  { email: 'supplier@skybridge.demo', name: 'Dina Raafat', org: 'skybridge', role: 'supplier_admin' },
  { email: 'customer@example.com', name: 'Sara Ali', org: 'direct', role: 'customer' },
  { email: 'traveller@nilehorizon.example', name: 'Hossam Adel', org: 'nile', role: 'customer' },
];

const FIRST = ['Amr', 'Noha', 'Hossam', 'Yasmin', 'Mahmoud', 'Reem', 'Karim', 'Salma', 'Walid', 'Dalia', 'Fady', 'Heba', 'Mostafa', 'Aya', 'Sameh', 'Rana', 'Islam', 'Nour', 'Adel', 'Farida', 'Ziad', 'Malak', 'Bassem', 'Jana'];
const LAST = ['Fathy', 'Hamdy', 'Saeed', 'Ragab', 'Shawky', 'Mansour', 'Helmy', 'Fouad', 'Abdelaziz', 'Morsy', 'Lotfy', 'Sabry', 'Eid', 'Rashad', 'Zaki', 'Nassar'];

/** Additional generated staff so team lists, assignment and agent reports have realistic volume. */
const EXTRA_STAFF: [org: string, role: RoleTemplateKey, count: number][] = [
  ['platform', 'compliance_ops', 2],
  ['nile', 'sales_agent', 4],
  ['nile', 'operations', 2],
  ['nile', 'accountant', 1],
  ['alnoor', 'sales_agent', 3],
  ['alnoor', 'operations', 1],
  ['alnoor', 'accountant', 1],
  ['delta', 'sales_agent', 2],
  ['redsea', 'sales_agent', 1],
  ['sunrise', 'sales_agent', 1],
  ['pharaoh', 'supplier_staff', 2],
  ['makkah', 'supplier_staff', 2],
  ['desert', 'supplier_staff', 1],
  ['blueline', 'supplier_staff', 1],
  ['skybridge', 'supplier_staff', 1],
];

export interface IdentitySeed {
  organizations: OrganizationEntity[];
  roles: RoleEntity[];
  users: UserEntity[];
  memberships: MembershipEntity[];
  /** Seed key → organization id, for later seed modules (bookings, KYC, pricing…). */
  orgIds: Record<string, string>;
}

export function seedIdentity(s: SeedContext): IdentitySeed {
  const orgIds: Record<string, string> = {};
  const organizations: OrganizationEntity[] = ORGS.map((o) => {
    const id = s.id('org');
    orgIds[o.key] = id;
    return {
      id, ...s.stamp(), type: o.type, parentId: null, name: { en: o.en, ar: o.ar }, legalName: o.legal, slug: o.slug,
      countryIso2: o.country, city: o.city, baseCurrency: o.currency, status: o.status, kycStatus: o.kyc,
      serviceTypes: o.services ?? [], isPlatformRetail: o.retail ?? false,
      contactEmail: `hello@${o.domain}.demo`, contactPhone: o.country === 'SA' ? '+966125550100' : '+20225550100',
    };
  });
  ORGS.forEach((o, i) => {
    if (o.parent) organizations[i]!.parentId = orgIds[o.parent]!;
  });

  const roles: RoleEntity[] = [];
  const roleIds: Record<string, string> = {};
  for (const o of ORGS) {
    for (const template of templatesFor(o)) {
      const id = s.id('role');
      roleIds[`${o.key}:${template}`] = id;
      const [en, ar] = ROLE_NAMES[template];
      roles.push({ id, ...s.stamp(), tenantId: orgIds[o.key]!, key: template, name: { en, ar }, isSystem: true, template, permissions: [...ROLE_TEMPLATES[template].permissions] });
    }
  }
  // Travelta Direct is run by platform staff: it also gets the agency-owner template for the super admin's second membership.
  if (!roleIds['direct:agency_owner']) throw new Error('seed: missing direct agency_owner role');

  const users: UserEntity[] = [];
  const memberships: MembershipEntity[] = [];
  const addUser = (email: string, name: string, userType: UserEntity['userType'], sellerTenantId: string | null) => {
    const user: UserEntity = {
      id: s.id('usr'), ...s.stamp(), email, name, phone: null, locale: 'en', userType, status: 'active',
      passwordHash: simHash(DEMO_PASSWORD, `s${users.length}`), sellerTenantId, lastLoginAt: null, emailVerifiedAt: s.stamp().createdAt,
    };
    users.push(user);
    return user;
  };
  const addMembership = (userId: string, orgKey: string, role: RoleTemplateKey) => {
    const roleId = roleIds[`${orgKey}:${role}`];
    if (!roleId) throw new Error(`seed: no role ${role} in ${orgKey}`);
    memberships.push({ id: s.id('mem'), ...s.stamp(), tenantId: orgIds[orgKey]!, userId, roleId, status: 'active' });
  };

  for (const a of DEMO_ACCOUNTS) {
    if (a.role === 'customer') {
      addUser(a.email, a.name, 'customer', orgIds[a.org]!);
      continue;
    }
    const u = addUser(a.email, a.name, 'staff', null);
    addMembership(u.id, a.org, a.role);
    for (const [org, role] of a.also ?? []) addMembership(u.id, org, role);
  }

  const used = new Set(users.map((u) => u.name));
  const nextName = () => {
    for (;;) {
      const n = `${s.rng.pick(FIRST)} ${s.rng.pick(LAST)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
  };
  for (const [orgKey, role, count] of EXTRA_STAFF) {
    const domain = ORGS.find((o) => o.key === orgKey)!.domain;
    for (let i = 0; i < count; i++) {
      const name = nextName();
      const u = addUser(`${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${domain}.demo`, name, 'staff', null);
      addMembership(u.id, orgKey, role);
    }
  }
  for (let i = 0; i < 12; i++) {
    const name = nextName();
    const u = addUser(`${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, name, 'customer', orgIds.direct!);
    u.phone = `+2010${String(s.rng.int(10_000_000, 99_999_999))}`;
  }

  return { organizations, roles, users, memberships, orgIds };
}
