import { describe, expect, it } from 'vitest';

import {
  ageOn,
  checkBirthDate,
  composeBirthDate,
  isAdult,
  istanbulToday,
  parseIsoDate,
} from './age.ts';

const today = { year: 2026, month: 9, day: 30 };

describe('age', () => {
  it('turns 18 on the birthday, not the day before', () => {
    expect(ageOn({ year: 2008, month: 9, day: 30 }, today)).toBe(18);
    expect(ageOn({ year: 2008, month: 10, day: 1 }, today)).toBe(17);
    expect(isAdult(18)).toBe(true);
    expect(isAdult(17)).toBe(false);
  });

  it('counts a 29 February birthday on 28 February in other years', () => {
    const birth = { year: 2008, month: 2, day: 29 };
    expect(ageOn(birth, { year: 2026, month: 2, day: 27 })).toBe(17);
    expect(ageOn(birth, { year: 2026, month: 2, day: 28 })).toBe(18);
    expect(ageOn(birth, { year: 2028, month: 2, day: 28 })).toBe(19);
    expect(ageOn(birth, { year: 2028, month: 2, day: 29 })).toBe(20);
  });

  it("uses Istanbul's calendar day", () => {
    // 21:30 UTC on the 29th is already 00:30 on the 30th in Istanbul.
    expect(istanbulToday(new Date('2026-09-29T21:30:00Z'))).toEqual(today);
    expect(istanbulToday(new Date('2026-09-29T20:59:59Z'))).toEqual({
      year: 2026,
      month: 9,
      day: 29,
    });
  });

  it('accepts only real calendar days', () => {
    expect(parseIsoDate('2001-02-29')).toBeNull();
    expect(parseIsoDate('2000-02-29')).toEqual({ year: 2000, month: 2, day: 29 });
    expect(parseIsoDate('2001-13-01')).toBeNull();
    expect(parseIsoDate('2001-4-01')).toBeNull();
    expect(checkBirthDate('2001-04-31', today)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects future dates and ages over 100', () => {
    expect(checkBirthDate('2026-10-01', today)).toEqual({ ok: false, reason: 'future' });
    expect(checkBirthDate('2026-09-30', today)).toEqual({ ok: true, value: '2026-09-30', age: 0 });
    expect(checkBirthDate('1926-09-30', today)).toEqual({
      ok: true,
      value: '1926-09-30',
      age: 100,
    });
    expect(checkBirthDate('1925-09-30', today)).toEqual({ ok: false, reason: 'too_old' });
  });

  it('composes the three sign-up fields', () => {
    expect(composeBirthDate('5', '3', '2001')).toBe('2001-03-05');
    expect(composeBirthDate(' 05 ', '03', '2001')).toBe('2001-03-05');
    expect(composeBirthDate('31', '4', '2001')).toBeNull();
    expect(composeBirthDate('5', '3', '01')).toBeNull();
    expect(composeBirthDate('', '3', '2001')).toBeNull();
  });
});
