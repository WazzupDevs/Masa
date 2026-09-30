import { describe, expect, it } from 'vitest';

import {
  backgroundSvg,
  box,
  brandSvg,
  CANVAS,
  foregroundSvg,
  fullIconSvg,
  type IconTokens,
  lineIconSvg,
  monochromeSvg,
  notificationSvg,
  RADIUS,
  reach,
  SAFE_RADIUS,
  snail,
  palette,
} from './snail.ts';

const tokens: IconTokens = {
  cream: '#111111',
  ink: '#222222',
  purple: '#333333',
  lemon: '#444444',
  paper: '#555555',
  night: '#666666',
};

describe('app icon', () => {
  it('keeps the whole snail, outline and shadow included, inside the 66 dp safe circle', () => {
    expect(reach(RADIUS.adaptive)).toBeLessThanOrEqual(SAFE_RADIUS);
  });

  it('keeps the store icon and the notification icon on their canvas', () => {
    expect(reach(RADIUS.store)).toBeLessThanOrEqual(CANVAS / 2);
    expect(reach(RADIUS.notification, 0)).toBeLessThanOrEqual(CANVAS / 2);
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
    for (const c of [tokens.cream, tokens.ink, tokens.purple, tokens.lemon])
      expect(full).toContain(c);
    expect(brandSvg(tokens, 100, { ground: 'dark' })).toContain(tokens.paper);
  });

  it('draws the foreground, monochrome and notification layers without a background', () => {
    for (const svg of [foregroundSvg(tokens, 108), monochromeSvg(108), notificationSvg(96)]) {
      expect(svg).not.toContain('<rect width');
    }
  });

  it('leaves the face out of the one-colour icons and the small drawing', () => {
    // The face is the only quadratic curve (the smile).
    expect(monochromeSvg(108)).not.toContain(' Q ');
    expect(notificationSvg(96)).not.toContain(' Q ');
    expect(snail(palette(tokens, 'light'), { face: false })).not.toContain(' Q ');
    expect(snail(palette(tokens, 'light'))).toContain(' Q ');
  });

  it('draws the crawl layers on the same box', () => {
    const [, , w, h] = box();
    const size = `width="${Math.round((w / h) * 90)}" height="90"`;
    for (const layer of ['body', 'shell', 'antennae'] as const) {
      expect(brandSvg(tokens, 90, { layer })).toContain(size);
    }
  });

  it('draws the tab icon with the tab icons’ stroke', () => {
    expect(lineIconSvg(24)).toContain('stroke-width="1.8"');
  });
});
