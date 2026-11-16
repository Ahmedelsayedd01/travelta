import type { ServiceType } from '@travelta/contracts';
import { SERVICE_IMAGES, type TravelImageKey } from '@travelta/shared';

/**
 * Per-category search configuration (presentation only — prices and availability always come from `search.run`).
 * Each category declares its own fields, labels, defaults, where its showcase comes from and its photos.
 */
export interface CategoryConfig {
  /** Location field: a destination city, a flight route, or the visa's destination country. */
  location: 'destination' | 'route' | 'visaCountry';
  /** Date field(s): a stay range (hotels) or one date. */
  dates: 'range' | 'single';
  /** i18n key (search.*) for the date label. */
  dateLabel: string;
  /** People: hotel rooms, or one traveller group with these labels. */
  people: 'rooms' | 'travellers' | 'participants' | 'passengers' | 'applicants' | 'pilgrims';
  /** Nationality is required for visas (price and eligibility depend on it), optional elsewhere. */
  nationality: 'required' | 'optional' | 'hidden';
  /** Destination codes the category can be searched in (null = every active destination). */
  destinations: readonly string[] | null;
  defaultDestination: string;
  /** Live showcase: top-rated results in this destination. */
  showcaseDestination: string;
  images: readonly TravelImageKey[];
  /** Earliest bookable day relative to today (visa applications can start today; others need a day's notice). */
  minLeadDays: number;
  maxAheadDays: number;
}

export const SEARCH_CATEGORIES: ServiceType[] = ['hotel', 'flight', 'tour', 'activity', 'transfer', 'visa', 'umrah'];
export const AIRPORTS = ['CAI', 'LXR', 'ASW', 'HRG', 'SSH', 'JED', 'MED', 'RUH', 'DXB', 'IST'] as const;

export const CATEGORY_CONFIG: Record<ServiceType, CategoryConfig> = {
  hotel: { location: 'destination', dates: 'range', dateLabel: 'checkIn', people: 'rooms', nationality: 'optional', destinations: null, defaultDestination: 'CAI', showcaseDestination: 'CAI', images: SERVICE_IMAGES.hotel, minLeadDays: 0, maxAheadDays: 365 },
  flight: { location: 'route', dates: 'single', dateLabel: 'departure', people: 'passengers', nationality: 'hidden', destinations: null, defaultDestination: 'DXB', showcaseDestination: 'DXB', images: SERVICE_IMAGES.flight, minLeadDays: 1, maxAheadDays: 330 },
  tour: { location: 'destination', dates: 'single', dateLabel: 'startDate', people: 'travellers', nationality: 'hidden', destinations: null, defaultDestination: 'LXR', showcaseDestination: 'LXR', images: SERVICE_IMAGES.tour, minLeadDays: 1, maxAheadDays: 365 },
  activity: { location: 'destination', dates: 'single', dateLabel: 'date', people: 'participants', nationality: 'hidden', destinations: null, defaultDestination: 'HRG', showcaseDestination: 'HRG', images: SERVICE_IMAGES.activity, minLeadDays: 1, maxAheadDays: 365 },
  transfer: { location: 'destination', dates: 'single', dateLabel: 'date', people: 'passengers', nationality: 'hidden', destinations: null, defaultDestination: 'HRG', showcaseDestination: 'CAI', images: SERVICE_IMAGES.transfer, minLeadDays: 1, maxAheadDays: 365 },
  // Visas are sold for the UAE, Saudi Arabia and Türkiye; Umrah packages are booked to Makkah (with Madinah nights inside).
  visa: { location: 'visaCountry', dates: 'single', dateLabel: 'applicationDate', people: 'applicants', nationality: 'required', destinations: ['DXB', 'RUH', 'MKX', 'IST'], defaultDestination: 'DXB', showcaseDestination: 'DXB', images: SERVICE_IMAGES.visa, minLeadDays: 0, maxAheadDays: 180 },
  umrah: { location: 'destination', dates: 'single', dateLabel: 'departure', people: 'pilgrims', nationality: 'optional', destinations: ['MKX'], defaultDestination: 'MKX', showcaseDestination: 'MKX', images: SERVICE_IMAGES.umrah, minLeadDays: 7, maxAheadDays: 365 },
};

/** Limits on travellers per category (server allows up to 9 adults per search). */
export const PEOPLE_LIMITS = { adults: [1, 9], children: [0, 8], infants: [0, 4], rooms: [1, 5], roomAdults: [1, 6], roomChildren: [0, 4], maxNights: 30 } as const;
