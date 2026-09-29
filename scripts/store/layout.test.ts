import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CANVAS,
  captionSvg,
  outputName,
  placeScreen,
  type StoreConfig,
  wrapCaption,
} from './layout.ts';

describe('store screenshots', () => {
  it('uses a 9:16 canvas at least 1080 px wide', () => {
    expect(CANVAS.width / CANVAS.height).toBeCloseTo(9 / 16);
    expect(CANVAS.width).toBeGreaterThanOrEqual(1080);
  });

  it('fits a screen below the caption, centred, inside the canvas', () => {
    for (const [w, h] of [
      [320, 640],
      [1080, 2400],
      [1080, 1920],
    ] as const) {
      const p = placeScreen(w, h);
      expect(p.width / p.height).toBeCloseTo(w / h, 2);
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.left * 2 + p.width).toBeCloseTo(CANVAS.width, 0);
      expect(p.top + p.height).toBeLessThanOrEqual(CANVAS.height);
    }
  });

  it('wraps a long caption and keeps short ones on one line', () => {
    expect(wrapCaption('İkiniz de isterseniz tanışın')).toHaveLength(2);
    expect(wrapCaption('Tabu oyna')).toEqual(['Tabu oyna']);
  });

  it('escapes caption text in the SVG', () => {
    expect(captionSvg('A & B <c>', '#fff')).toContain('A &amp; B &lt;c&gt;');
  });

  it('names outputs in order', () => {
    expect(outputName(0)).toBe('phone-01.png');
    expect(outputName(9)).toBe('phone-10.png');
  });

  it('has at least four shots with captions in docs/store/screenshots.json', () => {
    const config = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../docs/store/screenshots.json'), 'utf8'),
    ) as StoreConfig;
    expect(config.shots.length).toBeGreaterThanOrEqual(4);
    for (const shot of config.shots) {
      expect(shot.source).toMatch(/\.png$/);
      expect(shot.caption.length).toBeGreaterThan(0);
    }
  });
});
