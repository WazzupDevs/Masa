import { describe, expect, it } from 'vitest';

import { minBuildFrom, needsUpdate, parseBuild } from './appVersion.ts';

describe('parseBuild', () => {
  it('reads a positive whole build number only', () => {
    expect(parseBuild('12')).toBe(12);
    expect(parseBuild(' 7 ')).toBe(7);
    for (const bad of [null, undefined, '', '0', '-3', '1.2', 'abc', '1e3']) {
      expect(parseBuild(bad), String(bad)).toBeNull();
    }
  });
});

describe('needsUpdate', () => {
  it('is open when the minimum is 0 or unset, even without a header', () => {
    expect(minBuildFrom(undefined)).toBe(0);
    expect(minBuildFrom('nonsense')).toBe(0);
    expect(needsUpdate(null, 0)).toBe(false);
    expect(needsUpdate('3', 0)).toBe(false);
  });

  it('refuses a missing, malformed or older build once a minimum is set', () => {
    expect(needsUpdate(null, 5)).toBe(true);
    expect(needsUpdate('abc', 5)).toBe(true);
    expect(needsUpdate('4', 5)).toBe(true);
    expect(needsUpdate('5', 5)).toBe(false);
    expect(needsUpdate('12', 5)).toBe(false);
  });
});
