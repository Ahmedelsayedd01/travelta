import type { CurrencyCode, ServiceType } from '@travelta/contracts';
import { nearest, scatterAround } from '@travelta/domain';
import type { AgencySupplierEntity, CancellationPolicy, DestinationEntity, PlaceEntity, ProductDetails, ProductDetailsInput, ProductEntity, RateUnit } from '@travelta/schemas';
import { addDays } from '@travelta/shared';
import type { SeedContext } from './context';

const L = (en: string, ar: string) => ({ en, ar });
const POLICY: Record<string, CancellationPolicy> = {
  hotel: { nonRefundable: false, rules: [{ daysBefore: 14, feeType: 'percent', value: 0 }, { daysBefore: 7, feeType: 'percent', value: 50 }, { daysBefore: 0, feeType: 'percent', value: 100 }] },
  hotelNr: { nonRefundable: true, rules: [] },
  tour: { nonRefundable: false, rules: [{ daysBefore: 2, feeType: 'percent', value: 0 }, { daysBefore: 0, feeType: 'percent', value: 100 }] },
  flight: { nonRefundable: false, rules: [{ daysBefore: 0, feeType: 'fixed', value: 750 }] },
  visa: { nonRefundable: true, rules: [] },
  umrah: { nonRefundable: false, rules: [{ daysBefore: 30, feeType: 'percent', value: 10 }, { daysBefore: 14, feeType: 'percent', value: 50 }, { daysBefore: 0, feeType: 'percent', value: 100 }] },
  activity: { nonRefundable: false, rules: [{ daysBefore: 1, feeType: 'percent', value: 0 }, { daysBefore: 0, feeType: 'percent', value: 100 }] },
  transfer: { nonRefundable: false, rules: [{ daysBefore: 1, feeType: 'percent', value: 0 }, { daysBefore: 0, feeType: 'percent', value: 50 }] },
};

export interface CatalogSeedRefs {
  orgIds: Record<string, string>;
  destinations: DestinationEntity[];
  agencySuppliers: AgencySupplierEntity[];
  places: PlaceEntity[];
}

export function seedCatalog(s: SeedContext, refs: CatalogSeedRefs): ProductEntity[] {
  const dest = (code: string) => refs.destinations.find((d) => d.code === code)!.id;
  const products: ProductEntity[] = [];
  const unit = (patch: Partial<RateUnit> & Pick<RateUnit, 'name' | 'baseNetMinor'>, policy: CancellationPolicy): RateUnit => ({
    id: s.id('unit'), childNetMinor: null, weekendUpliftPct: 0, defaultAllotment: 10, minStay: 1, policy, mealPlan: null, maxAdults: null, maxChildren: null, times: [], weekdays: [], ...patch,
  });
  const add = (o: {
    owner: string; supplier: ProductEntity['supplier']; source?: ProductEntity['source']; serviceType: ServiceType; name: { en: string; ar: string };
    description: { en: string; ar: string }; destination: string; currency: CurrencyCode; details: ProductDetailsInput; units: RateUnit[]; seasons?: ProductEntity['seasons'];
  }) => {
    const details = o.details.serviceType === 'hotel' ? withLocation(refs, o.destination, o.name.en, o.details) : (o.details as ProductDetails);
    products.push({
      id: s.id('prd'), ...s.stamp(), ownerTenantId: o.owner, serviceType: o.serviceType, source: o.source ?? 'extranet', supplier: o.supplier,
      name: o.name, description: o.description, destinationId: dest(o.destination), currency: o.currency, rating: Math.round((3.8 + s.rng.next() * 1.2) * 10) / 10,
      reviews: s.rng.int(12, 900), imageSeed: s.rng.int(0, 999), status: 'live', details, units: o.units, seasons: o.seasons ?? [],
    });
  };
  const winter = [{ from: addDays(s.today, 30), to: addDays(s.today, 50), upliftPct: 40, name: 'Winter holidays' }];
  const ramadan = [{ from: addDays(s.today, 80), to: addDays(s.today, 110), upliftPct: 60, name: 'Ramadan' }];

  // ---- Hotels: Pharaoh Stays (network, Egypt, EGP) -------------------------------------------------------------
  const pharaoh = { kind: 'network' as const, id: refs.orgIds.pharaoh! };
  const egHotels: [string, string, string, number, number][] = [
    ['Nile Pearl Hotel', 'فندق لؤلؤة النيل', 'CAI', 5, 5200], ['Cairo Downtown Grand', 'جراند وسط القاهرة', 'CAI', 4, 3100], ['Zamalek Garden Hotel', 'فندق حديقة الزمالك', 'CAI', 4, 3400],
    ['Giza Pyramids View Inn', 'نُزل إطلالة الأهرامات', 'GIZ', 4, 2900], ['Luxor Temple Gardens', 'حدائق معبد الأقصر', 'LXR', 5, 4100], ['Luxor West Bank Lodge', 'نُزل البر الغربي', 'LXR', 3, 1800],
    ['Aswan Cataract Bay', 'خليج الشلال أسوان', 'ASW', 5, 4600], ['Aswan Nubian House', 'البيت النوبي أسوان', 'ASW', 3, 1700], ['Hurghada Coral Resort', 'منتجع المرجان الغردقة', 'HRG', 5, 3900],
    ['Hurghada Marina Lodge', 'نُزل مارينا الغردقة', 'HRG', 4, 2600], ['Sharm Reef Oasis', 'واحة الشعاب شرم الشيخ', 'SSH', 5, 4300], ['Sharm Naama Palms', 'نخيل نعمة شرم الشيخ', 'SSH', 4, 2800],
    ['Alexandria Corniche Suites', 'أجنحة كورنيش الإسكندرية', 'ALY', 4, 3000], ['Alexandria Sea Breeze', 'نسيم البحر الإسكندرية', 'ALY', 3, 1900],
  ];
  for (const [en, ar, code, stars, base] of egHotels) {
    add({
      owner: refs.orgIds.pharaoh!, supplier: pharaoh, serviceType: 'hotel', name: L(en, ar), destination: code, currency: 'EGP', seasons: winter,
      description: L(`${stars}-star stay in ${code === 'GIZ' ? 'Giza' : en.split(' ')[0]} with breakfast options and flexible rooms.`, `إقامة ${stars} نجوم مع خيارات الإفطار وغرف مرنة.`),
      details: { serviceType: 'hotel', stars, address: `${s.rng.int(1, 99)} Corniche St.`, amenities: s.rng.shuffle(['wifi', 'pool', 'spa', 'gym', 'parking', 'restaurant', 'beach', 'airport_shuttle']).slice(0, s.rng.int(3, 6)), checkIn: '14:00', checkOut: '12:00' },
      units: [
        unit({ name: L('Standard room · Bed & breakfast', 'غرفة قياسية · مع الإفطار'), baseNetMinor: base * 100, mealPlan: 'BB', maxAdults: 2, maxChildren: 1, weekendUpliftPct: 15, defaultAllotment: s.rng.int(6, 14), childNetMinor: Math.round(base * 0.3) * 100 }, POLICY.hotel!),
        unit({ name: L('Deluxe room · Half board', 'غرفة ديلوكس · نصف إقامة'), baseNetMinor: Math.round(base * 1.45) * 100, mealPlan: 'HB', maxAdults: 3, maxChildren: 2, weekendUpliftPct: 15, defaultAllotment: s.rng.int(3, 8), childNetMinor: Math.round(base * 0.4) * 100 }, POLICY.hotel!),
        ...(stars >= 5 ? [unit({ name: L('Suite · Non-refundable', 'جناح · غير قابل للاسترداد'), baseNetMinor: Math.round(base * 2.3) * 100, mealPlan: 'BB', maxAdults: 4, maxChildren: 2, weekendUpliftPct: 10, defaultAllotment: 2, minStay: 2 }, POLICY.hotelNr!)] : []),
      ],
    });
  }

  // ---- Hotels: Makkah Gateway (network, KSA, SAR) --------------------------------------------------------------
  const makkah = { kind: 'network' as const, id: refs.orgIds.makkah! };
  const ksaHotels: [string, string, string, number, number][] = [
    ['Haram View Tower', 'برج إطلالة الحرم', 'MKX', 5, 1450], ['Ajyad Gate Hotel', 'فندق بوابة أجياد', 'MKX', 4, 780], ['Ibrahim Khalil Suites', 'أجنحة إبراهيم الخليل', 'MKX', 4, 690],
    ['Misfalah Comfort Inn', 'نُزل راحة المسفلة', 'MKX', 3, 380], ['Madinah Rawdah Hotel', 'فندق الروضة المدينة', 'MED', 5, 1100], ['Quba Garden Hotel', 'فندق حديقة قباء', 'MED', 3, 420],
  ];
  for (const [en, ar, code, stars, base] of ksaHotels) {
    add({
      owner: refs.orgIds.makkah!, supplier: makkah, serviceType: 'hotel', name: L(en, ar), destination: code, currency: 'SAR', seasons: ramadan,
      description: L(`${stars}-star hotel minutes from the Haram.`, `فندق ${stars} نجوم على بعد دقائق من الحرم.`),
      details: { serviceType: 'hotel', stars, address: code === 'MKX' ? 'Ibrahim Al Khalil Rd.' : 'King Fahd Rd.', amenities: ['wifi', 'restaurant', 'prayer_room', 'shuttle'], checkIn: '16:00', checkOut: '12:00' },
      units: [
        unit({ name: L('Double room · Room only', 'غرفة مزدوجة · بدون وجبات'), baseNetMinor: base * 100, mealPlan: 'RO', maxAdults: 2, maxChildren: 1, defaultAllotment: 12 }, POLICY.hotel!),
        unit({ name: L('Quad room · Breakfast', 'غرفة رباعية · مع الإفطار'), baseNetMinor: Math.round(base * 1.6) * 100, mealPlan: 'BB', maxAdults: 4, maxChildren: 2, defaultAllotment: 8 }, POLICY.hotel!),
      ],
    });
  }

  // ---- Nile Horizon own extranet hotel (direct contract) -------------------------------------------------------
  const golden = refs.agencySuppliers.find((a) => a.name.startsWith('Golden Pyramids'))!;
  add({
    owner: refs.orgIds.nile!, supplier: { kind: 'own', id: golden.id }, serviceType: 'hotel', name: L('Golden Pyramids Hotel', 'فندق الأهرامات الذهبية'), destination: 'GIZ', currency: 'EGP',
    description: L('Direct contract — Pyramids-facing rooms with breakfast.', 'عقد مباشر — غرف مطلة على الأهرامات مع الإفطار.'),
    details: { serviceType: 'hotel', stars: 4, address: 'Al Haram St.', amenities: ['wifi', 'pool', 'restaurant'], checkIn: '14:00', checkOut: '12:00' },
    units: [unit({ name: L('Pyramids view · Bed & breakfast', 'إطلالة الأهرامات · مع الإفطار'), baseNetMinor: 260_000, mealPlan: 'BB', maxAdults: 3, maxChildren: 1, weekendUpliftPct: 10, defaultAllotment: 6 }, POLICY.hotel!)],
  });

  // ---- Tours ----------------------------------------------------------------------------------------------------
  const desert = { kind: 'network' as const, id: refs.orgIds.desert! };
  const tour = (owner: string, supplier: ProductEntity['supplier'], en: string, ar: string, code: string, days: number, adult: number, itinerary: [string, string][]) =>
    add({
      owner, supplier, serviceType: 'tour', name: L(en, ar), destination: code, currency: 'EGP',
      description: L(`${days > 1 ? `${days}-day` : 'Full-day'} guided tour with transport and entry fees.`, `جولة بمرشد ${days > 1 ? `لمدة ${days} أيام` : 'ليوم كامل'} شاملة النقل ورسوم الدخول.`),
      details: { serviceType: 'tour', durationDays: days, tourType: days > 1 ? 'multi_day' : 'day', itinerary: itinerary.map(([e, a]) => L(e, a)), inclusions: [L('Licensed guide', 'مرشد مرخص'), L('Air-conditioned transport', 'نقل مكيف')], exclusions: [L('Tips', 'الإكراميات')], transport: 'coach' },
      units: [unit({ name: L('Shared group', 'مجموعة مشتركة'), baseNetMinor: adult * 100, childNetMinor: Math.round(adult * 0.6) * 100, defaultAllotment: 24, times: ['07:30'], weekdays: days > 1 ? [1, 4] : [] }, POLICY.tour!),
        unit({ name: L('Private tour', 'جولة خاصة'), baseNetMinor: Math.round(adult * 1.8) * 100, childNetMinor: Math.round(adult * 1.1) * 100, defaultAllotment: 4, times: ['08:00'] }, POLICY.tour!)],
    });
  tour(refs.orgIds.desert!, desert, 'Pyramids, Sphinx & Grand Museum', 'الأهرامات وأبو الهول والمتحف الكبير', 'GIZ', 1, 1450, [['Giza Plateau', 'هضبة الجيزة'], ['Grand Egyptian Museum', 'المتحف المصري الكبير']]);
  tour(refs.orgIds.desert!, desert, 'Luxor East & West Bank', 'البر الشرقي والغربي بالأقصر', 'LXR', 1, 1250, [['Karnak Temple', 'معبد الكرنك'], ['Valley of the Kings', 'وادي الملوك']]);
  tour(refs.orgIds.desert!, desert, 'Aswan Philae & High Dam', 'معبد فيلة والسد العالي', 'ASW', 1, 950, [['High Dam', 'السد العالي'], ['Philae Temple', 'معبد فيلة']]);
  tour(refs.orgIds.desert!, desert, 'Nile Cruise Luxor–Aswan', 'رحلة نيلية الأقصر–أسوان', 'LXR', 4, 11800, [['Embark in Luxor', 'الصعود في الأقصر'], ['Edfu & Kom Ombo', 'إدفو وكوم أمبو'], ['Aswan', 'أسوان']]);
  tour(refs.orgIds.desert!, desert, 'Red Sea Island Hopping', 'جولة جزر البحر الأحمر', 'HRG', 1, 1100, [['Giftun Island', 'جزيرة الجفتون'], ['Orange Bay', 'أورانج باي']]);
  tour(refs.orgIds.desert!, desert, 'Ras Mohammed Snorkel Day', 'يوم غطس رأس محمد', 'SSH', 1, 1350, [['Ras Mohammed', 'رأس محمد']]);
  const aswanDesk = refs.agencySuppliers.find((a) => a.name.startsWith('Aswan'))!;
  tour(refs.orgIds.nile!, { kind: 'own', id: aswanDesk.id }, 'Abu Simbel Sunrise Trip', 'رحلة شروق أبو سمبل', 'ASW', 1, 2200, [['Abu Simbel temples', 'معابد أبو سمبل']]);
  tour(refs.orgIds.nile!, { kind: 'own', id: aswanDesk.id }, 'Felucca Aswan–Kom Ombo 2 Days', 'فلوكة أسوان–كوم أمبو يومين', 'ASW', 2, 3900, [['Sail from Aswan', 'الإبحار من أسوان'], ['Kom Ombo', 'كوم أمبو']]);
  tour(refs.orgIds.desert!, desert, 'Alexandria Classic Day', 'يوم الإسكندرية الكلاسيكي', 'ALY', 1, 1300, [['Bibliotheca Alexandrina', 'مكتبة الإسكندرية'], ['Citadel of Qaitbay', 'قلعة قايتباي']]);

  // ---- Activities (Desert Pulse) --------------------------------------------------------------------------------
  const activity = (en: string, ar: string, code: string, hours: number, adult: number, times: string[], tags: string[]) =>
    add({
      owner: refs.orgIds.desert!, supplier: desert, serviceType: 'activity', name: L(en, ar), destination: code, currency: 'EGP',
      description: L(`${hours}-hour experience with hotel pickup.`, `تجربة لمدة ${hours} ساعات مع الانتقال من الفندق.`),
      details: { serviceType: 'activity', durationHours: hours, languages: ['en', 'ar', 'de'], highlights: [L('Hotel pickup', 'الانتقال من الفندق'), L('Small groups', 'مجموعات صغيرة')], pickupPoints: ['Hotel lobby', 'Marina gate'], oldPriceMinor: Math.round(adult * 1.25) * 100, tags },
      units: [unit({ name: L('Adult & child tickets', 'تذاكر البالغين والأطفال'), baseNetMinor: adult * 100, childNetMinor: Math.round(adult * 0.5) * 100, defaultAllotment: 20, times }, POLICY.activity!)],
    });
  activity('Quad Bike Desert Sunset', 'دراجات رباعية وقت الغروب', 'HRG', 3, 850, ['14:00', '15:30'], ['adventure']);
  activity('Luxor Hot-Air Balloon', 'منطاد الأقصر', 'LXR', 3, 2900, ['05:00'], ['iconic']);
  activity('Nile Dinner Cruise', 'عشاء على النيل', 'CAI', 2.5, 1100, ['19:30', '21:30'], ['evening']);
  activity('Glass-Bottom Boat', 'قارب بقاع زجاجي', 'SSH', 2, 600, ['09:00', '11:00', '14:00'], ['family']);
  activity('Diving Try-Dive Giftun', 'تجربة غوص الجفتون', 'HRG', 6, 1900, ['08:00'], ['adventure']);
  activity('Sound & Light at the Pyramids', 'الصوت والضوء بالأهرامات', 'GIZ', 1, 700, ['18:30', '20:00'], ['evening']);
  activity('Camel Ride at Giza', 'ركوب الجمال بالجيزة', 'GIZ', 1, 450, ['08:00', '10:00', '15:00'], ['family']);
  activity('Montaza Bike & Gardens', 'جولة دراجات حدائق المنتزه', 'ALY', 2, 400, ['09:00'], ['outdoor']);

  // ---- Flights (SkyBridge, manual ticketing) --------------------------------------------------------------------
  const sky = { kind: 'network' as const, id: refs.orgIds.skybridge! };
  const flight = (carrier: string, no: string, from: string, to: string, fromCity: [string, string], toCity: [string, string], destCode: string, depart: string, mins: number, fare: number, weekdays: number[]) =>
    add({
      owner: refs.orgIds.skybridge!, supplier: sky, serviceType: 'flight', name: L(`${fromCity[0]} → ${toCity[0]} · ${no}`, `${fromCity[1]} ← ${toCity[1]} · ${no}`), destination: destCode, currency: 'EGP',
      description: L(`${carrier} ${no}, ${Math.floor(mins / 60)}h ${mins % 60}m nonstop.`, `${carrier} ${no}، رحلة مباشرة.`),
      details: { serviceType: 'flight', carrier, flightNo: no, fromCode: from, toCode: to, fromCity: L(...fromCity), toCity: L(...toCity), departTime: depart, durationMin: mins, cabin: 'economy', baggageKg: 23 },
      units: [
        unit({ name: L('Economy', 'الدرجة الاقتصادية'), baseNetMinor: fare * 100, childNetMinor: Math.round(fare * 0.75) * 100, defaultAllotment: 30, times: [depart], weekdays }, POLICY.flight!),
        unit({ name: L('Business', 'درجة رجال الأعمال'), baseNetMinor: Math.round(fare * 2.6) * 100, childNetMinor: Math.round(fare * 2) * 100, defaultAllotment: 6, times: [depart], weekdays }, POLICY.flight!),
      ],
    });
  const CAI: [string, string] = ['Cairo', 'القاهرة'];
  flight('Horizon Air Egypt', 'HE 301', 'CAI', 'JED', CAI, ['Jeddah', 'جدة'], 'MKX', '09:40', 135, 7900, []);
  flight('Horizon Air Egypt', 'HE 302', 'JED', 'CAI', ['Jeddah', 'جدة'], CAI, 'CAI', '14:10', 140, 7600, []);
  flight('Gulf Crescent Air', 'GC 118', 'CAI', 'MED', CAI, ['Madinah', 'المدينة المنورة'], 'MED', '06:55', 150, 8400, [0, 2, 4]);
  flight('Gulf Crescent Air', 'GC 221', 'CAI', 'RUH', CAI, ['Riyadh', 'الرياض'], 'RUH', '11:20', 165, 8900, []);
  flight('Red Sea Wings', 'RW 640', 'CAI', 'DXB', CAI, ['Dubai', 'دبي'], 'DXB', '16:05', 215, 9600, []);
  flight('Red Sea Wings', 'RW 712', 'CAI', 'IST', CAI, ['Istanbul', 'إسطنبول'], 'IST', '08:30', 155, 8700, [1, 3, 5]);
  flight('Horizon Air Egypt', 'HE 115', 'CAI', 'HRG', CAI, ['Hurghada', 'الغردقة'], 'HRG', '07:15', 60, 2300, []);
  flight('Horizon Air Egypt', 'HE 117', 'CAI', 'SSH', CAI, ['Sharm El Sheikh', 'شرم الشيخ'], 'SSH', '10:45', 65, 2400, []);
  flight('Horizon Air Egypt', 'HE 131', 'CAI', 'LXR', CAI, ['Luxor', 'الأقصر'], 'LXR', '06:30', 70, 2100, []);
  flight('Horizon Air Egypt', 'HE 141', 'CAI', 'ASW', CAI, ['Aswan', 'أسوان'], 'ASW', '12:20', 85, 2350, [0, 3, 5]);
  flight('Red Sea Wings', 'RW 641', 'DXB', 'CAI', ['Dubai', 'دبي'], CAI, 'CAI', '20:15', 225, 9300, []);
  flight('Red Sea Wings', 'RW 713', 'IST', 'CAI', ['Istanbul', 'إسطنبول'], CAI, 'CAI', '13:05', 150, 8500, [1, 3, 5]);

  // ---- Visas (Cairo Visa Desk) -----------------------------------------------------------------------------------
  const visaDesk = { kind: 'network' as const, id: refs.orgIds.cairovisa! };
  const visa = (en: string, ar: string, code: string, iso2: string, type: 'tourist' | 'business' | 'umrah' | 'transit', processing: number, validity: number, fee: number) =>
    add({
      owner: refs.orgIds.cairovisa!, supplier: visaDesk, serviceType: 'visa', name: L(en, ar), destination: code, currency: 'EGP',
      description: L(`Processing in about ${processing} working days. Valid ${validity} days.`, `تُنجز خلال ${processing} أيام عمل تقريبًا. صالحة ${validity} يومًا.`),
      details: { serviceType: 'visa', countryIso2: iso2, visaType: type, processingDays: processing, validityDays: validity, requiredDocs: [L('Passport valid 6+ months', 'جواز سفر ساري 6 أشهر على الأقل'), L('Personal photo', 'صورة شخصية'), L('Bank statement', 'كشف حساب بنكي')] },
      units: [unit({ name: L('Standard processing', 'معالجة عادية'), baseNetMinor: fee * 100, childNetMinor: Math.round(fee * 0.8) * 100, defaultAllotment: 200 }, POLICY.visa!),
        unit({ name: L('Express processing', 'معالجة سريعة'), baseNetMinor: Math.round(fee * 1.5) * 100, childNetMinor: Math.round(fee * 1.2) * 100, defaultAllotment: 40 }, POLICY.visa!)],
    });
  visa('Saudi Arabia tourist e-visa', 'تأشيرة سياحية للسعودية', 'RUH', 'SA', 'tourist', 5, 365, 6200);
  visa('Saudi Arabia Umrah visa', 'تأشيرة عمرة', 'MKX', 'SA', 'umrah', 7, 90, 5800);
  visa('UAE tourist visa — 30 days', 'تأشيرة سياحية للإمارات — 30 يومًا', 'DXB', 'AE', 'tourist', 4, 30, 4300);
  visa('UAE tourist visa — 90 days', 'تأشيرة سياحية للإمارات — 90 يومًا', 'DXB', 'AE', 'tourist', 6, 90, 8100);
  visa('Türkiye e-visa', 'تأشيرة إلكترونية لتركيا', 'IST', 'TR', 'tourist', 3, 180, 2900);

  // ---- Umrah packages (Makkah Gateway, SAR, per person by occupancy) --------------------------------------------
  const umrah = (en: string, ar: string, mk: [string, string], mkN: number, md: [string, string], mdN: number, flightIncl: boolean, dbl: number, seasons = ramadan) =>
    add({
      owner: refs.orgIds.makkah!, supplier: makkah, serviceType: 'umrah', name: L(en, ar), destination: 'MKX', currency: 'SAR', seasons,
      description: L(`${mkN} nights Makkah + ${mdN} nights Madinah, visa and ground transport${flightIncl ? ', flights' : ''} included.`, `${mkN} ليالٍ في مكة و${mdN} ليالٍ في المدينة، شاملة التأشيرة والنقل البري${flightIncl ? ' والطيران' : ''}.`),
      details: { serviceType: 'umrah', season: L('Year-round', 'طوال العام'), makkahHotel: L(...mk), makkahNights: mkN, madinahHotel: L(...md), madinahNights: mdN, includesFlight: flightIncl, includesVisa: true, includesTransport: true, departureCity: L('Cairo', 'القاهرة') },
      units: [
        unit({ name: L('Double room (per person)', 'غرفة مزدوجة (للفرد)'), baseNetMinor: dbl * 100, childNetMinor: Math.round(dbl * 0.7) * 100, defaultAllotment: 20, weekdays: [4] }, POLICY.umrah!),
        unit({ name: L('Triple room (per person)', 'غرفة ثلاثية (للفرد)'), baseNetMinor: Math.round(dbl * 0.85) * 100, childNetMinor: Math.round(dbl * 0.65) * 100, defaultAllotment: 20, weekdays: [4] }, POLICY.umrah!),
        unit({ name: L('Quad room (per person)', 'غرفة رباعية (للفرد)'), baseNetMinor: Math.round(dbl * 0.75) * 100, childNetMinor: Math.round(dbl * 0.6) * 100, defaultAllotment: 30, weekdays: [4] }, POLICY.umrah!),
      ],
    });
  umrah('Economy Umrah · 10 nights', 'عمرة اقتصادية · 10 ليالٍ', ['Misfalah Comfort Inn', 'نُزل راحة المسفلة'], 6, ['Quba Garden Hotel', 'فندق حديقة قباء'], 4, false, 3900);
  umrah('Comfort Umrah · 10 nights + flights', 'عمرة مريحة · 10 ليالٍ مع الطيران', ['Ajyad Gate Hotel', 'فندق بوابة أجياد'], 6, ['Madinah Rawdah Hotel', 'فندق الروضة المدينة'], 4, true, 7800);
  umrah('VIP Umrah · 7 nights', 'عمرة كبار الشخصيات · 7 ليالٍ', ['Haram View Tower', 'برج إطلالة الحرم'], 4, ['Madinah Rawdah Hotel', 'فندق الروضة المدينة'], 3, true, 12_900);
  umrah('Family Umrah · 14 nights', 'عمرة عائلية · 14 ليلة', ['Ibrahim Khalil Suites', 'أجنحة إبراهيم الخليل'], 9, ['Quba Garden Hotel', 'فندق حديقة قباء'], 5, true, 8600);
  umrah('Ramadan last ten nights', 'العشر الأواخر من رمضان', ['Haram View Tower', 'برج إطلالة الحرم'], 10, ['Madinah Rawdah Hotel', 'فندق الروضة المدينة'], 3, true, 18_500);
  umrah('Weekend Umrah · 5 nights', 'عمرة نهاية الأسبوع · 5 ليالٍ', ['Ajyad Gate Hotel', 'فندق بوابة أجياد'], 3, ['Quba Garden Hotel', 'فندق حديقة قباء'], 2, false, 3100, []);

  // ---- Transfers & buses (Blue Line) ------------------------------------------------------------------------------
  const blue = { kind: 'network' as const, id: refs.orgIds.blueline! };
  const transfer = (en: string, ar: string, code: string, from: [string, string], to: [string, string], mins: number, mode: 'private' | 'shared_bus', units: RateUnit[]) =>
    add({
      owner: refs.orgIds.blueline!, supplier: blue, serviceType: 'transfer', name: L(en, ar), destination: code, currency: 'EGP',
      description: L(`${mode === 'private' ? 'Private' : 'Shared coach'} transfer, about ${Math.round(mins / 60 * 10) / 10} h.`, `${mode === 'private' ? 'نقل خاص' : 'حافلة مشتركة'}، حوالي ${Math.round(mins / 60 * 10) / 10} ساعة.`),
      details: { serviceType: 'transfer', fromPlace: L(...from), toPlace: L(...to), durationMin: mins, mode }, units,
    });
  const vehicles = (sedan: number) => [
    unit({ name: L('Sedan · up to 3', 'سيدان · حتى 3 ركاب'), baseNetMinor: sedan * 100, defaultAllotment: 12, maxAdults: 3 }, POLICY.transfer!),
    unit({ name: L('Van · up to 7', 'فان · حتى 7 ركاب'), baseNetMinor: Math.round(sedan * 1.6) * 100, defaultAllotment: 8, maxAdults: 7 }, POLICY.transfer!),
  ];
  const seats = (seat: number, times: string[]) => [unit({ name: L('Seat', 'مقعد'), baseNetMinor: seat * 100, childNetMinor: Math.round(seat * 0.7) * 100, defaultAllotment: 45, times }, POLICY.transfer!)];
  transfer('Cairo Airport → Downtown hotels', 'مطار القاهرة ← فنادق وسط البلد', 'CAI', ['Cairo Airport', 'مطار القاهرة'], ['Downtown Cairo', 'وسط القاهرة'], 45, 'private', vehicles(650));
  transfer('Hurghada Airport → Resorts', 'مطار الغردقة ← المنتجعات', 'HRG', ['Hurghada Airport', 'مطار الغردقة'], ['Hurghada resorts', 'منتجعات الغردقة'], 25, 'private', vehicles(420));
  transfer('Sharm Airport → Naama Bay', 'مطار شرم ← خليج نعمة', 'SSH', ['Sharm Airport', 'مطار شرم الشيخ'], ['Naama Bay', 'خليج نعمة'], 20, 'private', vehicles(380));
  transfer('Luxor → Aswan by road', 'الأقصر ← أسوان برًا', 'ASW', ['Luxor', 'الأقصر'], ['Aswan', 'أسوان'], 200, 'private', vehicles(1900));
  transfer('Cairo → Alexandria coach', 'حافلة القاهرة ← الإسكندرية', 'ALY', ['Cairo (Tahrir)', 'القاهرة (التحرير)'], ['Alexandria (Sidi Gaber)', 'الإسكندرية (سيدي جابر)'], 180, 'shared_bus', seats(240, ['07:00', '11:00', '16:00']));
  transfer('Cairo → Hurghada coach', 'حافلة القاهرة ← الغردقة', 'HRG', ['Cairo (Abbassia)', 'القاهرة (العباسية)'], ['Hurghada', 'الغردقة'], 360, 'shared_bus', seats(420, ['08:00', '22:30']));

  return products;
}

/** Hotels get a deterministic position near the destination centre and the name of the closest neighbourhood. */
function withLocation(refs: CatalogSeedRefs, code: string, key: string, details: Extract<ProductDetailsInput, { serviceType: 'hotel' }>): ProductDetails {
  if (details.geo) return { ...details, geo: details.geo, neighborhood: details.neighborhood ?? null };
  const d = refs.destinations.find((x) => x.code === code)!;
  // Holy-city hotels cluster tightly around the Haram; resort towns spread along the coast.
  const radius = code === 'MKX' || code === 'MED' ? 1.2 : code === 'HRG' || code === 'SSH' ? 6 : 3.5;
  const geo = scatterAround(d.geo, key, radius);
  const hood = nearest(geo, refs.places.filter((p) => p.destinationId === d.id && p.kind === 'neighborhood'), 1)[0];
  return { ...details, geo, neighborhood: hood?.name.en ?? null };
}
