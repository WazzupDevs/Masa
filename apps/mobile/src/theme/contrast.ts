// WCAG 2.x contrast. Pure, used by the token tests and by the reveal signal, whose background is a
// server-chosen colour (@shared/reveal.ts) and needs a readable foreground.

function channels(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`Expected #rrggbb, got ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function linear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// AA: 4.5 for body text, 3 for large text (≥ 24 px, or ≥ 18.66 px bold) and UI shapes.
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

// The candidate with the best contrast on `background`.
export function readableOn(background: string, candidates: readonly string[]): string {
  let best = candidates[0];
  if (best === undefined) throw new Error('No candidates');
  for (const c of candidates) {
    if (contrastRatio(background, c) > contrastRatio(background, best)) best = c;
  }
  return best;
}

// "#rrggbb" → "r g b" for the NativeWind colour variables (`rgb(var(--color-x) / <alpha-value>)`).
export function rgbChannels(hex: string): string {
  return channels(hex).join(' ');
}

// "#rrggbb" + opacity → "rgba(r, g, b, a)" for React Native styles.
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
