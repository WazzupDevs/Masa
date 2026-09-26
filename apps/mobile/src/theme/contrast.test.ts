import { REVEAL_COLORS } from '../../../../supabase/functions/_shared/pure/reveal.ts';
import { describe, expect, it } from 'vitest';

import { AA_LARGE, AA_TEXT, contrastRatio, readableOn } from './contrast';
import { REVEAL_FOREGROUNDS } from './reveal';
import { THEME_NAMES, THEMES } from './registry';
import type { Palette, PaletteKey } from './tokens';

type Pair = [foreground: PaletteKey, background: PaletteKey, minimum: number];

// Every foreground/background pair the kit draws. Text is AA (4.5:1); UI shapes that carry meaning
// (the selected choice ring, input outlines) are 3:1.
const PAIRS: readonly Pair[] = [
  ['text', 'canvas', AA_TEXT],
  ['text', 'surface', AA_TEXT],
  ['text', 'surface2', AA_TEXT],
  ['muted', 'canvas', AA_TEXT],
  ['muted', 'surface', AA_TEXT],
  ['muted', 'surface2', AA_TEXT],
  ['accent', 'canvas', AA_TEXT], // links
  ['accent', 'surface', AA_TEXT],
  ['danger', 'canvas', AA_TEXT], // error messages
  ['danger', 'surface', AA_TEXT],
  ['onAccent', 'accent', AA_TEXT],
  ['onDanger', 'danger', AA_TEXT],
  ['onSuccess', 'success', AA_TEXT],
  ['onSignal', 'signal', AA_TEXT],
  ['onCalm', 'calm', AA_TEXT],
  ['onLively', 'lively', AA_TEXT],
  ['onBuzz', 'buzz', AA_TEXT],
  ['onEvent', 'event', AA_TEXT],
  ['accent', 'surface', AA_LARGE], // selected ring
  ['muted', 'surface', AA_LARGE], // input outline
];

function ratio(p: Palette, fg: PaletteKey, bg: PaletteKey): number {
  return contrastRatio(p[fg], p[bg]);
}

describe('theme contrast (WCAG AA)', () => {
  for (const name of THEME_NAMES) {
    for (const scheme of ['light', 'dark'] as const) {
      const palette = THEMES[name].palettes[scheme];
      describe(`${name} · ${scheme}`, () => {
        it.each(PAIRS)('%s on %s ≥ %s', (fg, bg, min) => {
          expect(ratio(palette, fg, bg)).toBeGreaterThanOrEqual(min);
        });
      });
    }
  }
});

describe('palette values', () => {
  it('are #rrggbb', () => {
    for (const name of THEME_NAMES) {
      for (const scheme of ['light', 'dark'] as const) {
        for (const value of Object.values(THEMES[name].palettes[scheme])) {
          expect(value).toMatch(/^#[0-9A-F]{6}$/);
        }
      }
    }
  });
});

describe('reveal signal', () => {
  // The full-screen colour is chosen by the server and is the same on both phones; the text on it
  // must stay readable whatever the theme.
  it.each(REVEAL_COLORS)('text on %s is AA', (color) => {
    const fg = readableOn(color, REVEAL_FOREGROUNDS);
    expect(contrastRatio(color, fg)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });
});
