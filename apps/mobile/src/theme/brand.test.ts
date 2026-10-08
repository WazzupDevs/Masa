import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TABLE_AVATAR_ICONS } from '../../../../supabase/functions/_shared/pure/tableAvatar.ts';

import { initials, TABLE_AVATAR_COLORS, TABLE_AVATAR_INK, tableAvatarOf } from './avatar';
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

describe('table avatar', () => {
  it('gives one seed one icon and one colour', () => {
    expect(tableAvatarOf('3f2a9c1e-77b4-4e0a-9a61-5d2c8e4b1f70')).toEqual(
      tableAvatarOf('3f2a9c1e-77b4-4e0a-9a61-5d2c8e4b1f70'),
    );
    const { icon, color } = tableAvatarOf('Sarı Tilki');
    expect(TABLE_AVATAR_COLORS).toContain(color);
    expect(icon).toBeLessThan(TABLE_AVATAR_ICONS);
  });

  it('has eight distinct discs the ink icon is AA on, that stand out from white cards', () => {
    expect(new Set(TABLE_AVATAR_COLORS).size).toBe(8);
    for (const c of TABLE_AVATAR_COLORS) {
      expect(contrastRatio(TABLE_AVATAR_INK, c)).toBeGreaterThanOrEqual(4.5);
      // Luminance alone: the saturated lime is the closest to white and still reads as a colour.
      expect(contrastRatio(c, THEME.palettes.light.surface)).toBeGreaterThanOrEqual(1.2);
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
