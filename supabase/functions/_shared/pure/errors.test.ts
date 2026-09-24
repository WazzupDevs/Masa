import { describe, expect, it } from 'vitest';

import { isApiErrorBody, toErrorBody } from './errors.ts';

describe('error body', () => {
  it('round-trips through the type guard', () => {
    expect(isApiErrorBody(toErrorBody('banned', 'x'))).toBe(true);
  });

  it('rejects other shapes', () => {
    expect(isApiErrorBody(null)).toBe(false);
    expect(isApiErrorBody({ error: 'x' })).toBe(false);
    expect(isApiErrorBody({ error: { code: 1, message: 'x' } })).toBe(false);
  });
});
