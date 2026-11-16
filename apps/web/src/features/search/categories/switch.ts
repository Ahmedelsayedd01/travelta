import type { ServiceType } from '@travelta/contracts';
import { addDays } from '@travelta/shared';
import { CATEGORY_CONFIG } from './config';

/** The fields of the search criteria this rule needs (structurally compatible with SearchCriteria). */
interface Switchable { serviceType: ServiceType; from: string; to: string; destinationCode: string }

/**
 * Move to another category keeping what still applies: dates (pushed forward if before the new lead time), people,
 * nationality; the destination only if the new category offers it (e.g. Umrah: Makkah / Madinah).
 */
export function switchCategory<C extends Switchable>(c: C, next: ServiceType, today: string): C {
  const cfg = CATEGORY_CONFIG[next];
  const minDate = addDays(today, cfg.minLeadDays);
  const from = c.from && c.from >= minDate ? c.from : minDate;
  const destinationCode = !c.destinationCode || (cfg.destinations && !cfg.destinations.includes(c.destinationCode)) ? cfg.defaultDestination : c.destinationCode;
  return { ...c, serviceType: next, from, to: c.to > from ? c.to : addDays(from, 3), destinationCode };
}

