// Play Store phone screenshots from the E2E screenshots: a 9:16 canvas with a caption on top and the
// app screen scaled into the rest. Pure (sizes and the caption SVG); scripts/store-screenshots.ts
// does the image work.

// 1080 × 1920: 9:16, and at least 1080 px on the short side, which Play needs to feature an app.
export const CANVAS = { width: 1080, height: 1920 } as const;
const CAPTION_HEIGHT = 300;
const MARGIN = 60;
const FONT_SIZE = 64;
const LINE_HEIGHT = 80;

export type StoreShot = { source: string; caption: string };
export type StoreConfig = { background: string; captionColor: string; shots: StoreShot[] };

export type Placement = { width: number; height: number; left: number; top: number };

// The screen fits below the caption, keeps its aspect ratio and is centred horizontally.
export function placeScreen(sourceWidth: number, sourceHeight: number): Placement {
  const boxWidth = CANVAS.width - 2 * MARGIN;
  const boxHeight = CANVAS.height - CAPTION_HEIGHT - MARGIN;
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  return {
    width,
    height,
    left: Math.round((CANVAS.width - width) / 2),
    top: CAPTION_HEIGHT,
  };
}

// Upscaling a small emulator screen makes it soft; the script warns below this factor.
export function upscaleFactor(sourceWidth: number, sourceHeight: number): number {
  const placement = placeScreen(sourceWidth, sourceHeight);
  return placement.width / sourceWidth;
}

// Greedy word wrap for the caption; about 26 characters fit a line at this size.
export function wrapCaption(caption: string, maxChars = 26): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of caption.split(/\s+/).filter(Boolean)) {
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function captionSvg(caption: string, color: string): string {
  const lines = wrapCaption(caption);
  const firstBaseline = (CAPTION_HEIGHT - (lines.length - 1) * LINE_HEIGHT) / 2 + FONT_SIZE / 3;
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${CANVAS.width / 2}" y="${firstBaseline + i * LINE_HEIGHT}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CAPTION_HEIGHT}"><text font-family="sans-serif" font-weight="700" font-size="${FONT_SIZE}" fill="${escapeXml(color)}" text-anchor="middle">${tspans}</text></svg>`;
}

export function outputName(index: number): string {
  return `phone-${String(index + 1).padStart(2, '0')}.png`;
}
