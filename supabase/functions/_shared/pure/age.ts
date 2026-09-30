// Birth date and age (docs/SPEC_V3.md §3.2). Kabuk is for 18 and over; the birth date is never
// shown to anyone, only the age. The phone and the server use the same functions.

export const ADULT_AGE = 18;
export const MAX_AGE = 100;

// Türkiye has been UTC+3 all year since 2016.
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

export type CalendarDate = { year: number; month: number; day: number };

// Today's calendar date in Istanbul.
export function istanbulToday(now: Date): CalendarDate {
  const shifted = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// "YYYY-MM-DD" to a real calendar date; null for anything else.
export function parseIsoDate(raw: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatIsoDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(
    date.day,
  ).padStart(2, '0')}`;
}

// The three fields of the sign-up form ("gün", "ay", "yıl") to "YYYY-MM-DD"; null if they do not
// form a real date.
export function composeBirthDate(day: string, month: string, year: string): string | null {
  const d = day.trim();
  const m = month.trim();
  const y = year.trim();
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(y)) return null;
  const iso = formatIsoDate({ year: Number(y), month: Number(m), day: Number(d) });
  return parseIsoDate(iso) ? iso : null;
}

// Completed years on `today`. A 29 February birthday falls on 28 February in other years.
export function ageOn(birth: CalendarDate, today: CalendarDate): number {
  let age = today.year - birth.year;
  const birthdayDay =
    birth.month === 2 && birth.day === 29 && !isLeapYear(today.year) ? 28 : birth.day;
  if (today.month < birth.month || (today.month === birth.month && today.day < birthdayDay)) {
    age -= 1;
  }
  return age;
}

export type BirthDateCheck =
  | { ok: true; value: string; age: number }
  | { ok: false; reason: 'invalid' | 'future' | 'too_old' };

// A birth date that can be stored: a real day, not in the future, at most MAX_AGE years ago.
// Whether the person is an adult is a separate question (isAdult).
export function checkBirthDate(raw: string, today: CalendarDate): BirthDateCheck {
  const birth = parseIsoDate(raw);
  if (!birth) return { ok: false, reason: 'invalid' };
  const age = ageOn(birth, today);
  // A day after today gives -1 completed years.
  if (age < 0) return { ok: false, reason: 'future' };
  if (age > MAX_AGE) return { ok: false, reason: 'too_old' };
  return { ok: true, value: formatIsoDate(birth), age };
}

export function isAdult(age: number): boolean {
  return age >= ADULT_AGE;
}
