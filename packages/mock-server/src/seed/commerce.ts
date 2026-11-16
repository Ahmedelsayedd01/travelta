import type { CustomerEntity, UserEntity } from '@travelta/schemas';
import type { SeedContext } from './context';

/** Fictional end customers per agency (MOCK_DATA_ARCHITECTURE §4), plus storefront customers linked to their user. */
const AGENCY_CUSTOMERS: Record<string, [kind: CustomerEntity['kind'], name: string, email: string, phone: string, nat: string, type: CustomerEntity['customerType'], source: CustomerEntity['source'], tags: string[]][]> = {
  nile: [
    ['individual', 'Omar Hassan', 'omar.hassan@example.com', '+201001234567', 'EG', 'individual', 'walk_in', ['family']],
    ['individual', 'Mona Adel', 'mona.adel@example.com', '+201112345678', 'EG', 'vip', 'referral', ['vip', 'honeymoon']],
    ['corporate', 'Delta Petroleum Co.', 'travel@deltapetro.example.com', '+20233456789', 'EG', 'corporate', 'phone', ['corporate']],
    ['individual', 'Youssef Kamal', 'youssef.k@example.com', '+201223456789', 'EG', 'individual', 'whatsapp', []],
    ['individual', 'Laila Mahmoud', 'laila.m@example.com', '+201014567890', 'EG', 'individual', 'social', ['umrah']],
    ['individual', 'Khaled Saeed', 'khaled.saeed@example.com', '+966501234567', 'SA', 'individual', 'website', []],
  ],
  delta: [
    ['individual', 'Hany Fawzy', 'hany.fawzy@example.com', '+201005556677', 'EG', 'individual', 'walk_in', []],
    ['individual', 'Rania Samir', 'rania.samir@example.com', '+201118889900', 'EG', 'individual', 'whatsapp', ['family']],
  ],
  alnoor: [
    ['individual', 'Abdelrahman Ali', 'abdelrahman.ali@example.com', '+201006667788', 'EG', 'individual', 'walk_in', ['umrah']],
    ['individual', 'Fatma Ibrahim', 'fatma.ibrahim@example.com', '+201227778899', 'EG', 'individual', 'phone', ['umrah', 'family']],
    ['corporate', 'Alexandria Teachers Club', 'trips@alexteachers.example.com', '+20334445566', 'EG', 'corporate', 'referral', ['group']],
  ],
};

export function seedCustomers(s: SeedContext, orgIds: Record<string, string>, users: UserEntity[]): CustomerEntity[] {
  const out: CustomerEntity[] = [];
  for (const [key, list] of Object.entries(AGENCY_CUSTOMERS)) {
    for (const [kind, name, email, phone, nat, customerType, source, tags] of list) {
      out.push({ id: s.id('cus'), ...s.stamp(), tenantId: orgIds[key]!, kind, name, email, phone, nationalityIso2: nat, customerType, userId: null, source, tags, notes: '' });
    }
  }
  // Storefront customers: one customer record at the seller they registered with.
  for (const u of users.filter((x) => x.userType === 'customer' && x.sellerTenantId)) {
    out.push({
      id: s.id('cus'), ...s.stamp(), tenantId: u.sellerTenantId!, kind: 'individual', name: u.name, email: u.email, phone: u.phone ?? '',
      nationalityIso2: 'EG', customerType: 'individual', userId: u.id, source: 'storefront', tags: [], notes: '',
    });
  }
  return out;
}
