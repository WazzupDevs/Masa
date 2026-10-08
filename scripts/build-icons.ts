// Usage: pnpm icons → apps/mobile/assets/icon/*.png, apps/mobile/assets/brand/*.png,
// apps/mobile/assets/glyph/*.png and the preview page dist/icon-preview/. The snail
// (scripts/icon/snail.ts), the icon family (scripts/icon/glyphs.ts) and the colours
// (apps/mobile/assets/icon/tokens.json) in every size the app and the stores need. Rerun after
// changing any of them; the PNGs are committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';

import {
  backgroundSvg,
  brandSvg,
  foregroundSvg,
  fullIconSvg,
  type IconTokens,
  lineIconSvg,
  monochromeSvg,
  notificationSvg,
  splashSvg,
} from './icon/snail.ts';
import {
  BADGE_GLYPHS,
  type BadgeGlyph,
  GAME_GLYPHS,
  type GameGlyph,
  glyphSvg,
  KIND_GLYPHS,
  LOCK,
  MARKERS,
  type MarkerKind,
  signedDistanceField,
  TAB_A,
  TAB_ICONS,
  TABLE_AVATARS,
  tabSvg,
} from './icon/glyphs.ts';
import { ART_BOX, artSvg } from './icon/art.ts';
import { previewHtml } from './icon/preview.ts';

const root = resolve(import.meta.dirname, '..');
const assets = resolve(root, 'apps/mobile/assets/icon');
const brand = resolve(root, 'apps/mobile/assets/brand');
const glyph = resolve(root, 'apps/mobile/assets/glyph');
const art = resolve(root, 'apps/mobile/assets/art');
const preview = resolve(root, 'dist/icon-preview');
const tokens = JSON.parse(readFileSync(resolve(assets, 'tokens.json'), 'utf8')) as IconTokens;

async function png(svg: string, dir: string, file: string, opaque = false): Promise<void> {
  let image = sharp(Buffer.from(svg));
  // iOS and Play reject transparency in the app icon.
  if (opaque) image = image.flatten({ background: tokens.cream });
  await image.png().toFile(resolve(dir, file));
  console.log(`${dir.slice(root.length + 1)}/${file}`);
}

mkdirSync(assets, { recursive: true });
mkdirSync(brand, { recursive: true });
mkdirSync(glyph, { recursive: true });
mkdirSync(art, { recursive: true });
// Source drawing, for designers and the store.
writeFileSync(resolve(assets, 'snail.svg'), `${foregroundSvg(tokens, 1024)}\n`);

// Android adaptive icon (108 dp layers at 1024 px) and the Android 13 themed (monochrome) layer.
await png(foregroundSvg(tokens, 1024), assets, 'adaptive-foreground.png');
await png(backgroundSvg(tokens, 1024), assets, 'adaptive-background.png');
await png(monochromeSvg(1024), assets, 'adaptive-monochrome.png');
// iOS: 1024 square, no rounded corners, opaque. Play Console: 512 square.
await png(fullIconSvg(tokens, 1024), assets, 'icon.png', true);
await png(fullIconSvg(tokens, 512), assets, 'play-512.png', true);
// Splash images (the plugin draws the background colour) and the notification icon (white on
// transparent; 96 px is the xxxhdpi size of the 24 dp status bar icon).
await png(splashSvg(tokens, 1024, 'light'), assets, 'splash.png');
await png(splashSvg(tokens, 1024, 'dark'), assets, 'splash-dark.png');
await png(notificationSvg(96), assets, 'notification.png');

// In-app images (src/components/Snail.tsx), drawn at 3× their largest use.
for (const ground of ['light', 'dark'] as const) {
  await png(brandSvg(tokens, 360, { ground }), brand, `snail-${ground}.png`);
  for (const layer of ['body', 'shell', 'antennae'] as const) {
    await png(
      brandSvg(tokens, 288, { ground, layer, face: true }),
      brand,
      `crawl-${layer}-${ground}.png`,
    );
  }
}
// Avatar and the selected Mekan tab: small, so no face; always on a light disc.
await png(brandSvg(tokens, 144, { face: false }), brand, 'snail-small.png');
// The Mekan tab's line icon, white (tinted by the app).
await png(lineIconSvg(72), brand, 'tab-snail.png');

// The icon family (scripts/icon/glyphs.ts), white, tinted by the app. React Native picks the
// @2x/@3x file for the screen's density; `dp` is the size the app draws it at.
const DENSITIES = [1, 2, 3] as const;
async function glyphPngs(svgAt: (px: number) => string, file: string, dp: number): Promise<void> {
  for (const d of DENSITIES)
    await png(svgAt(dp * d), glyph, d === 1 ? `${file}.png` : `${file}@${d}x.png`);
}
// Tab bar and the notification bell: line (passive) and solid (active), 24 dp. Set A ("Kabuk").
for (const icon of TAB_ICONS) {
  await glyphPngs((px) => tabSvg(TAB_A, icon, false, px), `tab-${icon}`, 24);
  await glyphPngs((px) => tabSvg(TAB_A, icon, true, px), `tab-${icon}-active`, 24);
}
// Badges (src/features/profile/BadgeIcon.tsx): drawn up to 32 dp inside their disc; the lock 14.
for (const id of Object.keys(BADGE_GLYPHS) as BadgeGlyph[]) {
  await glyphPngs((px) => glyphSvg(BADGE_GLYPHS[id], px), `badge-${id}`, 32);
}
await glyphPngs((px) => glyphSvg(LOCK, px), 'lock', 14);
// Games (src/components/Glyph.tsx → GameIcon): up to 32 dp inside their disc.
for (const id of Object.keys(GAME_GLYPHS) as GameGlyph[]) {
  const g = GAME_GLYPHS[id];
  await glyphPngs((px) => glyphSvg(g.solid, px, { cut: g.cut }), `game-${id}`, 32);
}
// Table avatars (src/components/Avatar.tsx): the icon on its disc, up to 40 dp (the 72 dp hero
// avatar draws it at 56 %). Kinds for the Keşfet list (src/features/explore/VenueTags.tsx): 32 dp.
for (const a of TABLE_AVATARS) {
  await glyphPngs((px) => glyphSvg(a.solid, px, { cut: a.cut }), `avatar-${a.id}`, 40);
}
for (const kind of Object.keys(KIND_GLYPHS) as MarkerKind[]) {
  await glyphPngs((px) => glyphSvg(KIND_GLYPHS[kind], px), `kind-${kind}`, 32);
}
// The live dot's halo (src/components/LiveDot.tsx): a blurred white disc, tinted by the app (no
// native blur module). 36 dp: three times the 12 dp dot.
const HALO_DP = 36;
await glyphPngs(
  (px) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${HALO_DP} ${HALO_DP}">` +
    `<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${HALO_DP / 9}"/></filter></defs>` +
    `<circle cx="${HALO_DP / 2}" cy="${HALO_DP / 2}" r="${HALO_DP / 4}" fill="#fff" filter="url(#b)"/></svg>`,
  'halo',
  HALO_DP,
);
// The games' pictures on the game cards (src/features/games/GameCard.tsx), in colour, not tinted:
// 64 dp at 1×, 2× and 3×.
for (const id of Object.keys(GAME_GLYPHS) as GameGlyph[]) {
  for (const d of DENSITIES)
    await png(artSvg(id, ART_BOX * d), art, d === 1 ? `${id}.png` : `${id}@${d}x.png`);
}
// The tab bar's fade (src/components/TabBar.tsx): white, transparent at the top, opaque at the
// bottom, eased; tinted with the canvas colour and stretched to the band.
await sharp({
  create: { width: 4, height: 256, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
})
  .composite([
    {
      input: Buffer.from(
        Array.from({ length: 256 }, (_, y) => {
          const t = y / 255;
          const a = Math.round(255 * t * t * (3 - 2 * t));
          return [255, 255, 255, a, 255, 255, 255, a, 255, 255, 255, a, 255, 255, 255, a];
        }).flat(),
      ),
      raw: { width: 4, height: 256, channels: 4 },
    },
  ])
  .png()
  .toFile(resolve(glyph, 'fade.png'));
console.log('apps/mobile/assets/glyph/fade.png');

// Map marker glyphs as signed distance fields (MapLibre `sdf: true` images; the map colours them
// per bucket with `icon-color`). 24 dp glyph with a 3 dp buffer; 8 image pixels of distance range
// (TinySDF's encoding, which MapLibre's shader expects).
const MARKER_DP = 24;
const MARKER_BUFFER = 3;
const SUPERSAMPLE = 4;
for (const kind of Object.keys(MARKERS) as MarkerKind[]) {
  for (const d of DENSITIES) {
    const out = (MARKER_DP + 2 * MARKER_BUFFER) * d;
    const inner = MARKER_DP * d * SUPERSAMPLE;
    const pad = MARKER_BUFFER * d * SUPERSAMPLE;
    const size = inner + 2 * pad;
    const { data } = await sharp(Buffer.from(glyphSvg(MARKERS[kind], inner)))
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extractChannel(3)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const sdf = signedDistanceField(new Uint8Array(data), size, SUPERSAMPLE, 8);
    const rgba = Buffer.alloc(out * out * 4);
    sdf.forEach((a, i) => rgba.fill(255, i * 4, i * 4 + 3).writeUInt8(a, i * 4 + 3));
    const file = d === 1 ? `marker-${kind}.png` : `marker-${kind}@${d}x.png`;
    await sharp(rgba, { raw: { width: out, height: out, channels: 4 } })
      .png()
      .toFile(resolve(glyph, file));
    console.log(`apps/mobile/assets/glyph/${file}`);
  }
}

mkdirSync(preview, { recursive: true });
writeFileSync(resolve(preview, 'index.html'), previewHtml('../../apps/mobile/assets/icon', tokens));
console.log('dist/icon-preview/index.html');
