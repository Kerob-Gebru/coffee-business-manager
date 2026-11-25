export interface SimpleDate {
  year: number;
  month: number;
  day: number;
}

export interface MonthMetadata {
  number: number;
  en: string;
  am: string;
  om: string;
}

export interface EthiopianYearMonthInfo {
  month: number;
  days: number;
  startGregorian: SimpleDate;
  endGregorian: SimpleDate;
}

// JDN of Meskerem 1, Year 1 E.C. (August 29, 8 CE Julian)
export const ETHIOPIC_EPOCH = 1724221;

export const ETHIOPIAN_MONTHS: readonly MonthMetadata[] = [
  { number: 1, en: "Meskerem", am: "መስከረም", om: "Fulbaana" },
  { number: 2, en: "Tikimt", am: "ጥቅምት", om: "Onkololeessa" },
  { number: 3, en: "Hidar", am: "ኅዳር", om: "Sadaasa" },
  { number: 4, en: "Tahsas", am: "ታኅሣሥ", om: "Muddee" },
  { number: 5, en: "Tir", am: "ጥር", om: "Amajjii" },
  { number: 6, en: "Yekatit", am: "የካቲት", om: "Guraandhala" },
  { number: 7, en: "Megabit", am: "መጋቢት", om: "Bitootessa" },
  { number: 8, en: "Miazia", am: "ሚያዝያ", om: "Ebla" },
  { number: 9, en: "Ginbot", am: "ግንቦት", om: "Caamsaa" },
  { number: 10, en: "Sene", am: "ሰኔ", om: "Waxabajjii" },
  { number: 11, en: "Hamle", am: "ሐምሌ", om: "Adoolessa" },
  { number: 12, en: "Nehase", am: "ነሐሴ", om: "Hagayya" },
  { number: 13, en: "Pagume", am: "ጳጉሜ", om: "Qaammee" },
];

export const GREGORIAN_MONTHS: readonly MonthMetadata[] = [
  { number: 1, en: "January", am: "ጃንዋሪ", om: "Amajjii" },
  { number: 2, en: "February", am: "ፌብሩዋሪ", om: "Guraandhala" },
  { number: 3, en: "March", am: "ማርች", om: "Bitootessa" },
  { number: 4, en: "April", am: "ኤፕሪል", om: "Ebla" },
  { number: 5, en: "May", am: "ሜይ", om: "Caamsaa" },
  { number: 6, en: "June", am: "ጁን", om: "Waxabajjii" },
  { number: 7, en: "July", am: "ጁላይ", om: "Adoolessa" },
  { number: 8, en: "August", am: "ኦገስት", om: "Hagayya" },
  { number: 9, en: "September", am: "ሴፕቴምበር", om: "Fulbaana" },
  { number: 10, en: "October", am: "ኦክቶበር", om: "Onkololeessa" },
  { number: 11, en: "November", am: "ኖቬምበር", om: "Sadaasa" },
  { number: 12, en: "December", am: "ዲሴምበር", om: "Muddee" },
];

export const WEEKDAYS: ReadonlyArray<{ en: string; ethiopicEn: string; am: string; om: string }> = [
  { en: "Sunday", ethiopicEn: "Ehud", am: "እሑድ", om: "Dilbata" },
  { en: "Monday", ethiopicEn: "Segno", am: "ሰኞ", om: "Wiixata" },
  { en: "Tuesday", ethiopicEn: "Maksegno", am: "ማክሰኞ", om: "Kibxata" },
  { en: "Wednesday", ethiopicEn: "Rebu", am: "ረቡዕ", om: "Roobii" },
  { en: "Thursday", ethiopicEn: "Hamus", am: "ሐሙስ", om: "Kamiisa" },
  { en: "Friday", ethiopicEn: "Arb", am: "ዓርብ", om: "Jimaata" },
  { en: "Saturday", ethiopicEn: "Kidame", am: "ቅዳሜ", om: "Sanbata" },
];

export function isGregorianLeapYear(year: number): boolean {
  if (!Number.isInteger(year)) return false;
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInGregorianMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return 0;
  if (month === 2) return isGregorianLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isEthiopianLeapYear(year: number): boolean {
  if (!Number.isInteger(year)) return false;
  return (((year % 4) + 4) % 4) === 3;
}

export function daysInEthiopianMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 13) return 0;
  if (month === 13) return isEthiopianLeapYear(year) ? 6 : 5;
  return 30;
}

export function isValidGregorianDate(date: SimpleDate): boolean {
  if (!Number.isInteger(date.year) || date.year < 1 || date.year > 9999) return false;
  const maxDays = daysInGregorianMonth(date.year, date.month);
  return maxDays > 0 && Number.isInteger(date.day) && date.day >= 1 && date.day <= maxDays;
}

export function isValidEthiopianDate(date: SimpleDate): boolean {
  if (!Number.isInteger(date.year) || date.year < 1 || date.year > 9999) return false;
  const maxDays = daysInEthiopianMonth(date.year, date.month);
  return maxDays > 0 && Number.isInteger(date.day) && date.day >= 1 && date.day <= maxDays;
}

export function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

export function jdnToGregorian(jdn: number): SimpleDate {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

export function ethiopianToJdn(year: number, month: number, day: number): number {
  return (
    ETHIOPIC_EPOCH +
    365 * (year - 1) +
    Math.floor(year / 4) +
    30 * (month - 1) +
    (day - 1)
  );
}

export function jdnToEthiopian(jdn: number): SimpleDate {
  const daysSinceEpoch = jdn - ETHIOPIC_EPOCH;
  const cycle = Math.floor(daysSinceEpoch / 1461);
  const r = daysSinceEpoch - cycle * 1461;

  let cycleYear: number;
  let dayOfYear: number;
  if (r < 365) {
    cycleYear = 0;
    dayOfYear = r;
  } else if (r < 730) {
    cycleYear = 1;
    dayOfYear = r - 365;
  } else if (r < 1096) {
    cycleYear = 2;
    dayOfYear = r - 730;
  } else {
    cycleYear = 3;
    dayOfYear = r - 1096;
  }

  const year = 4 * cycle + cycleYear + 1;
  const month = Math.floor(dayOfYear / 30) + 1;
  const day = (dayOfYear % 30) + 1;
  return { year, month, day };
}

export function gregorianToEthiopian(date: SimpleDate): SimpleDate | null {
  if (!isValidGregorianDate(date)) return null;
  const jdn = gregorianToJdn(date.year, date.month, date.day);
  return jdnToEthiopian(jdn);
}

export function ethiopianToGregorian(date: SimpleDate): SimpleDate | null {
  if (!isValidEthiopianDate(date)) return null;
  const jdn = ethiopianToJdn(date.year, date.month, date.day);
  return jdnToGregorian(jdn);
}

export function weekdayIndexFromJdn(jdn: number): number {
  return (((jdn + 1) % 7) + 7) % 7;
}

export function parseIsoDate(iso: string): SimpleDate | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return { year, month, day };
}

export function formatIsoDate(date: SimpleDate): string {
  const y = String(date.year).padStart(4, "0");
  const m = String(date.month).padStart(2, "0");
  const d = String(date.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getEthiopianYearMonths(year: number): EthiopianYearMonthInfo[] {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return [];
  return ETHIOPIAN_MONTHS.map((meta) => {
    const days = daysInEthiopianMonth(year, meta.number);
    const startGregorian = jdnToGregorian(ethiopianToJdn(year, meta.number, 1));
    const endGregorian = jdnToGregorian(ethiopianToJdn(year, meta.number, days));
    return {
      month: meta.number,
      days,
      startGregorian,
      endGregorian,
    };
  });
}
