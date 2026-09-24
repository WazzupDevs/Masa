import { describe, expect, it } from 'vitest';

import { isUserId } from './ban.ts';

describe('isUserId', () => {
  it('accepts a uuid', () => {
    expect(isUserId('61d9fcac-f5ce-49f0-b4e9-0cbf20633e27')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isUserId('905550000001')).toBe(false);
    expect(isUserId('')).toBe(false);
  });
});
