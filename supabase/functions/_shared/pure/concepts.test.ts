import { describe, expect, it } from 'vitest';

import { conceptMode } from './concepts.ts';
import { CONCEPTS } from './rooms.ts';

describe('conceptMode', () => {
  it('plays Tabu by voice and Sohbet as text', () => {
    expect(conceptMode('tabu')).toBe('voice');
    expect(conceptMode('sohbet')).toBe('text');
  });

  it('covers every concept', () => {
    for (const c of CONCEPTS) expect(['voice', 'text']).toContain(conceptMode(c));
  });
});
