// Preview page for the app icon: 48, 72, 96 and 192 px under the launcher masks (circle, squircle,
// rounded square) on a light and a dark wallpaper, plus the Android 13 themed icon, the iOS icon,
// the splash image and the notification icon. Adaptive icons show the middle 72 of their 108 dp,
// so the layers are drawn 1.5 × the mask and centred.
import type { IconTokens } from './snail.ts';

export const PREVIEW_SIZES = [48, 72, 96, 192] as const;
export const MASKS = ['circle', 'squircle', 'rounded'] as const;

// Superellipse-like squircle as a scalable mask (0..100 box, stretched to the icon).
const SQUIRCLE_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M50 0C10 0 0 10 0 50s10 50 50 50 50-10 50-50S90 0 50 0Z"/></svg>',
)}")`;

function adaptive(dir: string, size: number, mask: string, themed: boolean): string {
  const layer = size * 1.5;
  const offset = -size * 0.25;
  const bg = themed
    ? `<div class="fill themed-bg"></div>`
    : `<img src="${dir}/adaptive-background.png" style="width:${layer}px;left:${offset}px;top:${offset}px">`;
  const fg = themed
    ? `<div class="themed-fg" style="width:${layer}px;height:${layer}px;left:${offset}px;top:${offset}px;` +
      `-webkit-mask-image:url(${dir}/adaptive-monochrome.png);mask-image:url(${dir}/adaptive-monochrome.png)"></div>`
    : `<img src="${dir}/adaptive-foreground.png" style="width:${layer}px;left:${offset}px;top:${offset}px">`;
  return `<div class="icon ${mask}" style="width:${size}px;height:${size}px">${bg}${fg}</div>`;
}

function wallpaper(dir: string, tone: 'light' | 'dark', themed: boolean): string {
  const rows = MASKS.map(
    (mask) =>
      `<div class="row"><span class="label">${mask}</span>${PREVIEW_SIZES.map((s) => adaptive(dir, s, mask, themed)).join('')}</div>`,
  ).join('');
  return `<section class="wall ${tone}"><h2>${tone === 'light' ? 'Açık' : 'Koyu'} duvar kağıdı${themed ? ' · Android 13 temalı' : ''}</h2>${rows}</section>`;
}

export function previewHtml(dir: string, tokens: IconTokens): string {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kabuk ikon önizlemesi</title>
<style>
body { margin: 0; font: 14px system-ui, sans-serif; background: #f4f4f5; color: #111; }
main { padding: 16px; display: grid; gap: 16px; }
.wall { border-radius: 12px; padding: 16px; }
.wall.light { background: linear-gradient(135deg, #e8eef7, #cfd9e6); }
.wall.dark { background: linear-gradient(135deg, #1b1d22, #0b0c0f); color: #eee; }
h2 { margin: 0 0 12px; font-size: 15px; }
.row { display: flex; align-items: center; gap: 20px; margin: 10px 0; }
.label { width: 70px; opacity: .7; }
.icon { position: relative; overflow: hidden; flex: none; }
.icon img, .icon .themed-fg { position: absolute; }
.icon .fill { position: absolute; inset: 0; }
.circle { border-radius: 50%; }
.rounded { border-radius: 22%; }
.squircle { -webkit-mask: ${SQUIRCLE_MASK} center / 100% 100% no-repeat; mask: ${SQUIRCLE_MASK} center / 100% 100% no-repeat; }
.themed-bg { background: #d8e2ff; }
.themed-fg { background: #1f3a78; -webkit-mask-size: 100% 100%; mask-size: 100% 100%; }
.misc { display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap; }
.misc figure { margin: 0; text-align: center; }
.splash { width: 180px; height: 320px; border-radius: 16px; display: grid; place-items: center; background: ${tokens.backgroundTop}; }
.splash img { width: 110px; }
.status { background: #111; padding: 8px 12px; border-radius: 8px; display: flex; gap: 8px; align-items: center; }
</style></head><body><main>
${wallpaper(dir, 'light', false)}
${wallpaper(dir, 'dark', false)}
${wallpaper(dir, 'light', true)}
${wallpaper(dir, 'dark', true)}
<section class="wall light"><h2>Mağaza ve diğerleri</h2><div class="misc">
<figure><img src="${dir}/icon.png" width="120" style="border-radius:22%"><figcaption>iOS 1024 (köşesiz; maske iOS'tan)</figcaption></figure>
<figure><img src="${dir}/play-512.png" width="120" style="border-radius:20%"><figcaption>Play 512</figcaption></figure>
<figure><div class="splash"><img src="${dir}/splash.png"></div><figcaption>Açılış ekranı</figcaption></figure>
<figure><div class="status"><img src="${dir}/notification.png" width="24"><img src="${dir}/notification.png" width="48"></div><figcaption>Bildirim (24 ve 48 px)</figcaption></figure>
</div></section>
</main></body></html>
`;
}
