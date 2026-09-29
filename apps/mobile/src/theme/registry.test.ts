import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THEME,
  parseThemePreference,
  resolveScheme,
  resolveShadow,
  THEME_NAMES,
  THEMES,
} from './registry';
import { colorClass, PALETTE_KEYS } from './tokens';

const require = createRequire(import.meta.url);

describe('resolveScheme', () => {
  it('uses the theme default without a preference', () => {
    expect(resolveScheme(THEMES.night, null, 'light')).toBe('dark');
    expect(resolveScheme(THEMES.calm, null, 'dark')).toBe('dark');
    expect(resolveScheme(THEMES.calm, null, 'light')).toBe('light');
  });

  it('follows an explicit choice', () => {
    expect(resolveScheme(THEMES.night, 'light', 'dark')).toBe('light');
    expect(resolveScheme(THEMES.play, 'dark', 'light')).toBe('dark');
  });

  it('reads anything but "dark" from the system as light', () => {
    expect(resolveScheme(THEMES.play, 'system', null)).toBe('light');
    expect(resolveScheme(THEMES.play, 'system', 'unspecified')).toBe('light');
    expect(resolveScheme(THEMES.play, 'system', 'dark')).toBe('dark');
  });
});

describe('parseThemePreference', () => {
  it('falls back to the defaults', () => {
    const fallback = { theme: DEFAULT_THEME, scheme: null };
    expect(parseThemePreference(null)).toEqual(fallback);
    expect(parseThemePreference('not json')).toEqual(fallback);
    expect(parseThemePreference('"night"')).toEqual(fallback);
    expect(parseThemePreference('{"theme":"neon","scheme":"dim"}')).toEqual(fallback);
  });

  it('reads a stored choice', () => {
    expect(parseThemePreference('{"theme":"play","scheme":"dark"}')).toEqual({
      theme: 'play',
      scheme: 'dark',
    });
  });
});

describe('tokens', () => {
  it('fills shadow colours from the palette', () => {
    const palette = THEMES.play.palettes.light;
    expect(resolveShadow('3px 3px 0px {border}', palette)).toBe(`3px 3px 0px ${palette.border}`);
    expect(resolveShadow(null, palette)).toBeUndefined();
  });

  it('every theme defines every palette key in both schemes', () => {
    for (const name of THEME_NAMES) {
      for (const scheme of ['light', 'dark'] as const) {
        expect(Object.keys(THEMES[name].palettes[scheme]).sort()).toEqual([...PALETTE_KEYS].sort());
      }
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
