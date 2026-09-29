import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { parseThemePreference, resolveScheme, resolveShadow } from './registry';
import { THEME } from './theme';
import { colorClass, PALETTE_KEYS } from './tokens';

const require = createRequire(import.meta.url);

describe('resolveScheme', () => {
  it('uses the theme default without a preference', () => {
    expect(resolveScheme(THEME, null, 'dark')).toBe('dark');
    expect(resolveScheme(THEME, null, 'light')).toBe('light');
    expect(resolveScheme({ ...THEME, defaultScheme: 'dark' }, null, 'light')).toBe('dark');
  });

  it('follows an explicit choice', () => {
    expect(resolveScheme(THEME, 'light', 'dark')).toBe('light');
    expect(resolveScheme(THEME, 'dark', 'light')).toBe('dark');
  });

  it('reads anything but "dark" from the system as light', () => {
    expect(resolveScheme(THEME, 'system', null)).toBe('light');
    expect(resolveScheme(THEME, 'system', 'unspecified')).toBe('light');
    expect(resolveScheme(THEME, 'system', 'dark')).toBe('dark');
  });
});

describe('parseThemePreference', () => {
  it('falls back to the defaults', () => {
    const fallback = { scheme: null };
    expect(parseThemePreference(null)).toEqual(fallback);
    expect(parseThemePreference('not json')).toEqual(fallback);
    expect(parseThemePreference('"dark"')).toEqual(fallback);
    expect(parseThemePreference('{"scheme":"dim"}')).toEqual(fallback);
  });

  it('reads a stored choice', () => {
    expect(parseThemePreference('{"scheme":"dark"}')).toEqual({ scheme: 'dark' });
  });

  it('keeps the scheme of a choice stored with a theme by earlier builds', () => {
    expect(parseThemePreference('{"theme":"play","scheme":"light"}')).toEqual({ scheme: 'light' });
  });
});

describe('tokens', () => {
  it('fills shadow colours from the palette', () => {
    const palette = THEME.palettes.light;
    expect(resolveShadow('3px 3px 0px {border}', palette)).toBe(`3px 3px 0px ${palette.border}`);
    expect(resolveShadow(null, palette)).toBeUndefined();
  });

  it('the theme defines every palette key in both schemes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(Object.keys(THEME.palettes[scheme]).sort()).toEqual([...PALETTE_KEYS].sort());
    }
  });

  it('tailwind.config.js exposes exactly the semantic colours', () => {
    const config = require('../../tailwind.config.js') as {
      theme: { colors?: object; extend?: { colors?: object } };
    };
    const colors = config.theme.colors ?? config.theme.extend?.colors ?? {};
    const names = Object.keys(colors).filter((c) => c !== 'transparent');
    expect(names.sort()).toEqual(PALETTE_KEYS.map(colorClass).sort());
  });
});
