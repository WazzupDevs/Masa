// The Kabuk snail ("Çıkartma", Oyun Gecesi) as SVG: a lemon body, a purple shell with a lemon
// spiral, ink outline and a hard ink shadow. One drawing for every size: the Android adaptive icon
// (108 × 108 dp canvas, everything inside the 66 dp safe circle), the store icons, the splash image,
// the one-colour notification icon and the in-app images (apps/mobile/assets/brand). Pure, so the
// geometry is tested; scripts/build-icons.ts rasterises it with sharp.
// Design source: the Claude Design canvas, "Aşama 1 · Son".

export type IconTokens = {
  cream: string; // light canvas: icon background, splash
  ink: string; // outline and shadow
  purple: string; // shell
  lemon: string; // body and spiral
  paper: string; // outline and shadow on dark grounds
  night: string; // dark canvas: dark splash
};

export type Point = [number, number];

export const CANVAS = 108;
const CENTER = CANVAS / 2;
// Adaptive icon safe zone: a 66 dp circle; the launcher may crop anything outside it.
export const SAFE_RADIUS = 33;
// Radius the whole drawing (outline and shadow included) is fitted into, per use.
export const RADIUS = { adaptive: 32, store: 42, splash: 50, notification: 50 } as const;

// ------------------------------------------------------------------ geometry (local units)
const W = 5; // outline
export const SHADOW = 5; // hard shadow offset, right and down
const PAD = 3;
const BODY =
  'M 8 88 C 8 83 16 79 28 79 L 50 79 L 50 60 L 68 60 L 68 50 C 68 40 74 34 82 34 C 90 34 96 40 96 50 ' +
  'L 96 81 C 96 88.5 91 93 84 93 L 14 93 C 10.5 93 8 91 8 88 Z';
const SHELL = { cx: 42, cy: 55, r: 31 };
const ANTENNAE: [number, number, number, number][] = [
  [77, 38, 71, 17],
  [88, 38, 95, 18],
];
const DOT = 5.2;
const EYE = { cx: 86.5, cy: 53, r: 3.6 };
const SMILE = 'M 81.5 63 Q 86.5 67.5 91.5 63';

const f = (n: number) => Number(n.toFixed(2));

// Two-centre spiral from the outside in: upper arcs centred on (cx, cy), lower arcs on
// (cx + g/2, cy); each half turn shrinks the radius by g/2.
export function spiral(
  cx: number,
  cy: number,
  radius: number,
  gap: number,
  halfTurns: number,
): string {
  let d = `M ${f(cx - radius)} ${f(cy)}`;
  for (let i = 0; i < halfTurns; i++) {
    const upper = i % 2 === 0;
    const r = radius - (i * gap) / 2;
    const centre = upper ? cx : cx + gap / 2;
    d += ` A ${f(r)} ${f(r)} 0 0 1 ${f(upper ? centre + r : centre - r)} ${f(cy)}`;
  }
  return d;
}
const SPIRAL = spiral(43.5, 56.5, 20, 9.5, 4);

// Every point that carries ink (before the outline, dot radii and shadow are added).
export function inkPoints(): Point[] {
  return [
    [8, 90],
    [96, 50],
    [96, 81],
    [84, 93],
    [14, 93],
    [SHELL.cx - SHELL.r, SHELL.cy],
    [SHELL.cx, SHELL.cy - SHELL.r],
    [20.1, 33.1],
    [71, 12],
    [95, 13],
    [66, 12],
    [100, 18],
  ];
}

export type Fit = { scale: number; dx: number; dy: number };

// Uniform scale and offset that centre the drawing (shadow included) on the canvas and keep every
// ink point, with the pad and half the shadow, inside `radius` of the centre.
export function fit(radius: number, shadow = SHADOW): Fit {
  const points = inkPoints();
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs) + shadow) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys) + shadow) / 2;
  const far = Math.max(...points.map(([x, y]) => Math.hypot(x - cx, y - cy))) + PAD + shadow / 2;
  const scale = radius / far;
  return { scale, dx: CENTER - cx * scale, dy: CENTER - cy * scale };
}
// How far the drawing reaches from the canvas centre once fitted, in canvas units.
export function reach(radius: number, shadow = SHADOW): number {
  const { scale, dx, dy } = fit(radius, shadow);
  const shadowed = inkPoints().flatMap(([x, y]): Point[] => [
    [x, y],
    [x + shadow, y + shadow],
  ]);
  return Math.max(
    ...shadowed.map(
      ([x, y]) => Math.hypot(x * scale + dx - CENTER, y * scale + dy - CENTER) + PAD * scale,
    ),
  );
}

// The tight box of the drawing in local units (for the in-app images).
export function box(shadow = SHADOW): [number, number, number, number] {
  const points = inkPoints();
  const x0 = Math.min(...points.map((p) => p[0])) - PAD;
  const y0 = Math.min(...points.map((p) => p[1])) - PAD;
  const x1 = Math.max(...points.map((p) => p[0])) + PAD + shadow;
  const y1 = Math.max(...points.map((p) => p[1])) + PAD + shadow;
  return [f(x0), f(y0), f(x1 - x0), f(y1 - y0)];
}

// ------------------------------------------------------------------ drawing
type Palette = {
  line: string;
  shadow: string;
  body: string;
  shell: string;
  swirl: string;
  detail: string;
};
export function palette(tokens: IconTokens, ground: 'light' | 'dark'): Palette {
  const line = ground === 'light' ? tokens.ink : tokens.paper;
  return {
    line,
    shadow: line,
    body: tokens.lemon,
    shell: tokens.purple,
    swirl: tokens.lemon,
    detail: tokens.ink,
  };
}

export type Layer = 'all' | 'body' | 'shell' | 'antennae';
type DrawOptions = { face?: boolean; shadow?: boolean; layer?: Layer };

// The snail in local units. `layer` draws one part only, in the same place (the crawl animation
// moves the parts separately): the body with its face and shadow, the shell with its shadow, or the
// antennae.
export function snail(
  p: Palette,
  { face = true, shadow = true, layer = 'all' }: DrawOptions = {},
): string {
  const has = (l: Layer) => layer === 'all' || layer === l;
  const antennae = ANTENNAE.map(
    ([x1, y1, x2, y2]) =>
      `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${p.line}" stroke-width="${W}" stroke-linecap="round"/>` +
      `<circle cx="${x2}" cy="${y2}" r="${DOT}" fill="${p.line}"/>`,
  ).join('');
  const shadowGroup = (inner: string) =>
    shadow
      ? `<g transform="translate(${SHADOW} ${SHADOW})" fill="${p.shadow}" stroke="${p.shadow}" stroke-width="${W}" stroke-linejoin="round">${inner}</g>`
      : '';
  const shellDisc = `<circle cx="${SHELL.cx}" cy="${SHELL.cy}" r="${SHELL.r}"/>`;
  const bodyPath = `<path d="${BODY}"/>`;
  let out = '';
  // With every part: one shadow under the whole silhouette. Alone: each part's own shadow.
  if (layer === 'all') out += shadowGroup(bodyPath + shellDisc);
  if (layer === 'body') out += shadowGroup(bodyPath);
  if (layer === 'shell') out += shadowGroup(shellDisc);
  if (has('antennae')) out += antennae;
  if (has('body')) {
    out += `<path d="${BODY}" fill="${p.body}" stroke="${p.line}" stroke-width="${W}" stroke-linejoin="round"/>`;
    if (face)
      out +=
        `<circle cx="${EYE.cx}" cy="${EYE.cy}" r="${EYE.r}" fill="${p.detail}"/>` +
        `<path d="${SMILE}" fill="none" stroke="${p.detail}" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (has('shell'))
    out +=
      `<circle cx="${SHELL.cx}" cy="${SHELL.cy}" r="${SHELL.r}" fill="${p.shell}" stroke="${p.line}" stroke-width="${W}"/>` +
      `<path d="${SPIRAL}" fill="none" stroke="${p.swirl}" stroke-width="6.2" stroke-linecap="round"/>`;
  return out;
}

// One colour, the details cut out (spiral and the shell's edge; the face only when asked).
export function silhouette(color: string, face = false): string {
  const cut = '#000';
  return (
    `<defs><mask id="silhouette" maskUnits="userSpaceOnUse" x="-30" y="-30" width="170" height="170">` +
    `<g fill="#fff" stroke="#fff" stroke-width="${W}" stroke-linejoin="round" stroke-linecap="round">` +
    `<path d="${BODY}"/><circle cx="${SHELL.cx}" cy="${SHELL.cy}" r="${SHELL.r}"/>` +
    ANTENNAE.map(
      ([x1, y1, x2, y2]) =>
        `<path d="M ${x1} ${y1} L ${x2} ${y2}"/><circle cx="${x2}" cy="${y2}" r="${DOT}"/>`,
    ).join('') +
    `</g>` +
    `<circle cx="${SHELL.cx}" cy="${SHELL.cy}" r="${SHELL.r + 0.2}" fill="none" stroke="${cut}" stroke-width="4.2"/>` +
    `<circle cx="${SHELL.cx}" cy="${SHELL.cy}" r="${SHELL.r - 2}" fill="#fff"/>` +
    `<path d="${SPIRAL}" fill="none" stroke="${cut}" stroke-width="5.6" stroke-linecap="round"/>` +
    (face
      ? `<circle cx="${EYE.cx}" cy="${EYE.cy}" r="${EYE.r}" fill="${cut}"/><path d="${SMILE}" fill="none" stroke="${cut}" stroke-width="3" stroke-linecap="round"/>`
      : '') +
    `</mask></defs><rect x="-30" y="-30" width="170" height="170" fill="${color}" mask="url(#silhouette)"/>`
  );
}

function place(inner: string, radius: number, shadow = SHADOW): string {
  const { scale, dx, dy } = fit(radius, shadow);
  return `<g transform="translate(${f(dx)} ${f(dy)}) scale(${scale.toFixed(5)})">${inner}</g>`;
}

function svg(size: number, content: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${CANVAS} ${CANVAS}">${content}</svg>`
  );
}

// ------------------------------------------------------------------ launcher and stores
// Adaptive icon: the snail on transparent inside the safe circle, and a flat cream background.
export function foregroundSvg(tokens: IconTokens, size: number): string {
  return svg(size, place(snail(palette(tokens, 'light')), RADIUS.adaptive));
}
export function backgroundSvg(tokens: IconTokens, size: number): string {
  return svg(size, `<rect width="${CANVAS}" height="${CANVAS}" fill="${tokens.cream}"/>`);
}
// Android 13 themed icon: the system tints by alpha. A silhouette without the face.
export function monochromeSvg(size: number): string {
  return svg(size, place(silhouette('#ffffff'), RADIUS.adaptive, 0));
}
// iOS (1024, opaque) and Play (512): background and snail in one square. Their masks cut less than
// a launcher's circle, so the snail is larger.
export function fullIconSvg(tokens: IconTokens, size: number): string {
  return svg(
    size,
    `<rect width="${CANVAS}" height="${CANVAS}" fill="${tokens.cream}"/>` +
      place(snail(palette(tokens, 'light')), RADIUS.store),
  );
}
// Splash image on transparent (the plugin draws the background colour), light and dark ground.
export function splashSvg(
  tokens: IconTokens,
  size: number,
  ground: 'light' | 'dark' = 'light',
): string {
  return svg(size, place(snail(palette(tokens, ground)), RADIUS.splash));
}
// Android status bar icon: white on transparent, no mask, a silhouette without the face.
export function notificationSvg(size: number): string {
  return svg(size, place(silhouette('#ffffff'), RADIUS.notification, 0));
}

// ------------------------------------------------------------------ in-app images
// The snail on its tight box (aspect `box()[2] / box()[3]`), for the app: empty states, the Mekan
// tab, avatars and the crawl animation. `height` in px.
export function brandSvg(
  tokens: IconTokens,
  height: number,
  {
    ground = 'light',
    face = true,
    layer = 'all',
  }: { ground?: 'light' | 'dark'; face?: boolean; layer?: Layer } = {},
): string {
  const [x, y, w, h] = box();
  const width = Math.round((w / h) * height);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${w} ${h}">` +
    snail(palette(tokens, ground), { face, layer }) +
    `</svg>`
  );
}

// The Mekan tab's line icon (24 dp, 1.8 stroke like the other tab icons), white: the app tints it.
export function lineIconSvg(size: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    '<path d="M 2.4 18 C 2.9 18.9 3.6 19.3 4.6 19.3 L 18.6 19.3 C 19.8 19.3 20.6 18.5 20.6 17.3 L 20.6 11.3 C 20.6 9.9 19.6 8.9 18.4 8.9 C 17.2 8.9 16.2 9.9 16.2 11.3 L 16.2 14.2"/>' +
    '<circle cx="9.6" cy="12.3" r="6.2"/><path d="M 9.6 14.9 A 2.6 2.6 0 1 1 12.2 12.3"/>' +
    '<path d="M 17.3 9.1 L 16.4 5.4"/><path d="M 19.6 9.1 L 20.7 5.5"/></svg>'
  );
}

// Where the crawl animation turns the antennae: the top of the head, as a fraction of the box.
export function antennaPivot(): [number, number] {
  const [x, y, w, h] = box();
  return [f((82.5 - x) / w), f((38 - y) / h)];
}
