// Usage: pnpm icons → apps/mobile/assets/icon/*.png, apps/mobile/assets/brand/*.png and the preview
// page dist/icon-preview/. The snail (scripts/icon/snail.ts) and the colours
// (apps/mobile/assets/icon/tokens.json) in every size the app and the stores need. Rerun after
// changing either; the PNGs are committed.
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
import { previewHtml } from './icon/preview.ts';

const root = resolve(import.meta.dirname, '..');
const assets = resolve(root, 'apps/mobile/assets/icon');
const brand = resolve(root, 'apps/mobile/assets/brand');
const preview = resolve(root, 'dist/icon-preview');
const tokens = JSON.parse(readFileSync(resolve(assets, 'tokens.json'), 'utf8')) as IconTokens;

async function png(svg: string, dir: string, file: string, opaque = false): Promise<void> {
  let image = sharp(Buffer.from(svg));
  // iOS and Play reject transparency in the app icon.
  if (opaque) image = image.flatten({ background: tokens.cream });
  await image.png().toFile(resolve(dir, file));
  console.log(`${dir === brand ? 'apps/mobile/assets/brand' : 'apps/mobile/assets/icon'}/${file}`);
}

mkdirSync(assets, { recursive: true });
mkdirSync(brand, { recursive: true });
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

mkdirSync(preview, { recursive: true });
writeFileSync(resolve(preview, 'index.html'), previewHtml('../../apps/mobile/assets/icon', tokens));
console.log('dist/icon-preview/index.html');
