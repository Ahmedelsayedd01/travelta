import { addDays, createId, createRng, hashString } from '@travelta/shared';
import type { CountryEntity, CurrencyEntity, DestinationEntity, FxRateEntity, NationalityGroupEntity, PlaceEntity } from '@travelta/schemas';
import type { SeedContext } from './context';

export function seedCurrencies(s: SeedContext): CurrencyEntity[] {
  const rows: [CurrencyEntity['code'], string, string, string][] = [
    ['EGP', 'Egyptian Pound', 'جنيه مصري', 'E£'],
    ['USD', 'US Dollar', 'دولار أمريكي', '$'],
    ['SAR', 'Saudi Riyal', 'ريال سعودي', 'SR'],
    ['EUR', 'Euro', 'يورو', '€'],
  ];
  return rows.map(([code, en, ar, symbol]) => ({ id: s.id('cur'), ...s.stamp(), code, name: { en, ar }, symbol, exponent: 2, active: true }));
}

const COUNTRIES: [iso2: string, en: string, ar: string, natEn: string, natAr: string, dial: string][] = [
  ['EG', 'Egypt', 'مصر', 'Egyptian', 'مصري', '+20'],
  ['SA', 'Saudi Arabia', 'السعودية', 'Saudi', 'سعودي', '+966'],
  ['AE', 'United Arab Emirates', 'الإمارات', 'Emirati', 'إماراتي', '+971'],
  ['KW', 'Kuwait', 'الكويت', 'Kuwaiti', 'كويتي', '+965'],
  ['QA', 'Qatar', 'قطر', 'Qatari', 'قطري', '+974'],
  ['BH', 'Bahrain', 'البحرين', 'Bahraini', 'بحريني', '+973'],
  ['OM', 'Oman', 'عُمان', 'Omani', 'عُماني', '+968'],
  ['JO', 'Jordan', 'الأردن', 'Jordanian', 'أردني', '+962'],
  ['TR', 'Türkiye', 'تركيا', 'Turkish', 'تركي', '+90'],
  ['GB', 'United Kingdom', 'المملكة المتحدة', 'British', 'بريطاني', '+44'],
  ['DE', 'Germany', 'ألمانيا', 'German', 'ألماني', '+49'],
  ['FR', 'France', 'فرنسا', 'French', 'فرنسي', '+33'],
  ['IT', 'Italy', 'إيطاليا', 'Italian', 'إيطالي', '+39'],
  ['IN', 'India', 'الهند', 'Indian', 'هندي', '+91'],
  ['PK', 'Pakistan', 'باكستان', 'Pakistani', 'باكستاني', '+92'],
  ['ID', 'Indonesia', 'إندونيسيا', 'Indonesian', 'إندونيسي', '+62'],
  ['MY', 'Malaysia', 'ماليزيا', 'Malaysian', 'ماليزي', '+60'],
  ['US', 'United States', 'الولايات المتحدة', 'American', 'أمريكي', '+1'],
];

export function seedCountries(s: SeedContext): CountryEntity[] {
  return COUNTRIES.map(([iso2, en, ar, natEn, natAr, dialCode]) => ({
    id: s.id('cty'), ...s.stamp(), iso2, name: { en, ar }, nationality: { en: natEn, ar: natAr }, dialCode,
  }));
}

export function seedNationalityGroups(s: SeedContext): NationalityGroupEntity[] {
  const groups: [string, string, string, string[]][] = [
    ['egyptians', 'Egyptians', 'المصريون', ['EG']],
    ['gcc', 'GCC nationals', 'مواطنو دول الخليج', ['SA', 'AE', 'KW', 'QA', 'BH', 'OM']],
    ['arab_other', 'Other Arab nationals', 'جنسيات عربية أخرى', ['JO']],
    ['europe_americas', 'Europe & Americas', 'أوروبا والأمريكتان', ['GB', 'DE', 'FR', 'IT', 'US', 'TR']],
    ['asia', 'Asia', 'آسيا', ['IN', 'PK', 'ID', 'MY']],
  ];
  return groups.map(([code, en, ar, countryIso2]) => ({ id: s.id('ng'), ...s.stamp(), code, name: { en, ar }, countryIso2 }));
}

const DESTINATIONS: [code: string, en: string, ar: string, iso2: string, tz: string, popular: boolean, lat: number, lng: number, zoom: number][] = [
  ['CAI', 'Cairo', 'القاهرة', 'EG', 'Africa/Cairo', true, 30.0444, 31.2357, 12],
  ['GIZ', 'Giza', 'الجيزة', 'EG', 'Africa/Cairo', false, 29.9870, 31.1700, 12],
  ['LXR', 'Luxor', 'الأقصر', 'EG', 'Africa/Cairo', true, 25.6995, 32.6420, 13],
  ['ASW', 'Aswan', 'أسوان', 'EG', 'Africa/Cairo', false, 24.0889, 32.8998, 13],
  ['HRG', 'Hurghada', 'الغردقة', 'EG', 'Africa/Cairo', true, 27.2300, 33.8250, 12],
  ['SSH', 'Sharm El Sheikh', 'شرم الشيخ', 'EG', 'Africa/Cairo', true, 27.9150, 34.3300, 12],
  ['ALY', 'Alexandria', 'الإسكندرية', 'EG', 'Africa/Cairo', false, 31.2001, 29.9187, 12],
  ['MKX', 'Makkah', 'مكة المكرمة', 'SA', 'Asia/Riyadh', true, 21.4225, 39.8262, 14],
  ['MED', 'Madinah', 'المدينة المنورة', 'SA', 'Asia/Riyadh', true, 24.4672, 39.6111, 14],
  ['RUH', 'Riyadh', 'الرياض', 'SA', 'Asia/Riyadh', false, 24.7136, 46.6753, 11],
  ['DXB', 'Dubai', 'دبي', 'AE', 'Asia/Dubai', true, 25.1972, 55.2744, 12],
  ['IST', 'Istanbul', 'إسطنبول', 'TR', 'Europe/Istanbul', true, 41.0082, 28.9784, 13],
];

export function seedDestinations(s: SeedContext): DestinationEntity[] {
  return DESTINATIONS.map(([code, en, ar, countryIso2, timezone, popular, lat, lng, zoom]) => ({
    id: s.id('dst'), ...s.stamp(), code, name: { en, ar }, countryIso2, kind: 'city', timezone, popular, geo: { lat, lng }, zoom, active: true,
  }));
}

type K = PlaceEntity['kind'];
/** Real-world approximate coordinates (DEMO content) of landmarks, airports, transit stops and neighbourhoods. */
const PLACES: Record<string, [K, string, string, number, number][]> = {
  CAI: [
    ['attraction', 'Egyptian Museum', 'المتحف المصري', 30.0478, 31.2336], ['attraction', 'Khan el-Khalili', 'خان الخليلي', 30.0477, 31.2622],
    ['attraction', 'Cairo Tower', 'برج القاهرة', 30.0459, 31.2243], ['airport', 'Cairo International Airport (CAI)', 'مطار القاهرة الدولي', 30.1219, 31.4056],
    ['transit', 'Sadat Metro Station', 'محطة مترو السادات', 30.0443, 31.2353], ['transit', 'Ramses Railway Station', 'محطة رمسيس', 30.0627, 31.2466],
    ['neighborhood', 'Downtown', 'وسط البلد', 30.0478, 31.2400], ['neighborhood', 'Zamalek', 'الزمالك', 30.0626, 31.2197], ['neighborhood', 'Garden City', 'جاردن سيتي', 30.0360, 31.2310],
  ],
  GIZ: [
    ['attraction', 'Great Pyramid of Giza', 'الهرم الأكبر', 29.9792, 31.1342], ['attraction', 'Great Sphinx', 'أبو الهول', 29.9753, 31.1376],
    ['attraction', 'Grand Egyptian Museum', 'المتحف المصري الكبير', 29.9946, 31.1196], ['airport', 'Sphinx International Airport (SPX)', 'مطار سفنكس الدولي', 30.1110, 30.8940],
    ['transit', 'Giza Metro Station', 'محطة مترو الجيزة', 30.0108, 31.2073], ['neighborhood', 'Al Haram', 'الهرم', 29.9890, 31.1600], ['neighborhood', 'Dokki', 'الدقي', 30.0385, 31.2120],
  ],
  LXR: [
    ['attraction', 'Karnak Temple', 'معبد الكرنك', 25.7188, 32.6573], ['attraction', 'Luxor Temple', 'معبد الأقصر', 25.6995, 32.6390],
    ['attraction', 'Valley of the Kings', 'وادي الملوك', 25.7402, 32.6014], ['airport', 'Luxor International Airport (LXR)', 'مطار الأقصر الدولي', 25.6710, 32.7066],
    ['transit', 'Luxor Railway Station', 'محطة قطار الأقصر', 25.6965, 32.6440], ['neighborhood', 'East Bank', 'البر الشرقي', 25.6950, 32.6450], ['neighborhood', 'West Bank', 'البر الغربي', 25.7200, 32.6100],
  ],
  ASW: [
    ['attraction', 'Philae Temple', 'معبد فيلة', 24.0256, 32.8840], ['attraction', 'Aswan High Dam', 'السد العالي', 23.9707, 32.8780],
    ['airport', 'Aswan International Airport (ASW)', 'مطار أسوان الدولي', 23.9644, 32.8200], ['transit', 'Aswan Railway Station', 'محطة قطار أسوان', 24.0960, 32.9040],
    ['neighborhood', 'Elephantine Island', 'جزيرة الفنتين', 24.0870, 32.8880], ['neighborhood', 'Corniche', 'الكورنيش', 24.0900, 32.8970],
  ],
  HRG: [
    ['attraction', 'Hurghada Marina', 'مارينا الغردقة', 27.2290, 33.8420], ['attraction', 'Giftun Island', 'جزيرة الجفتون', 27.2050, 33.9500],
    ['airport', 'Hurghada International Airport (HRG)', 'مطار الغردقة الدولي', 27.1783, 33.7994], ['transit', 'El Dahar Bus Station', 'موقف الدهار', 27.2570, 33.8120],
    ['neighborhood', 'Sekalla', 'السقالة', 27.2350, 33.8380], ['neighborhood', 'El Dahar', 'الدهار', 27.2600, 33.8150],
  ],
  SSH: [
    ['attraction', 'Ras Mohammed National Park', 'محمية رأس محمد', 27.7333, 34.2500], ['attraction', 'SOHO Square', 'سوهو سكوير', 27.9750, 34.4140],
    ['attraction', 'Old Market', 'السوق القديم', 27.8607, 34.2870], ['airport', 'Sharm El Sheikh International Airport (SSH)', 'مطار شرم الشيخ الدولي', 27.9773, 34.3950],
    ['transit', 'Naama Bay Bus Stop', 'موقف خليج نعمة', 27.9130, 34.3270], ['neighborhood', 'Naama Bay', 'خليج نعمة', 27.9126, 34.3290], ['neighborhood', 'Nabq Bay', 'خليج نبق', 28.0000, 34.4300],
  ],
  ALY: [
    ['attraction', 'Bibliotheca Alexandrina', 'مكتبة الإسكندرية', 31.2089, 29.9092], ['attraction', 'Citadel of Qaitbay', 'قلعة قايتباي', 31.2140, 29.8856],
    ['airport', 'Borg El Arab Airport (HBE)', 'مطار برج العرب', 30.9177, 29.6964], ['transit', 'Misr Railway Station', 'محطة مصر', 31.1925, 29.9050],
    ['neighborhood', 'Stanley', 'ستانلي', 31.2365, 29.9480], ['neighborhood', 'Raml Station', 'محطة الرمل', 31.2015, 29.9040],
  ],
  MKX: [
    ['attraction', 'Masjid al-Haram', 'المسجد الحرام', 21.4225, 39.8262], ['attraction', 'Abraj Al Bait (Clock Tower)', 'أبراج البيت', 21.4189, 39.8257],
    ['attraction', 'Jabal al-Nour', 'جبل النور', 21.4576, 39.8613], ['airport', 'King Abdulaziz International Airport (JED)', 'مطار الملك عبدالعزيز الدولي', 21.6796, 39.1565],
    ['transit', 'Haramain Railway — Makkah Station', 'محطة قطار الحرمين — مكة', 21.3880, 39.8580], ['neighborhood', 'Ajyad', 'أجياد', 21.4150, 39.8280], ['neighborhood', 'Al Aziziyah', 'العزيزية', 21.4030, 39.8670],
  ],
  MED: [
    ['attraction', "Al-Masjid an-Nabawi (Prophet's Mosque)", 'المسجد النبوي', 24.4672, 39.6111], ['attraction', 'Quba Mosque', 'مسجد قباء', 24.4393, 39.6170],
    ['airport', 'Prince Mohammad bin Abdulaziz Airport (MED)', 'مطار الأمير محمد بن عبدالعزيز', 24.5534, 39.7051], ['transit', 'Haramain Railway — Madinah Station', 'محطة قطار الحرمين — المدينة', 24.5530, 39.5560],
    ['neighborhood', 'Central Area', 'المنطقة المركزية', 24.4690, 39.6100], ['neighborhood', 'Quba', 'قباء', 24.4400, 39.6150],
  ],
  RUH: [
    ['attraction', 'Kingdom Centre', 'برج المملكة', 24.7114, 46.6744], ['attraction', 'Masmak Fortress', 'قصر المصمك', 24.6312, 46.7134],
    ['airport', 'King Khalid International Airport (RUH)', 'مطار الملك خالد الدولي', 24.9578, 46.6988], ['transit', 'KAFD Metro Station', 'محطة مترو المركز المالي', 24.7630, 46.6400],
    ['neighborhood', 'Olaya', 'العليا', 24.6950, 46.6850], ['neighborhood', 'Al Malqa', 'الملقا', 24.8100, 46.6100],
  ],
  DXB: [
    ['attraction', 'Burj Khalifa', 'برج خليفة', 25.1972, 55.2744], ['attraction', 'The Dubai Mall', 'دبي مول', 25.1985, 55.2796], ['attraction', 'Dubai Frame', 'برواز دبي', 25.2356, 55.3003],
    ['airport', 'Dubai International Airport (DXB)', 'مطار دبي الدولي', 25.2532, 55.3657], ['transit', 'Burj Khalifa/Dubai Mall Metro Station', 'محطة مترو برج خليفة', 25.2013, 55.2697],
    ['neighborhood', 'Downtown Dubai', 'وسط مدينة دبي', 25.1950, 55.2780], ['neighborhood', 'Business Bay', 'الخليج التجاري', 25.1860, 55.2650], ['neighborhood', 'Deira', 'ديرة', 25.2700, 55.3100],
  ],
  IST: [
    ['attraction', 'Hagia Sophia', 'آيا صوفيا', 41.0086, 28.9802], ['attraction', 'Blue Mosque', 'المسجد الأزرق', 41.0054, 28.9768], ['attraction', 'Grand Bazaar', 'البازار الكبير', 41.0107, 28.9681],
    ['airport', 'Istanbul Airport (IST)', 'مطار إسطنبول', 41.2753, 28.7519], ['transit', 'Sultanahmet Tram Stop', 'محطة ترام السلطان أحمد', 41.0058, 28.9757],
    ['neighborhood', 'Sultanahmet', 'السلطان أحمد', 41.0055, 28.9770], ['neighborhood', 'Beyoğlu', 'بيوغلو', 41.0369, 28.9850], ['neighborhood', 'Sirkeci', 'سركجي', 41.0150, 28.9770],
  ],
};

/**
 * Places use their own random source and clock tick so adding them never shifts the ids or values of the rest of the
 * seed (which keeps earlier deterministic expectations valid).
 */
export function seedPlaces(seed: number, anchor: number, destinations: DestinationEntity[]): PlaceEntity[] {
  const rng = createRng(hashString(`places:${seed}`));
  const at = new Date(anchor - 20_000_000).toISOString();
  let tick = 0;
  return destinations.flatMap((d) => (PLACES[d.code] ?? []).map(([kind, en, ar, lat, lng]) => ({
    id: createId('plc', anchor - 20_000_000 + tick++, rng.next), createdAt: at, updatedAt: at, version: 1,
    destinationId: d.id, kind, name: { en, ar }, geo: { lat, lng }, active: true,
  })));
}

/** DEMO rates to EGP (latest day). History walks backwards with small deterministic drift. */
export const DEMO_RATES_TO_EGP = { USD: 48.5, SAR: 12.93, EUR: 52.8 } as const;
export const FX_HISTORY_DAYS = 90;

export function seedFxRates(s: SeedContext): FxRateEntity[] {
  const out: FxRateEntity[] = [];
  for (const [base, latest] of Object.entries(DEMO_RATES_TO_EGP) as [keyof typeof DEMO_RATES_TO_EGP, number][]) {
    let rate = latest;
    for (let back = 0; back <= FX_HISTORY_DAYS; back++) {
      const date = addDays(s.today, -back);
      out.push({ id: s.id('fx'), ...s.stamp(), base, quote: 'EGP', rate: Math.round(rate * 10_000) / 10_000, date, source: 'seed', isDemoValue: true });
      rate = rate * (1 + (s.rng.next() - 0.5) * 0.006); // ±0.3% per day
    }
  }
  return out;
}
