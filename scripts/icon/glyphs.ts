// The app's own icon family (canvas: Aşama 5 · Geri bildirim): tab icons, the notification bell,
// map marker glyphs and badge glyphs, drawn on a 24-unit grid with a 1.8 stroke, round caps and
// joins, like the snail's line icon (snail.ts → lineIconSvg). Each icon has a passive (line) and an
// active (solid) drawing. Drawn in white; the app tints them (tintColor) or, on the map, MapLibre
// colours their signed distance field. react-native-svg is not in the app (a native module), so
// scripts/build-icons.ts rasterises these to PNG at 1×, 2× and 3×.

import { spiral } from './snail.ts';

export const GRID = 24;
export const STROKE = 1.8;

// SVG content in the 24 × 24 box. `line`: strokes only. `solid`: filled, details cut out with
// `cut` (drawn as a mask hole).
export type Glyph = { line: string; solid: string; cut?: string };

const ring = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const dot = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="none"/>`;

// ------------------------------------------------------------------ set A: "Kabuk" (soft, curled)
// The chosen set: rounded forms that curl like the shell, a spiral where an icon has a mark.
const SPIRAL_MARK = spiral(13.2, 12.4, 3, 2, 3);

export const TAB_A: Record<TabIcon, Glyph> = {
  explore: {
    line: `${ring(12, 12, 9)}<path d="M 15.6 8.4 L 13.3 13.3 L 8.4 15.6 L 10.7 10.7 Z"/>`,
    solid: ring(12, 12, 9.9),
    cut: '<path d="M 15.6 8.4 L 13.3 13.3 L 8.4 15.6 L 10.7 10.7 Z"/>',
  },
  activities: {
    // A game card in front, the edge of a second one peeking out behind it.
    line:
      '<rect x="8.6" y="3.6" width="11.4" height="16.4" rx="3"/>' +
      '<path d="M 8.6 7 L 5.4 7.9 C 4.3 8.2 3.7 9.3 4 10.4 L 6.4 19.2 C 6.7 20.3 7.8 20.9 8.9 20.6 L 11 20"/>' +
      `<path d="${SPIRAL_MARK}"/>`,
    solid:
      '<rect x="7.7" y="2.7" width="13.2" height="18.2" rx="3.9" stroke="none"/>' +
      '<path d="M 7.7 7.2 L 5.4 7.9 C 4.3 8.2 3.7 9.3 4 10.4 L 6.4 19.2 C 6.7 20.3 7.8 20.9 8.9 20.6 L 10.4 20.2" fill="none"/>',
    cut: `<path d="${SPIRAL_MARK}" fill="none" stroke-width="1.8"/>`,
  },
  messages: {
    line:
      '<path d="M 12 4 C 7 4 3.5 7.2 3.5 11.2 C 3.5 13.5 4.6 15.5 6.4 16.8 L 5.6 20.2 L 9.6 18.2 C 10.4 18.4 11.2 18.5 12 18.5 C 17 18.5 20.5 15.2 20.5 11.2 C 20.5 7.2 17 4 12 4 Z"/>' +
      dot(8.4, 11.3, 1.15) +
      dot(12, 11.3, 1.15) +
      dot(15.6, 11.3, 1.15),
    solid:
      '<path d="M 12 3.1 C 6.5 3.1 2.6 6.7 2.6 11.2 C 2.6 13.6 3.7 15.8 5.4 17.2 L 4.4 21.4 L 9.5 19.1 C 10.3 19.3 11.2 19.4 12 19.4 C 17.5 19.4 21.4 15.7 21.4 11.2 C 21.4 6.7 17.5 3.1 12 3.1 Z" stroke="none"/>',
    cut: '<circle cx="8.4" cy="11.3" r="1.35"/><circle cx="12" cy="11.3" r="1.35"/><circle cx="15.6" cy="11.3" r="1.35"/>',
  },
  profile: {
    line:
      `${ring(12, 8.5, 3.7)}` +
      '<path d="M 5 20 C 5.6 15.8 8.4 13.9 12 13.9 C 15.6 13.9 18.4 15.8 19 20"/>',
    solid:
      '<circle cx="12" cy="8.5" r="4.6" stroke="none"/>' +
      '<path d="M 4.1 20.9 C 4.6 15.4 8 13 12 13 C 16 13 19.4 15.4 19.9 20.9 Z" stroke="none"/>',
  },
  bell: {
    line:
      '<path d="M 6 16.6 V 11 C 6 7.5 8.6 4.8 12 4.8 C 15.4 4.8 18 7.5 18 11 V 16.6 L 19.6 18.2 H 4.4 Z"/>' +
      '<path d="M 10 20.6 C 10.4 21.4 11.1 21.8 12 21.8 C 12.9 21.8 13.6 21.4 14 20.6"/>' +
      '<path d="M 12 2.8 V 4.8"/>',
    solid:
      '<path d="M 5.1 16.3 V 11 C 5.1 7 8 3.9 12 3.9 C 16 3.9 18.9 7 18.9 11 V 16.3 L 20.7 18.1 C 21 18.5 20.8 19.1 20.2 19.1 H 3.8 C 3.2 19.1 3 18.5 3.3 18.1 Z" stroke="none"/>' +
      '<path d="M 10 20.6 C 10.4 21.4 11.1 21.8 12 21.8 C 12.9 21.8 13.6 21.4 14 20.6" fill="none"/>' +
      '<path d="M 12 2.6 V 4.4"/>',
  },
};

// ------------------------------------------------------------------ set B: "Masa" (geometric)
// The candidate: rounded squares and a dot, like a table seen from above.
export const TAB_B: Record<TabIcon, Glyph> = {
  explore: {
    line:
      '<path d="M 12 21 C 12 21 5 14.6 5 9.6 C 5 5.8 8.1 3 12 3 C 15.9 3 19 5.8 19 9.6 C 19 14.6 12 21 12 21 Z"/>' +
      ring(12, 9.6, 2.4),
    solid:
      '<path d="M 12 22 C 12 22 4.1 15 4.1 9.6 C 4.1 5.3 7.6 2.1 12 2.1 C 16.4 2.1 19.9 5.3 19.9 9.6 C 19.9 15 12 22 12 22 Z" stroke="none"/>',
    cut: '<circle cx="12" cy="9.6" r="2.6"/>',
  },
  activities: {
    line:
      '<rect x="4" y="4" width="16" height="16" rx="4"/>' +
      dot(8.6, 8.6, 1.4) +
      dot(12, 12, 1.4) +
      dot(15.4, 15.4, 1.4),
    solid: '<rect x="3.1" y="3.1" width="17.8" height="17.8" rx="4.9" stroke="none"/>',
    cut: '<circle cx="8.6" cy="8.6" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="15.4" cy="15.4" r="1.6"/>',
  },
  messages: {
    line: '<path d="M 5.5 4.5 H 18.5 A 2.5 2.5 0 0 1 21 7 V 14.5 A 2.5 2.5 0 0 1 18.5 17 H 10 L 6 20.5 V 17 H 5.5 A 2.5 2.5 0 0 1 3 14.5 V 7 A 2.5 2.5 0 0 1 5.5 4.5 Z"/>',
    solid:
      '<path d="M 5.5 3.6 H 18.5 A 3.4 3.4 0 0 1 21.9 7 V 14.5 A 3.4 3.4 0 0 1 18.5 17.9 H 10.3 L 5.1 22.3 V 17.8 A 3.4 3.4 0 0 1 2.1 14.5 V 7 A 3.4 3.4 0 0 1 5.5 3.6 Z" stroke="none"/>',
  },
  profile: {
    line:
      '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/>' +
      ring(12, 10, 3) +
      '<path d="M 7.2 18.4 C 8 15.9 9.8 14.7 12 14.7 C 14.2 14.7 16 15.9 16.8 18.4"/>',
    solid: '<rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5.9" stroke="none"/>',
    cut: '<circle cx="12" cy="10" r="3"/><path d="M 7.2 18.4 C 8 15.9 9.8 14.7 12 14.7 C 14.2 14.7 16 15.9 16.8 18.4 Z"/>',
  },
  bell: {
    line: '<path d="M 7 17 V 11.5 A 5 5 0 0 1 17 11.5 V 17"/><path d="M 4.5 17 H 19.5"/><path d="M 10.5 20.3 H 13.5"/>',
    solid:
      '<path d="M 6.1 16.1 V 11.5 A 5.9 5.9 0 0 1 17.9 11.5 V 16.1 H 19.5 A 0.9 0.9 0 0 1 19.5 17.9 H 4.5 A 0.9 0.9 0 0 1 4.5 16.1 Z" stroke="none"/>' +
      '<path d="M 10.5 20.3 H 13.5"/>',
  },
};

export type TabIcon = 'explore' | 'activities' | 'messages' | 'profile' | 'bell';
export const TAB_ICONS: readonly TabIcon[] = [
  'explore',
  'activities',
  'messages',
  'profile',
  'bell',
];

// ------------------------------------------------------------------ map marker glyphs (solid)
export type MarkerKind = 'cafe' | 'campus';
export const MARKERS: Record<MarkerKind, string> = {
  // A cup with a handle and two curls of steam.
  cafe:
    '<path d="M 4.6 9 H 16.4 V 13 C 16.4 16.6 13.8 19 10.5 19 C 7.2 19 4.6 16.6 4.6 13 Z" stroke="none"/>' +
    '<path d="M 16.2 10.6 H 17.4 C 19 10.6 20.1 11.7 20.1 13.1 C 20.1 14.5 19 15.6 17.4 15.6 H 15.8" fill="none"/>' +
    '<path d="M 8.6 3.4 C 7.9 4.4 9.3 5.4 8.6 6.6" fill="none"/><path d="M 12.4 3.4 C 11.7 4.4 13.1 5.4 12.4 6.6" fill="none"/>',
  // A faculty building: pediment, three columns, steps.
  campus:
    '<path d="M 2.6 9.6 L 12 3.6 L 21.4 9.6 Z" stroke="none"/>' +
    '<rect x="5.2" y="11" width="2.8" height="6.6" rx="0.6" stroke="none"/>' +
    '<rect x="10.6" y="11" width="2.8" height="6.6" rx="0.6" stroke="none"/>' +
    '<rect x="16" y="11" width="2.8" height="6.6" rx="0.6" stroke="none"/>' +
    '<path d="M 3.4 20 H 20.6"/>',
};

// ------------------------------------------------------------------ badge glyphs (solid)
export type BadgeGlyph = 'first_game' | 'ten_games' | 'voice_tabu_five_wins' | 'five_tables';
export const BADGE_GLYPHS: Record<BadgeGlyph, string> = {
  // İlk oyun: a flag on its pole.
  first_game:
    '<path d="M 6.5 21 V 3.6"/><path d="M 6.5 4.2 H 17.4 L 15 8.1 L 17.4 12 H 6.5 Z" stroke="none"/>',
  // 10 oyun: a fanned stack of game cards.
  ten_games:
    '<path d="M 7.4 7.4 L 5.3 7.9 C 4.3 8.2 3.7 9.2 4 10.2 L 6.3 19.1 C 6.6 20.1 7.6 20.7 8.6 20.4 L 10.2 20" fill="none"/>' +
    '<path d="M 10.6 5.2 L 9.6 5.3 C 8.6 5.4 7.9 6.3 8 7.3 L 8.6 17.6 C 8.7 18.5 9.4 19.2 10.3 19.2" fill="none"/>' +
    '<rect x="11.2" y="5.4" width="9.2" height="13.4" rx="2.2" transform="rotate(10 15.8 12.1)" stroke="none"/>',
  // Sesli Tabu ustası: a microphone with a winner's spark.
  voice_tabu_five_wins:
    '<rect x="8.8" y="2.8" width="6.4" height="11" rx="3.2" stroke="none"/>' +
    '<path d="M 5.6 11 C 5.6 14.6 8.4 17.2 12 17.2 C 15.6 17.2 18.4 14.6 18.4 11" fill="none"/>' +
    '<path d="M 12 17.2 V 20.8"/><path d="M 8.8 20.8 H 15.2"/>' +
    '<path d="M 19.6 2.6 L 20.3 4.3 L 22 5 L 20.3 5.7 L 19.6 7.4 L 18.9 5.7 L 17.2 5 L 18.9 4.3 Z" stroke="none"/>',
  // 5 farklı masa: a round table from above with five seats.
  five_tables:
    '<circle cx="12" cy="12" r="4.4" stroke="none"/>' +
    [0, 1, 2, 3, 4]
      .map((i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return `<circle cx="${(12 + 8 * Math.cos(a)).toFixed(2)}" cy="${(12 + 8 * Math.sin(a)).toFixed(2)}" r="1.9" stroke="none"/>`;
      })
      .join(''),
};

// ------------------------------------------------------------------ game glyphs (solid)
// The games' icons (Aktiviteler cards, "Oyun öner"): the two games already in the app and the four
// new ones (canvas: Aşama 6 · Oyunlar). Solid, details cut out like the active tab icons.
export type GameGlyph = 'tabu' | 'sohbet' | 'impostor' | 'letters' | 'song' | 'needle';
export const GAME_GLYPHS: Record<GameGlyph, { solid: string; cut?: string }> = {
  // Sesli Tabu: the microphone with a spark (the badge's drawing).
  tabu: { solid: BADGE_GLYPHS.voice_tabu_five_wins },
  // Sohbet kartları: two cards, a speech bubble cut into the front one.
  sohbet: {
    solid:
      '<path d="M 7.4 6.2 L 5.4 6.7 C 4.4 7 3.8 8 4.1 9 L 6.4 18 C 6.7 19 7.7 19.6 8.7 19.3 L 10.3 18.9" fill="none"/>' +
      '<rect x="9.6" y="3.6" width="10.6" height="15.4" rx="2.4" stroke="none"/>',
    cut: '<path d="M 12.4 8.6 H 17.4 C 17.9 8.6 18.2 8.9 18.2 9.4 V 12.2 C 18.2 12.7 17.9 13 17.4 13 H 14.4 L 12.6 14.6 V 13 H 12.4 C 11.9 13 11.6 12.7 11.6 12.2 V 9.4 C 11.6 8.9 11.9 8.6 12.4 8.6 Z" stroke="none"/>',
  },
  // Sahtekar: a half mask with two eye holes.
  impostor: {
    solid:
      '<path d="M 2.4 9.2 C 2.4 7.3 3.8 6.2 5.8 6.2 H 18.2 C 20.2 6.2 21.6 7.3 21.6 9.2 C 21.6 13.6 19.2 16.6 16.4 16.6 C 14.4 16.6 13.2 15.2 12 13.8 C 10.8 15.2 9.6 16.6 7.6 16.6 C 4.8 16.6 2.4 13.6 2.4 9.2 Z" stroke="none"/>',
    cut: '<ellipse cx="7.6" cy="10.6" rx="2.3" ry="1.6" stroke="none"/><ellipse cx="16.4" cy="10.6" rx="2.3" ry="1.6" stroke="none"/>',
  },
  // Harf Kapmaca: a letter tile.
  letters: {
    solid: '<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4.6" stroke="none"/>',
    cut: '<path d="M 8.4 16.6 L 12 7.2 L 15.6 16.6 M 9.7 13.4 H 14.3" fill="none" stroke-width="2.2"/>',
  },
  // Şarkıda Geçsin: two beamed notes.
  song: {
    solid:
      '<ellipse cx="7" cy="17.4" rx="3.2" ry="2.6" stroke="none"/><ellipse cx="17" cy="15.4" rx="3.2" ry="2.6" stroke="none"/>' +
      '<path d="M 9.6 17.2 V 6 L 19.6 3.8 V 15.2" fill="none" stroke-width="2"/><path d="M 9.6 6 L 19.6 3.8 V 7.4 L 9.6 9.6 Z" stroke="none"/>',
  },
  // İbre: a half dial with its needle.
  needle: {
    solid:
      '<path d="M 3.2 17.6 C 3.2 12.7 7.1 8.8 12 8.8 C 16.9 8.8 20.8 12.7 20.8 17.6" fill="none" stroke-width="2.4"/>' +
      '<path d="M 12 17.6 L 16.2 10.4" fill="none" stroke-width="2.2"/><circle cx="12" cy="17.6" r="2.4" stroke="none"/>' +
      '<path d="M 6.2 6.6 L 7.2 8 M 12 4.4 V 6.2 M 17.8 6.6 L 16.8 8" fill="none" stroke-width="1.6"/>',
  },
};

// A small padlock for locked badges.
export const LOCK =
  '<rect x="5.5" y="10.5" width="13" height="10" rx="2.6" stroke="none"/>' +
  '<path d="M 8.3 10.8 V 8 C 8.3 5.8 9.9 4.2 12 4.2 C 14.1 4.2 15.7 5.8 15.7 8 V 10.8" fill="none"/>';

// ------------------------------------------------------------------ rendering
let maskSeq = 0;

// One glyph as a standalone SVG, white on transparent (the app tints it). `cut` content is masked
// out of the solid drawing.
export function glyphSvg(
  content: string,
  size: number,
  opts: { cut?: string; color?: string } = {},
): string {
  const color = opts.color ?? '#ffffff';
  const body = content.replaceAll('#fff', color);
  // Unique per call: several glyphs inlined in one HTML page share one id space.
  const id = `m${(maskSeq += 1)}`;
  const mask = opts.cut
    ? `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${GRID}" height="${GRID}">` +
      `<rect width="${GRID}" height="${GRID}" fill="#fff"/>` +
      `<g fill="#000" stroke="#000" stroke-width="0.6">${opts.cut}</g></mask></defs>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${GRID} ${GRID}">` +
    mask +
    `<g fill="${color}" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"${opts.cut ? ` mask="url(#${id})"` : ''}>` +
    body +
    '</g></svg>'
  );
}

// A line glyph: strokes, no fill (dots keep their own white fill).
export function lineSvg(content: string, size: number, color = '#ffffff'): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${GRID} ${GRID}">` +
    `<g fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">` +
    content.replaceAll('#fff', color) +
    '</g></svg>'
  );
}

export function tabSvg(
  set: Record<TabIcon, Glyph>,
  icon: TabIcon,
  active: boolean,
  size: number,
  color?: string,
): string {
  const g = set[icon];
  return active ? glyphSvg(g.solid, size, { cut: g.cut, color }) : lineSvg(g.line, size, color);
}

// Signed distance field of a white-on-transparent bitmap (MapLibre SDF icons, TinySDF's encoding):
// alpha 191 on the edge, 255 / `radius` per output pixel of distance, rising inside. `alpha` holds the
// high-resolution coverage (0..255), `scale` input pixels per output pixel.
export function signedDistanceField(
  alpha: Uint8Array,
  inSize: number,
  scale: number,
  radius: number,
): Uint8Array {
  const outSize = Math.round(inSize / scale);
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < inSize && y < inSize && (alpha[y * inSize + x] ?? 0) >= 128;
  // Edge pixels: inside pixels next to an outside one, and outside pixels next to an inside one.
  const edges: number[] = [];
  for (let y = 0; y < inSize; y++)
    for (let x = 0; x < inSize; x++) {
      const v = inside(x, y);
      if (
        v !== inside(x + 1, y) ||
        v !== inside(x - 1, y) ||
        v !== inside(x, y + 1) ||
        v !== inside(x, y - 1)
      )
        edges.push(x, y);
    }
  const out = new Uint8Array(outSize * outSize);
  const reachIn = radius * scale * 1.1;
  for (let oy = 0; oy < outSize; oy++)
    for (let ox = 0; ox < outSize; ox++) {
      const cx = (ox + 0.5) * scale;
      const cy = (oy + 0.5) * scale;
      let best = reachIn * reachIn;
      for (let i = 0; i < edges.length; i += 2) {
        const dx = (edges[i] ?? 0) + 0.5 - cx;
        const dy = (edges[i + 1] ?? 0) + 0.5 - cy;
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
      const dist = Math.sqrt(best) / scale;
      const signed = inside(Math.floor(cx), Math.floor(cy)) ? dist : -dist;
      out[oy * outSize + ox] = Math.max(
        0,
        Math.min(255, Math.round(191 + (signed * 255) / radius)),
      );
    }
  return out;
}
