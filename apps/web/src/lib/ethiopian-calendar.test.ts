import test from "node:test";
import assert from "node:assert/strict";
import {
  daysInEthiopianMonth,
  ethiopianToGregorian,
  ethiopianToJdn,
  formatIsoDate,
  getEthiopianYearMonths,
  gregorianToEthiopian,
  gregorianToJdn,
  isEthiopianLeapYear,
  isGregorianLeapYear,
  jdnToEthiopian,
  jdnToGregorian,
  parseIsoDate,
  weekdayIndexFromJdn,
} from "./ethiopian-calendar";

test("converts well-known Gregorian <-> Ethiopian dates accurately", () => {
  // Ethiopian New Year after leap year 2015 E.C.
  assert.deepEqual(
    gregorianToEthiopian({ year: 2023, month: 9, day: 11 }),
    { year: 2015, month: 13, day: 6 },
  );
  assert.deepEqual(
    gregorianToEthiopian({ year: 2023, month: 9, day: 12 }),
    { year: 2016, month: 1, day: 1 },
  );

  // Gregorian leap year Feb 29, 2024 & Enkutatash 2017 E.C.
  assert.deepEqual(
    gregorianToEthiopian({ year: 2024, month: 2, day: 29 }),
    { year: 2016, month: 6, day: 21 },
  );
  assert.deepEqual(
    gregorianToEthiopian({ year: 2024, month: 9, day: 10 }),
    { year: 2016, month: 13, day: 5 },
  );
  assert.deepEqual(
    gregorianToEthiopian({ year: 2024, month: 9, day: 11 }),
    { year: 2017, month: 1, day: 1 },
  );

  // Current date check: 2026-11-25 <-> Hidar 16, 2019 E.C.
  assert.deepEqual(
    gregorianToEthiopian({ year: 2026, month: 11, day: 25 }),
    { year: 2019, month: 3, day: 16 },
  );
  assert.deepEqual(
    ethiopianToGregorian({ year: 2019, month: 3, day: 16 }),
    { year: 2026, month: 11, day: 25 },
  );
});

test("handles Ethiopian and Gregorian leap years and validates Pagume days", () => {
  assert.equal(isEthiopianLeapYear(2015), true);
  assert.equal(isEthiopianLeapYear(2016), false);
  assert.equal(isEthiopianLeapYear(2019), true);
  assert.equal(daysInEthiopianMonth(2015, 13), 6);
  assert.equal(daysInEthiopianMonth(2016, 13), 5);
  assert.equal(isGregorianLeapYear(2000), true);
  assert.equal(isGregorianLeapYear(1900), false);
  assert.equal(isGregorianLeapYear(2024), true);

  // Pagume 6 invalid on non-leap year 2016 E.C.
  assert.equal(ethiopianToGregorian({ year: 2016, month: 13, day: 6 }), null);
  // Feb 29 invalid on non-leap year 2025
  assert.equal(gregorianToEthiopian({ year: 2025, month: 2, day: 29 }), null);
});

test("round-trips every single day across multiple 4-year cycles and century boundaries", () => {
  const startJdn = gregorianToJdn(1998, 1, 1);
  const endJdn = gregorianToJdn(2030, 12, 31);
  for (let jdn = startJdn; jdn <= endJdn; jdn++) {
    const g = jdnToGregorian(jdn);
    const e = jdnToEthiopian(jdn);
    assert.equal(gregorianToJdn(g.year, g.month, g.day), jdn);
    assert.equal(ethiopianToJdn(e.year, e.month, e.day), jdn);
    assert.deepEqual(gregorianToEthiopian(g), e);
    assert.deepEqual(ethiopianToGregorian(e), g);
  }
});

test("computes weekdays, ISO helpers, and 13-month year breakdown accurately", () => {
  assert.equal(weekdayIndexFromJdn(gregorianToJdn(2026, 11, 25)), 3); // Wednesday
  assert.equal(weekdayIndexFromJdn(gregorianToJdn(2023, 9, 11)), 1); // Monday

  assert.deepEqual(parseIsoDate("2026-11-25"), { year: 2026, month: 11, day: 25 });
  assert.equal(formatIsoDate({ year: 2019, month: 3, day: 16 }), "2019-03-16");

  const months2019 = getEthiopianYearMonths(2019);
  assert.equal(months2019.length, 13);
  assert.equal(months2019[0].days, 30);
  assert.deepEqual(months2019[0].startGregorian, { year: 2026, month: 9, day: 11 });
  assert.equal(months2019[12].days, 6); // 2019 E.C. is an Ethiopian leap year
  assert.deepEqual(months2019[12].endGregorian, { year: 2027, month: 9, day: 11 });
});
