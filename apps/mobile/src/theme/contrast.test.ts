import { describe, expect, it } from 'vitest';

import { BUTTON_VARIANTS, buttonFill } from './buttonFill';
import { AA_LARGE, AA_TEXT, contrastRatio, readableOn } from './contrast';
import { featurePalette } from './feature';
import { THEME } from './theme';
import { type Palette, type PaletteKey, TAB_TONE } from './tokens';

type Pair = [foreground: PaletteKey, background: PaletteKey, minimum: number];

// Button: every role's label on its fill, enabled and disabled, taken from the fills the Button
// draws (buttonFill.ts), so a disabled label is checked as drawn; a text-only role on each ground
// it sits on.
const BUTTON_GROUNDS = ['canvas', 'surface', 'surface2'] as const satisfies readonly PaletteKey[];
const BUTTON_PAIRS: readonly Pair[] = BUTTON_VARIANTS.flatMap((variant) =>
  [false, true].flatMap((disabled): Pair[] => {
    const { bg, fg } = buttonFill(variant, disabled);
    return bg ? [[fg, bg, AA_TEXT]] : BUTTON_GROUNDS.map((ground): Pair => [fg, ground, AA_TEXT]);
  }),
);

// Every foreground/background pair the kit draws. Text is AA (4.5:1); UI shapes that carry meaning
// (the selected choice ring, input outlines) are 3:1.
const PAIRS: readonly Pair[] = [
  ['text', 'canvas', AA_TEXT],
  ['text', 'surface', AA_TEXT],
  ['text', 'surface2', AA_TEXT],
  ['muted', 'canvas', AA_TEXT],
  ['muted', 'surface', AA_TEXT],
  ['muted', 'surface2', AA_TEXT],
  ['text', 'raised', AA_TEXT], // others' bubbles, fields, secondary buttons
  ['muted', 'raised', AA_TEXT], // placeholders, message times
  ['accent', 'canvas', AA_TEXT], // links
  ['accent', 'surface', AA_TEXT],
  ['accent', 'surface2', AA_TEXT],
  ['violet', 'canvas', AA_TEXT],
  ['violet', 'surface', AA_TEXT],
  ['onViolet', 'violet', AA_TEXT], // initials, "profilli"
  ['read', 'canvas', AA_TEXT], // DM: read ticks next to the time
  ['read', 'surface', AA_TEXT],
  ['danger', 'canvas', AA_TEXT], // error messages
  ['danger', 'surface', AA_TEXT],
  ['success', 'surface', AA_TEXT], // turn summary counts (Doğru)
  ['success', 'canvas', AA_TEXT],
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
  ['border', 'canvas', AA_LARGE], // control outlines (secondary button, outline chip)
  ['border', 'surface', AA_LARGE],
  ['border', 'surface2', AA_LARGE],
  ['border', 'raised', AA_LARGE],
  ['accent', 'canvas', AA_LARGE],
  ['accent', 'raised', AA_LARGE],
  ...BUTTON_PAIRS,
  // The second accent on quiet fills (unread counts), danger on a note.
  ['violet', 'surface2', AA_TEXT],
  ['danger', 'surface2', AA_TEXT],
  // The intent chip and an accent link inside it.
  ['text', 'calm', AA_TEXT],
  ['accent', 'calm', AA_TEXT],
  // The featured card.
  ['onFeature', 'feature', AA_TEXT],
  ['featureMuted', 'feature', AA_TEXT],
  // The focus ring.
  ['focus', 'surface2', AA_LARGE],
  ['focus', 'raised', AA_LARGE],
  // Tab bar: the selected tab's icon on the bar and on its halo; the other tabs' icons.
  [TAB_TONE, 'surface', AA_LARGE],
  [TAB_TONE, 'surface2', AA_LARGE],
  ['muted', 'surface', AA_LARGE],
];

function ratio(p: Palette, fg: PaletteKey, bg: PaletteKey): number {
  return contrastRatio(p[fg], p[bg]);
}

describe('theme contrast (WCAG AA)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const palette = THEME.palettes[scheme];
    describe(scheme, () => {
      it.each(PAIRS)('%s on %s ≥ %s', (fg, bg, min) => {
        expect(ratio(palette, fg, bg)).toBeGreaterThanOrEqual(min);
      });
    });
  }
});

// Inside the featured card the kit draws from featurePalette (ink in the light scheme): the same
// text pairs must hold on its ground, its quiet fill and its controls.
const FEATURE_PAIRS: readonly Pair[] = [
  ...(['text', 'muted', 'accent', 'violet', 'read', 'danger', 'success'] as const).flatMap(
    (fg): Pair[] => [
      [fg, 'surface', AA_TEXT],
      [fg, 'surface2', AA_TEXT],
    ],
  ),
  ['text', 'raised', AA_TEXT],
  ['muted', 'raised', AA_TEXT],
  ['onAccent', 'accent', AA_TEXT],
  ['onViolet', 'violet', AA_TEXT],
  ['onSuccess', 'success', AA_TEXT],
  ['onDanger', 'danger', AA_TEXT],
  ['onCalm', 'calm', AA_TEXT],
  ['onEvent', 'event', AA_TEXT],
  ['onSignal', 'signal', AA_TEXT],
  ['accent', 'surface', AA_LARGE],
  ['border', 'surface', AA_LARGE],
  ['focus', 'surface', AA_LARGE],
  [TAB_TONE, 'surface', AA_LARGE],
  ...BUTTON_PAIRS,
];

describe('featured card contrast (WCAG AA)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const palette = featurePalette(THEME.palettes, scheme);
    describe(scheme, () => {
      it.each(FEATURE_PAIRS)('%s on %s ≥ %s', (fg, bg, min) => {
        expect(ratio(palette, fg, bg)).toBeGreaterThanOrEqual(min);
      });
    });
  }
});

describe('disabled button', () => {
  // Not a faded role: one neutral fill for every filled role, the muted label on it; a text-only
  // role stays clear. Its label reports a state too ("Gönderildi"), so it is checked as text above.
  it.each(BUTTON_VARIANTS)('%s', (variant) => {
    const fill = buttonFill(variant, true);
    expect(fill.fg).toBe('muted');
    expect(fill.bg).toBe(buttonFill(variant, false).bg === null ? null : 'surface2');
  });
});

describe('palette values', () => {
  it('are #rrggbb', () => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const value of Object.values(THEME.palettes[scheme])) {
        expect(value).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });
});

describe('readableOn', () => {
  it('picks the candidate with the most contrast on the background', () => {
    expect(readableOn('#FFFFFF', ['#FFFFFF', '#14100C'])).toBe('#14100C');
    expect(readableOn('#14100C', ['#FFFFFF', '#14100C'])).toBe('#FFFFFF');
  });
});
