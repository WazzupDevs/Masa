import { describe, expect, it } from 'vitest';

import { CURRENT_KVKK_VERSION, CURRENT_TERMS_VERSION, needsConsent } from './consent.ts';

describe('needsConsent', () => {
  it('is required without a profile', () => {
    expect(needsConsent(null)).toBe(true);
  });

  it('is not required when both current versions are accepted', () => {
    expect(
      needsConsent({ terms_version: CURRENT_TERMS_VERSION, kvkk_version: CURRENT_KVKK_VERSION }),
    ).toBe(false);
  });

  it('is required again when either text changes', () => {
    expect(needsConsent({ terms_version: 'old', kvkk_version: CURRENT_KVKK_VERSION })).toBe(true);
    expect(needsConsent({ terms_version: CURRENT_TERMS_VERSION, kvkk_version: 'old' })).toBe(true);
  });
});
