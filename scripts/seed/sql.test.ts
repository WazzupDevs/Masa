import { describe, expect, it } from 'vitest';

import { sqlLiteral } from './sql.ts';

describe('sqlLiteral', () => {
  it('escapes single quotes', () => {
    expect(sqlLiteral("Kafe'nin Yeri")).toBe("'Kafe''nin Yeri'");
  });

  it('renders null, booleans and numbers', () => {
    expect(sqlLiteral(null)).toBe('null');
    expect(sqlLiteral(true)).toBe('true');
    expect(sqlLiteral(41.0082)).toBe('41.0082');
  });

  it('rejects non-finite numbers', () => {
    expect(() => sqlLiteral(Number.NaN)).toThrow();
  });

  it('renders text arrays', () => {
    expect(sqlLiteral(['deniz', "o'nun"])).toBe("array['deniz', 'o''nun']::text[]");
  });
});
