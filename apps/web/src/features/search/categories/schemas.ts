import type { ServiceType } from '@travelta/contracts';
import { addDays } from '@travelta/shared';
import { z } from 'zod';
import { CATEGORY_CONFIG, PEOPLE_LIMITS } from './config';

/**
 * One validation schema per search category, built for "today" (the demo clock). Messages are i18n keys
 * (search.v_*) shown next to the field they belong to (`path`). Business rules:
 *  - dates: not before today + the category's lead time, not beyond its booking horizon; hotels: check-out after
 *    check-in and at most 30 nights;
 *  - people: whole, non-negative numbers inside the limits; infants never outnumber adults (one lap each);
 *  - location: required; flights need two different airports; Umrah only Makkah or Madinah;
 *  - visas: the applicant's nationality is required.
 */
const roomSchema = z.object({
  adults: z.number().int().min(PEOPLE_LIMITS.roomAdults[0], { error: 'search.v_adults_min' }).max(PEOPLE_LIMITS.roomAdults[1], { error: 'search.v_room_adults_max' }),
  childAges: z.array(z.number().int().min(0).max(17, { error: 'search.v_child_age' })).max(PEOPLE_LIMITS.roomChildren[1], { error: 'search.v_children_max' }),
});

export function searchSchemaFor(service: ServiceType, today: string) {
  const cfg = CATEGORY_CONFIG[service];
  const minDate = addDays(today, cfg.minLeadDays);
  const maxDate = addDays(today, cfg.maxAheadDays);
  const date = z.string().min(1, { error: 'search.v_date_required' }).regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'search.v_date_required' })
    .refine((d) => d >= minDate, { error: cfg.minLeadDays === 0 ? 'search.v_date_past' : 'search.v_date_lead' })
    .refine((d) => d <= maxDate, { error: 'search.v_date_too_far' });
  const people = {
    adults: z.number().int({ error: 'search.v_whole_number' }).min(PEOPLE_LIMITS.adults[0], { error: 'search.v_adults_min' }).max(PEOPLE_LIMITS.adults[1], { error: 'search.v_adults_max' }),
    children: z.number().int({ error: 'search.v_whole_number' }).min(0, { error: 'search.v_not_negative' }).max(PEOPLE_LIMITS.children[1], { error: 'search.v_children_max' }),
    infants: z.number().int({ error: 'search.v_whole_number' }).min(0, { error: 'search.v_not_negative' }).max(PEOPLE_LIMITS.infants[1], { error: 'search.v_infants_max' }),
  };
  const base = z.object({
    serviceType: z.literal(service),
    from: date,
    to: z.string(),
    destinationCode: z.string(),
    fromCode: z.string(),
    toCode: z.string(),
    nationalityIso2: z.string(),
    rooms: z.array(roomSchema),
    ...people,
  }).passthrough();

  return base.superRefine((c, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: path.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)), message });
    // Location
    if (cfg.location === 'route') {
      if (!c.fromCode) issue('fromCode', 'search.v_origin_required');
      if (!c.toCode) issue('toCode', 'search.v_destination_required');
      if (c.fromCode && c.fromCode === c.toCode) issue('toCode', 'search.v_same_airport');
    } else {
      if (!c.destinationCode) issue('destinationCode', cfg.location === 'visaCountry' ? 'search.v_country_required' : 'search.v_destination_required');
      else if (cfg.destinations && !cfg.destinations.includes(c.destinationCode)) issue('destinationCode', service === 'umrah' ? 'search.v_umrah_city' : 'search.v_visa_country');
    }
    // Dates
    if (cfg.dates === 'range') {
      if (!c.to) issue('to', 'search.v_checkout_required');
      else if (c.to <= c.from) issue('to', 'search.v_checkout_after');
      else if (c.to > addDays(c.from, PEOPLE_LIMITS.maxNights)) issue('to', 'search.v_max_nights');
    }
    // People
    if (cfg.people === 'rooms') {
      if (c.rooms.length < PEOPLE_LIMITS.rooms[0]) issue('rooms', 'search.v_rooms_min');
      if (c.rooms.length > PEOPLE_LIMITS.rooms[1]) issue('rooms', 'search.v_rooms_max');
    } else if (c.infants > c.adults) issue('infants', 'search.v_infants_per_adult');
    // Nationality
    if (cfg.nationality === 'required' && !c.nationalityIso2) issue('nationalityIso2', 'search.v_nationality_required');
  });
}

export type FieldErrors = Record<string, string>;

/** Field path → first message key, for the given category and day. */
export function validateSearch(service: ServiceType, today: string, criteria: unknown): FieldErrors {
  const r = searchSchemaFor(service, today).safeParse(criteria);
  if (r.success) return {};
  const out: FieldErrors = {};
  for (const i of r.error.issues) { const k = i.path.join('.'); if (!(k in out)) out[k] = i.message; }
  return out;
}
