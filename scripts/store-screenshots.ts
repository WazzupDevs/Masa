// Usage: pnpm store:screenshots <E2E screenshot folder> [output folder]
// Play Store phone screenshots (1080 × 1920, 9:16) from the E2E screenshots: the shots and captions
// in docs/store/screenshots.json, the output in dist/store-screenshots/ (git-ignored) by default.
// The E2E folder is the `takeScreenshot` folder of a run (e2e-screenshots branch or the artifact).
// Rerun after the design direction and the app name are chosen.
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';

import {
  CANVAS,
  captionSvg,
  outputName,
  placeScreen,
  type StoreConfig,
  upscaleFactor,
} from './store/layout.ts';

const root = resolve(import.meta.dirname, '..');
const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg) {
  console.error('Usage: pnpm store:screenshots <E2E screenshot folder> [output folder]');
  process.exit(1);
}
// pnpm runs the script from scripts/; relative paths are taken from the repo root.
const input = resolve(root, inputArg);
const output = resolve(root, outputArg ?? 'dist/store-screenshots');
const config = JSON.parse(
  readFileSync(resolve(root, 'docs/store/screenshots.json'), 'utf8'),
) as StoreConfig;

mkdirSync(output, { recursive: true });
for (const [index, shot] of config.shots.entries()) {
  const source = sharp(resolve(input, shot.source));
  const { width = 0, height = 0 } = await source.metadata();
  const place = placeScreen(width, height);
  const screen = await source.resize(place.width, place.height).png().toBuffer();
  const file = resolve(output, outputName(index));
  await sharp({
    create: {
      width: CANVAS.width,
      height: CANVAS.height,
      channels: 3,
      background: config.background,
    },
  })
    .composite([
      { input: Buffer.from(captionSvg(shot.caption, config.captionColor)), left: 0, top: 0 },
      { input: screen, left: place.left, top: place.top },
    ])
    .png()
    .toFile(file);
  const factor = upscaleFactor(width, height);
  const note =
    factor > 1.5 ? ` (source ${width}×${height} enlarged ×${factor.toFixed(1)}; soft)` : '';
  console.log(`${outputName(index)} ← ${shot.source}${note}`);
}
