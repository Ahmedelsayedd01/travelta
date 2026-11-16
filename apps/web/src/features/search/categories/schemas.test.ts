import { describe, expect, it } from 'vitest';
import { searchSchemaFor, validateSearch } from './schemas';
import { switchCategory } from './switch';

const TODAY = '2026-11-17';
const base = { from: '2026-12-10', to: '2026-12-13', destinationCode: 'CAI', fromCode: 'CAI', toCode: 'DXB', nationalityIso2: '', rooms: [{ adults: 2, childAges: [] }], adults: 2, children: 0, infants: 0, customerType: 'individual', channel: 'b2c' };
const v = (service: Parameters<typeof validateSearch>[0], patch: Record<string, unknown> = {}) => validateSearch(service, TODAY, { ...base, serviceType: service, ...patch });

describe('category search schemas', () => {
  it('accepts valid criteria for every category', () => {
    expect(v('hotel')).toEqual({});
    expect(v('flight')).toEqual({});
    expect(v('tour', { destinationCode: 'LXR' })).toEqual({});
    expect(v('activity', { destinationCode: 'HRG' })).toEqual({});
    expect(v('transfer', { destinationCode: 'HRG' })).toEqual({});
    expect(v('visa', { destinationCode: 'DXB', nationalityIso2: 'EG' })).toEqual({});
    expect(v('umrah', { destinationCode: 'MKX' })).toEqual({});
  });

  it('hotels: check-out after check-in, at most 30 nights, rooms 1–5, room adults 1–6, child ages 0–17', () => {
    expect(v('hotel', { to: '2026-12-10' })).toEqual({ to: 'search.v_checkout_after' });
    expect(v('hotel', { to: '2026-12-09' })).toEqual({ to: 'search.v_checkout_after' });
    expect(v('hotel', { to: '2027-01-15' })).toEqual({ to: 'search.v_max_nights' });
    expect(v('hotel', { to: '' })).toEqual({ to: 'search.v_checkout_required' });
    expect(v('hotel', { rooms: [] })).toEqual({ rooms: 'search.v_rooms_min' });
    expect(v('hotel', { rooms: Array.from({ length: 6 }, () => ({ adults: 1, childAges: [] })) })).toEqual({ rooms: 'search.v_rooms_max' });
    expect(v('hotel', { rooms: [{ adults: 0, childAges: [] }] })).toEqual({ 'rooms.0.adults': 'search.v_adults_min' });
    expect(v('hotel', { rooms: [{ adults: 7, childAges: [] }] })).toEqual({ 'rooms.0.adults': 'search.v_room_adults_max' });
    expect(v('hotel', { rooms: [{ adults: 2, childAges: [18] }] })).toEqual({ 'rooms.0.childAges.0': 'search.v_child_age' });
  });

  it('dates: not in the past, category lead time and horizon', () => {
    expect(v('hotel', { from: '2026-11-16', to: '2026-11-18' })).toEqual({ from: 'search.v_date_past' });
    expect(v('hotel', { from: TODAY, to: '2026-11-18' })).toEqual({}); // same-day hotel check-in is allowed
    expect(v('flight', { from: TODAY })).toEqual({ from: 'search.v_date_lead' }); // flights need a day's notice
    expect(v('umrah', { destinationCode: 'MKX', from: '2026-11-20' })).toEqual({ from: 'search.v_date_lead' }); // 7 days
    expect(v('visa', { destinationCode: 'DXB', nationalityIso2: 'EG', from: '2027-06-01' })).toEqual({ from: 'search.v_date_too_far' }); // 180 days
    expect(v('tour', { destinationCode: 'LXR', from: '' })).toEqual({ from: 'search.v_date_required' });
  });

  it('flights: two different airports', () => {
    expect(v('flight', { toCode: 'CAI' })).toEqual({ toCode: 'search.v_same_airport' });
    expect(v('flight', { fromCode: '' })).toEqual({ fromCode: 'search.v_origin_required' });
  });

  it('people: whole non-negative numbers within limits; infants never outnumber adults', () => {
    expect(v('tour', { destinationCode: 'LXR', adults: 0 })).toEqual({ adults: 'search.v_adults_min' });
    expect(v('tour', { destinationCode: 'LXR', adults: 10 })).toEqual({ adults: 'search.v_adults_max' });
    expect(v('tour', { destinationCode: 'LXR', children: -1 })).toEqual({ children: 'search.v_not_negative' });
    expect(v('tour', { destinationCode: 'LXR', adults: 1.5 })).toEqual({ adults: 'search.v_whole_number' });
    expect(v('flight', { adults: 1, infants: 2 })).toEqual({ infants: 'search.v_infants_per_adult' });
  });

  it('category-specific required fields: visa nationality, Umrah city, destination', () => {
    expect(v('visa', { destinationCode: 'DXB' })).toEqual({ nationalityIso2: 'search.v_nationality_required' });
    expect(v('visa', { destinationCode: '', nationalityIso2: 'EG' })).toEqual({ destinationCode: 'search.v_country_required' });
    expect(v('visa', { destinationCode: 'CAI', nationalityIso2: 'EG' })).toEqual({ destinationCode: 'search.v_visa_country' });
    expect(v('umrah', { destinationCode: 'CAI' })).toEqual({ destinationCode: 'search.v_umrah_city' });
    expect(v('activity', { destinationCode: '' })).toEqual({ destinationCode: 'search.v_destination_required' });
    // Each category has its own schema object.
    expect(searchSchemaFor('hotel', TODAY)).not.toBe(searchSchemaFor('flight', TODAY));
  });
});

describe('switching categories', () => {
  const c = { ...base, serviceType: 'hotel' as const };
  it('keeps values that still apply and fixes the ones that do not', () => {
    const tour = switchCategory(c, 'tour', TODAY);
    expect(tour).toMatchObject({ serviceType: 'tour', from: '2026-12-10', destinationCode: 'CAI', adults: 2 });
    const umrah = switchCategory(c, 'umrah', TODAY);
    expect(umrah.destinationCode).toBe('MKX'); // Cairo is not an Umrah destination
    expect(switchCategory(c, 'visa', TODAY).destinationCode).toBe('DXB'); // no visas are sold for Cairo
    expect(switchCategory({ ...c, destinationCode: 'IST' }, 'visa', TODAY).destinationCode).toBe('IST'); // kept: Türkiye visas exist
    const soon = switchCategory({ ...c, from: TODAY, to: '2026-11-18' }, 'umrah', TODAY);
    expect(soon.from).toBe('2026-11-24'); // pushed to the 7-day lead time
    expect(soon.to > soon.from).toBe(true);
    expect(validateSearch('umrah', TODAY, soon)).toEqual({});
  });
});
