// Usage: pnpm icons → apps/mobile/assets/icon/*.png and the preview page dist/icon-preview/.
// The snail (scripts/icon/snail.ts) and the colours (apps/mobile/assets/icon/tokens.json) in every
// size the app and the stores need. Rerun after changing either; the PNGs are committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';

import {
  backgroundSvg,
  foregroundSvg,
  fullIconSvg,
  type IconTokens,
  monochromeSvg,
  notificationSvg,
  splashSvg,
} from './icon/snail.ts';
import { previewHtml } from './icon/preview.ts';

const root = resolve(import.meta.dirname, '..');
const assets = resolve(root, 'apps/mobile/assets/icon');
const preview = resolve(root, 'dist/icon-preview');
const tokens = JSON.parse(readFileSync(resolve(assets, 'tokens.json'), 'utf8')) as IconTokens;

async function png(svg: string, file: string, opaque = false): Promise<void> {
  let image = sharp(Buffer.from(svg));
  // iOS and Play reject transparency in the app icon.
  if (opaque) image = image.flatten({ background: tokens.backgroundTop });
  await image.png().toFile(resolve(assets, file));
  console.log(`apps/mobile/assets/icon/${file}`);
}

mkdirSync(assets, { recursive: true });
// Source drawing, for designers and the store.
writeFileSync(resolve(assets, 'snail.svg'), `${foregroundSvg(tokens, 1024)}\n`);

// Android adaptive icon (108 dp layers at 1024 px) and the Android 13 themed (monochrome) layer.
await png(foregroundSvg(tokens, 1024), 'adaptive-foreground.png');
await png(backgroundSvg(tokens, 1024), 'adaptive-background.png');
await png(monochromeSvg(1024), 'adaptive-monochrome.png');
// iOS: 1024 square, no rounded corners, opaque. Play Console: 512 square.
await png(fullIconSvg(tokens, 1024), 'icon.png', true);
await png(fullIconSvg(tokens, 512), 'play-512.png', true);
// Splash screen image (the plugin draws the background colour) and the notification icon
// (white on transparent; 96 px is the xxxhdpi size of the 24 dp status bar icon).
await png(splashSvg(tokens, 1024), 'splash.png');
await png(notificationSvg(96), 'notification.png');

mkdirSync(preview, { recursive: true });
writeFileSync(resolve(preview, 'index.html'), previewHtml('../../apps/mobile/assets/icon', tokens));
console.log('dist/icon-preview/index.html');
