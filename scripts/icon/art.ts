// The games' pictures on the game cards (Aşama 8 · Saha → Oyun listesi): one small scene per game,
// drawn like stickers (white or coloured bodies, an ink outline and the hard ink shadow of the 3D
// buttons). Fixed colours: a picture is an object on its game's colour, like the table avatar's
// disc, so it reads on the light and the dark tone of that colour. scripts/build-icons.ts
// rasterises them to apps/mobile/assets/art/*.png (react-native-svg is a native module).

import type { GameGlyph } from './glyphs.ts';

export const ART_BOX = 64;

const INK = '#1B1433';
const WHITE = '#FFFFFF';
const LIME = '#D7F75B';
const PINK = '#FF9ACB';
const ORANGE = '#FF6B3D';
const BLUE = '#8FD3FF';
const YELLOW = '#FFD24D';
const VIOLET = '#A98BFF';
const STROKE = 2.4;
const SHADOW = 2.6;

// A shape with its outline and, under it, the same shape in ink moved down and right.
function sticker(shape: string, fill: string, transform = ''): string {
  const t = transform ? ` transform="${transform}"` : '';
  return (
    `<g${t}><g transform="translate(${SHADOW} ${SHADOW})" fill="${INK}" stroke="${INK}" stroke-width="${STROKE}" stroke-linejoin="round">${shape}</g>` +
    `<g fill="${fill}" stroke="${INK}" stroke-width="${STROKE}" stroke-linejoin="round" stroke-linecap="round">${shape}</g></g>`
  );
}

const ink = (d: string, width = STROKE) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

function wedge(cx: number, cy: number, r: number, from: number, to: number): string {
  const p = (a: number) => {
    const rad = (a * Math.PI) / 180;
    return `${(cx + r * Math.cos(rad)).toFixed(2)} ${(cy + r * Math.sin(rad)).toFixed(2)}`;
  };
  return `M ${cx} ${cy} L ${p(from)} A ${r} ${r} 0 0 1 ${p(to)} Z`;
}

export const GAME_ART: Record<GameGlyph, string> = {
  // Sesli Tabu: a speech bubble with words, one of them forbidden, and the microphone.
  tabu:
    sticker(
      '<path d="M 14 8 H 42 C 47 8 50 11 50 16 V 30 C 50 35 47 38 42 38 H 22 L 13 45 V 38 C 9 37.4 6 34.6 6 30 V 16 C 6 11 9 8 14 8 Z"/>',
      WHITE,
    ) +
    ink('M 14 18 H 38') +
    ink('M 14 27 H 30') +
    `<path d="M 12 18 H 40" stroke="${ORANGE}" stroke-width="2.6" stroke-linecap="round" transform="rotate(-8 26 18)"/>` +
    sticker('<rect x="40" y="26" width="14" height="22" rx="7"/>', LIME) +
    ink('M 44 33 H 50 M 44 38 H 50') +
    ink('M 37 42 C 37 49 41 53 47 53 C 53 53 57 49 57 42') +
    ink('M 47 53 V 59 M 42 59 H 52'),

  // Sohbet kartları: two question cards, a speech bubble on the front one.
  sohbet:
    sticker('<rect x="8" y="12" width="26" height="36" rx="5"/>', BLUE, 'rotate(-12 21 30)') +
    sticker('<rect x="26" y="10" width="28" height="40" rx="5"/>', WHITE, 'rotate(8 40 30)') +
    sticker(
      '<path d="M 32 22 H 48 C 50.2 22 52 23.8 52 26 V 33 C 52 35.2 50.2 37 48 37 H 40 L 35 41 V 37 H 32 C 29.8 37 28 35.2 28 33 V 26 C 28 23.8 29.8 22 32 22 Z"/>',
      PINK,
      'rotate(8 40 30)',
    ) +
    `<g transform="rotate(8 40 30)"><circle cx="34" cy="29.5" r="1.7" fill="${INK}"/><circle cx="40" cy="29.5" r="1.7" fill="${INK}"/><circle cx="46" cy="29.5" r="1.7" fill="${INK}"/></g>`,

  // Sahtekar: two cards, one hiding a question mark, and the mask in front.
  impostor:
    sticker('<rect x="10" y="6" width="24" height="34" rx="5"/>', WHITE, 'rotate(-12 22 23)') +
    sticker('<rect x="30" y="6" width="24" height="34" rx="5"/>', YELLOW, 'rotate(10 42 23)') +
    `<g transform="rotate(10 42 23)">${ink('M 37.6 17 C 37.6 13.6 46.4 13.4 46.4 18.4 C 46.4 22 42 22 42 25.6', 2.8)}<circle cx="42" cy="30.4" r="1.8" fill="${INK}"/></g>` +
    sticker(
      '<path d="M 9 42 C 9 38.4 11.6 36.4 15.4 36.4 H 48.6 C 52.4 36.4 55 38.4 55 42 C 55 50 50.6 56 45 56 C 41 56 38 53 32 49.6 C 26 53 23 56 19 56 C 13.4 56 9 50 9 42 Z"/>',
      PINK,
    ) +
    `<ellipse cx="20.4" cy="44.6" rx="4.6" ry="3.2" fill="${INK}"/><ellipse cx="43.6" cy="44.6" rx="4.6" ry="3.2" fill="${INK}"/>`,

  // Harf Kapmaca: three letter tiles.
  letters:
    sticker('<rect x="4" y="22" width="22" height="22" rx="5"/>', WHITE, 'rotate(-10 15 33)') +
    `<g transform="rotate(-10 15 33)">${ink('M 11.4 27.4 V 38.6 M 18.6 27.4 L 12.6 33 L 18.6 38.6', 2.8)}</g>` +
    sticker('<rect x="21" y="10" width="22" height="22" rx="5"/>', LIME, 'rotate(4 32 21)') +
    `<g transform="rotate(4 32 21)">${ink('M 26.6 26.8 L 32 15.2 L 37.4 26.8 M 28.6 22.6 H 35.4', 2.8)}</g>` +
    sticker('<rect x="38" y="26" width="22" height="22" rx="5"/>', WHITE, 'rotate(12 49 37)') +
    `<g transform="rotate(12 49 37)">${ink('M 43.4 42.8 V 31.2 L 49 38.2 L 54.6 31.2 V 42.8', 2.8)}</g>`,

  // Şarkıda Geçsin: a record and two beamed notes.
  song:
    sticker('<circle cx="24" cy="30" r="19"/>', INK) +
    `<circle cx="24" cy="30" r="14" fill="none" stroke="#4A4070" stroke-width="1.2"/><circle cx="24" cy="30" r="10" fill="none" stroke="#4A4070" stroke-width="1.2"/>` +
    `<circle cx="24" cy="30" r="6.4" fill="${PINK}"/><circle cx="24" cy="30" r="1.6" fill="${INK}"/>` +
    sticker(
      '<path d="M 40 21 L 58 16 V 22 L 40 27 Z"/><rect x="40" y="21" width="3.4" height="27" rx="1"/><rect x="54.6" y="16" width="3.4" height="27" rx="1"/>' +
        '<ellipse cx="38.6" cy="48.4" rx="5.6" ry="4.4"/><ellipse cx="53.2" cy="43.4" rx="5.6" ry="4.4"/>',
      WHITE,
    ),

  // İbre: the half dial with its bands and the needle.
  needle:
    sticker('<path d="M 6 48 A 26 26 0 0 1 58 48 Z"/>', WHITE) +
    `<path d="${wedge(32, 48, 23.8, 205, 228)}" fill="${BLUE}"/>` +
    `<path d="${wedge(32, 48, 23.8, 228, 246)}" fill="${LIME}"/>` +
    `<path d="${wedge(32, 48, 23.8, 246, 262)}" fill="${ORANGE}"/>` +
    `<path d="${wedge(32, 48, 23.8, 262, 280)}" fill="${LIME}"/>` +
    `<path d="${wedge(32, 48, 23.8, 280, 303)}" fill="${BLUE}"/>` +
    `<path d="M 6 48 A 26 26 0 0 1 58 48 Z" fill="none" stroke="${INK}" stroke-width="${STROKE}" stroke-linejoin="round"/>` +
    ink('M 32 48 L 22 26', 3.4) +
    sticker('<circle cx="32" cy="48" r="5"/>', VIOLET),
};

export function artSvg(game: GameGlyph, size: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${ART_BOX} ${ART_BOX}">` +
    GAME_ART[game] +
    '</svg>'
  );
}
