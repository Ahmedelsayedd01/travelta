import type { ServiceType } from '@travelta/contracts';
import type { AgencySupplierEntity, SupplierContractEntity } from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import type { SeedContext } from './context';

/** DEMO commission % per network supplier (PRICING_ENGINE §5) — editable, not approved terms. */
const NETWORK_COMMISSION: Record<string, { pct: number; byService?: Partial<Record<ServiceType, number>> }> = {
  pharaoh: { pct: 10 },
  cairovisa: { pct: 5 },
  makkah: { pct: 8, byService: { hotel: 10, transfer: 6 } },
  desert: { pct: 12, byService: { tour: 10 } },
  blueline: { pct: 10 },
  skybridge: { pct: 3 },
};

export function seedSuppliers(s: SeedContext, orgIds: Record<string, string>) {
  const contracts: SupplierContractEntity[] = [];
  const agencySuppliers: AgencySupplierEntity[] = [];

  for (const [key, terms] of Object.entries(NETWORK_COMMISSION)) {
    contracts.push({
      id: s.id('ctr'), ...s.stamp(), tenantId: orgIds.platform!, supplier: { kind: 'network', id: orgIds[key]! },
      reference: `TRV-NET-${key.toUpperCase()}-2026`, validFrom: addDays(s.today, -180), validTo: addDays(s.today, 365),
      commissionPct: terms.pct, commissionByService: terms.byService ?? {}, payoutDays: 7, creditTerms: 'Net 7 days after service end',
      status: 'active', isDemoValue: true,
    });
  }

  const own: [name: string, services: ServiceType[], contact: string, email: string, phone: string, commission: number][] = [
    ['Golden Pyramids Hotel (direct contract)', ['hotel'], 'Reservations desk', 'reservations@goldenpyramids.demo', '+20233770100', 8],
    ['Aswan Nile Cruises Desk', ['tour', 'activity'], 'Mohamed Ezz', 'desk@aswancruises.demo', '+20973100200', 5],
    ['Alex Coach Rentals', ['transfer'], 'Fleet office', 'fleet@alexcoach.demo', '+20034800300', 0],
  ];
  for (const [name, serviceTypes, contactName, email, phone, commission] of own) {
    const supplier: AgencySupplierEntity = {
      id: s.id('asup'), ...s.stamp(), tenantId: orgIds.nile!, name, serviceTypes, contactName, email, phone, currency: 'EGP', notes: '', status: 'active',
    };
    agencySuppliers.push(supplier);
    contracts.push({
      id: s.id('ctr'), ...s.stamp(), tenantId: orgIds.nile!, supplier: { kind: 'own', id: supplier.id },
      reference: `NH-${name.slice(0, 3).toUpperCase()}-2026`, validFrom: addDays(s.today, -90), validTo: addDays(s.today, 275),
      commissionPct: commission, commissionByService: {}, payoutDays: 14, creditTerms: 'Pay on confirmation', status: 'active', isDemoValue: true,
    });
  }
  return { contracts, agencySuppliers };
}
