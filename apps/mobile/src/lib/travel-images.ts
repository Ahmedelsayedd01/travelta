import { DESTINATION_IMAGES, imageForProduct, SERVICE_IMAGES, TRAVEL_IMAGES, type TravelImageKey } from '@travelta/shared';
import type { ImageSourcePropType } from 'react-native';

/* Metro bundles images only through static require(). */
/** Bundled 4:3 photos (assets/travel), keyed like the shared catalogue in @travelta/shared/travel-images. */
const SOURCES: Record<TravelImageKey, ImageSourcePropType> = {
  'hotel-exterior': require('../../assets/travel/hotel-exterior.jpg'),
  'hotel-pool': require('../../assets/travel/hotel-pool.jpg'),
  'hotel-lobby': require('../../assets/travel/hotel-lobby.jpg'),
  'hotel-city': require('../../assets/travel/hotel-city.jpg'),
  'hotel-beach': require('../../assets/travel/hotel-beach.jpg'),
  'flight-aircraft': require('../../assets/travel/flight-aircraft.jpg'),
  'flight-terminal': require('../../assets/travel/flight-terminal.jpg'),
  'flight-wing': require('../../assets/travel/flight-wing.jpg'),
  'tour-luxor': require('../../assets/travel/tour-luxor.jpg'),
  'tour-pyramids': require('../../assets/travel/tour-pyramids.jpg'),
  'tour-felucca': require('../../assets/travel/tour-felucca.jpg'),
  'tour-city': require('../../assets/travel/tour-city.jpg'),
  'visa-planning': require('../../assets/travel/visa-planning.jpg'),
  'umrah-kaaba': require('../../assets/travel/umrah-kaaba.jpg'),
  'activity-diving': require('../../assets/travel/activity-diving.jpg'),
  'activity-hiking': require('../../assets/travel/activity-hiking.jpg'),
  'activity-balloon': require('../../assets/travel/activity-balloon.jpg'),
  'activity-family': require('../../assets/travel/activity-family.jpg'),
  'transfer-coach': require('../../assets/travel/transfer-coach.jpg'),
  'transfer-car': require('../../assets/travel/transfer-car.jpg'),
  'dest-cairo': require('../../assets/travel/dest-cairo.jpg'),
  'dest-giza': require('../../assets/travel/dest-giza.jpg'),
  'dest-luxor': require('../../assets/travel/dest-luxor.jpg'),
  'dest-aswan': require('../../assets/travel/dest-aswan.jpg'),
  'dest-alexandria': require('../../assets/travel/dest-alexandria.jpg'),
  'dest-riyadh': require('../../assets/travel/dest-riyadh.jpg'),
  'dest-dubai': require('../../assets/travel/dest-dubai.jpg'),
  'dest-istanbul': require('../../assets/travel/dest-istanbul.jpg'),
  'hotel-room': require('../../assets/travel/hotel-room.jpg'),
  'flight-cabin': require('../../assets/travel/flight-cabin.jpg'),
  'visa-passport': require('../../assets/travel/visa-passport.jpg'),
  'visa-immigration': require('../../assets/travel/visa-immigration.jpg'),
  'umrah-haram': require('../../assets/travel/umrah-haram.jpg'),
  'umrah-clock': require('../../assets/travel/umrah-clock.jpg'),
  'umrah-madinah': require('../../assets/travel/umrah-madinah.jpg'),
  'activity-desert': require('../../assets/travel/activity-desert.jpg'),
  'transfer-van': require('../../assets/travel/transfer-van.jpg'),
  'dest-madinah': require('../../assets/travel/dest-madinah.jpg'),
  'dest-sharm': require('../../assets/travel/dest-sharm.jpg'),
  'dest-hurghada': require('../../assets/travel/dest-hurghada.jpg'),
};

export const imageSource = (key: TravelImageKey): ImageSourcePropType => SOURCES[key];
export const imageAlt = (key: TravelImageKey, locale: 'en' | 'ar'): string => TRAVEL_IMAGES[key].alt[locale];
export { DESTINATION_IMAGES, imageForProduct, SERVICE_IMAGES, type TravelImageKey };
