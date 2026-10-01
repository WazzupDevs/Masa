import { describe, expect, it } from 'vitest';

import { AA_LARGE, contrastRatio, luminance } from './contrast';
import { switchColors, thumbContrast } from './switch';
import { THEME } from './theme';

describe('switch colours', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const palette = THEME.palettes[scheme];
    const on = switchColors(palette, true);
    const off = switchColors(palette, false);

    it(`${scheme}: the thumb stands 3:1 apart from the track, on and off`, () => {
      expect(thumbContrast(on)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(thumbContrast(off)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    it(`${scheme}: on and off tracks are 3:1 apart`, () => {
      expect(contrastRatio(on.track, off.track)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    it(`${scheme}: the thumb is white-ish when on`, () => {
      expect(luminance(on.thumb)).toBeGreaterThan(0.85);
    });

    it(`${scheme}: the track outline reads on the canvas and the surface`, () => {
      expect(contrastRatio(on.trackBorder, palette.canvas)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(on.trackBorder, palette.surface)).toBeGreaterThanOrEqual(AA_LARGE);
    });
  }
});
