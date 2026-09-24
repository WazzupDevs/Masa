import { describe, expect, it } from 'vitest';

import { MAX_MESSAGE_LENGTH, MIN_MESSAGE_INTERVAL_MS, prepareMessage } from './chat.ts';

describe('prepareMessage', () => {
  it('matches the spec limits', () => {
    expect(MAX_MESSAGE_LENGTH).toBe(200);
    expect(MIN_MESSAGE_INTERVAL_MS).toBe(1000);
  });

  it('trims and accepts 1 to 200 characters', () => {
    expect(prepareMessage('  selam  ')).toBe('selam');
    expect(prepareMessage('a'.repeat(200))).toHaveLength(200);
  });

  it('rejects empty and too long messages', () => {
    expect(prepareMessage('   ')).toBeNull();
    expect(prepareMessage('a'.repeat(201))).toBeNull();
  });

  it('counts characters, not UTF-16 units', () => {
    expect(prepareMessage('👋'.repeat(200))).not.toBeNull();
  });
});
