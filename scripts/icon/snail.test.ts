import { describe, expect, it } from 'vitest';

import {
  backgroundSvg,
  CANVAS,
  fit,
  foregroundSvg,
  fullIconSvg,
  type IconTokens,
  inkPoints,
  monochromeSvg,
  notificationSvg,
  SAFE_RADIUS,
  STROKE,
} from './snail.ts';

const tokens: IconTokens = {
  backgroundTop: '#111111',
  backgroundBottom: '#222222',
  line: '#ffffff',
  notificationAccent: '#333333',
};

describe('app icon', () => {
  it('keeps the whole snail, line width included, inside the 66 dp safe circle', () => {
    const { scale, dx, dy } = fit(SAFE_RADIUS - 1, STROKE, 0);
    for (const [x, y] of inkPoints()) {
      const distance = Math.hypot(x * scale + dx - CANVAS / 2, y * scale + dy - CANVAS / 2);
      expect(distance + STROKE / 2).toBeLessThanOrEqual(SAFE_RADIUS);
    }
  });

  it('draws the layers at the asked size on the 108 dp canvas', () => {
    for (const svg of [
      foregroundSvg(tokens, 1024),
      backgroundSvg(tokens, 1024),
      monochromeSvg(1024),
    ]) {
      expect(svg).toContain('width="1024" height="1024" viewBox="0 0 108 108"');
    }
  });

  it('takes its colours from the tokens', () => {
    const full = fullIconSvg(tokens, 512);
    expect(full).toContain('stop-color="#111111"');
    expect(full).toContain('stop-color="#222222"');
    expect(full).toContain('stroke="#ffffff"');
  });

  it('draws the foreground, monochrome and notification layers without a background', () => {
    for (const svg of [foregroundSvg(tokens, 108), monochromeSvg(108), notificationSvg(96)]) {
      expect(svg).not.toContain('<rect');
    }
  });
});
