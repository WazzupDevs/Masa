import { describe, expect, it } from 'vitest';

import { toTrMobileE164 } from './phone.ts';

describe('toTrMobileE164', () => {
  it.each([
    ['5551234567', '+905551234567'],
    ['05551234567', '+905551234567'],
    ['+90 555 123 45 67', '+905551234567'],
    ['90 (555) 123-45-67', '+905551234567'],
  ])('accepts %s', (input, expected) => {
    expect(toTrMobileE164(input)).toBe(expected);
  });

  it.each([
    ['2121234567'], // landline
    ['555123456'], // too short
    ['55512345678'], // too long
    ['+14152127777'], // foreign
    [''],
  ])('rejects %s', (input) => {
    expect(toTrMobileE164(input)).toBeNull();
  });
});
