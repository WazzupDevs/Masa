import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { aliasColor, AVATAR_COLORS, initials } from './avatar';
import { contrastRatio } from './contrast';
import { THEME } from './theme';

const tokens = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../assets/icon/tokens.json'), 'utf8'),
) as Record<string, string>;

describe('snail colours', () => {
  it('are the theme’s palette (assets/icon/tokens.json)', () => {
    const { light } = THEME.palettes;
    expect(tokens.cream).toBe(light.canvas);
    expect(tokens.ink).toBe(light.text);
    expect(tokens.purple).toBe(light.accent);
    expect(tokens.lemon).toBe(light.buzz);
  });
  // The dark snail and the dark splash keep the Stage 1 colours: they are native assets (a new
  // build), and the logo does not change with the Stage 4 dark palette. They must still read on it.
  it('read on the dark palette', () => {
    const { dark } = THEME.palettes;
    expect(contrastRatio(tokens.paper ?? '', dark.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(tokens.paper ?? '', dark.surface)).toBeGreaterThanOrEqual(3);
  });
});

describe('anonymous avatar', () => {
  it('gives one alias one colour', () => {
    expect(aliasColor('Mor Baykuş')).toBe(aliasColor('Mor Baykuş'));
    expect(AVATAR_COLORS).toContain(aliasColor('Sarı Tilki'));
  });

  it('has eight distinct colours the ink outline reads on (3:1)', () => {
    expect(new Set(AVATAR_COLORS).size).toBe(8);
    for (const c of AVATAR_COLORS) {
      expect(contrastRatio(c, THEME.palettes.light.border)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('initials', () => {
  it('takes the first letters of two words, Turkish upper case', () => {
    expect(initials('Ayşe Nur')).toBe('AN');
    expect(initials('deniz')).toBe('D');
    expect(initials('ıraz ilkin')).toBe('Iİ');
  });
});
