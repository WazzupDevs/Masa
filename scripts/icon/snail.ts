// The Kabuk snail as SVG: one line colour, round caps and joins, drawn on the 108 × 108 dp canvas of
// an Android adaptive icon with everything inside the 66 dp safe circle. Pure, so the geometry is
// tested; scripts/build-icons.ts rasterises it with sharp.

export type IconTokens = {
  backgroundTop: string;
  backgroundBottom: string;
  line: string;
  notificationAccent: string;
};

export type Point = [number, number];

export const CANVAS = 108;
const CENTER = CANVAS / 2;
// Adaptive icon safe zone: a 66 dp circle; the launcher may crop anything outside it.
export const SAFE_RADIUS = 33;
// Line width on the 108 canvas: about 2.7 px at a 48 dp launcher icon (72 of the 108 units show),
// 1.8 px when the whole square is drawn at 48 px.
export const STROKE = 4;
// Antennae end in round caps: dots on the tips merged with the antenna at 48 px.
const DOT = 0;

// Drawn in the reference image's units (1600 px divided by 10), then scaled to fit.
const SHELL_CENTER: Point = [82, 76];
const SHELL_RADIUS = 36;
// Fewer turns than the reference so the gaps stay wider than the line at 48 px.
const SHELL_TURNS = 1.55;
const SHELL_INNER_RADIUS = 5;
// The outer turn ends at the lower right of the shell and becomes the top edge of the foot.
const SHELL_END_ANGLE = (60 * Math.PI) / 180;

function spiralPoint(t: number): Point {
  // t in [0, 1]: inner end to outer end, clockwise on screen (y grows downwards).
  const angle = SHELL_END_ANGLE - (1 - t) * SHELL_TURNS * 2 * Math.PI;
  const radius = SHELL_INNER_RADIUS + (SHELL_RADIUS - SHELL_INNER_RADIUS) * t;
  return [SHELL_CENTER[0] + radius * Math.cos(angle), SHELL_CENTER[1] + radius * Math.sin(angle)];
}

function spiral(steps = 180): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => spiralPoint(i / steps));
}

// The point of the outer turn at a screen angle in degrees (where the neck meets the shell).
function outerTurnAt(degrees: number): Point {
  let angle = (degrees * Math.PI) / 180;
  while (angle > SHELL_END_ANGLE) angle -= 2 * Math.PI;
  return spiralPoint(1 - (SHELL_END_ANGLE - angle) / (SHELL_TURNS * 2 * Math.PI));
}

const shellEnd = spiralPoint(1);
const neckJoin = outerTurnAt(142);
const TAIL: Point = [128, 116];
const FOOT_Y = 118.5;

// Foot and head as one line, traced from the reference with a larger head for the heavier line:
// from the shell's end along the top of the foot to the tail tip, back along the bottom, up the
// chin, round the head and along the neck into the shell.
function bodyPath(): string {
  const [ex, ey] = shellEnd;
  const [nx, ny] = neckJoin;
  return [
    `M ${ex} ${ey}`,
    `L ${TAIL[0] - 7} ${TAIL[1] - 2.5}`,
    `Q ${TAIL[0]} ${TAIL[1]} ${TAIL[0] - 7} ${FOOT_Y}`,
    `L 60 ${FOOT_Y}`,
    `C 50 ${FOOT_Y} 44 112 38 106`,
    `C 29.5 98 31 86.5 39.5 86.5`,
    `C 46 86.5 48.5 93 50.5 97.5`,
    `C 52 100 ${nx - 4} ${ny + 1} ${nx} ${ny}`,
  ].join(' ');
}

// Two antennae from the top of the head. The reference's small rings on the tips are left out: at
// 48 px they merged with the line.
const ANTENNAE: { from: Point; to: Point }[] = [
  { from: [36.5, 88.5], to: [25, 69] },
  { from: [42.5, 88], to: [46.5, 67] },
];

// Every point that carries ink: for fitting, and for the safe-zone test.
export function inkPoints(): Point[] {
  const head: Point[] = [
    [32, 96],
    [40, 87],
    [50, 97],
    [38, 106],
  ];
  return [
    ...spiral(),
    shellEnd,
    TAIL,
    [TAIL[0] - 7, FOOT_Y],
    [58, FOOT_Y],
    ...head,
    neckJoin,
    ...ANTENNAE.flatMap((a) => [a.from, a.to]),
  ];
}

export type Fit = { scale: number; dx: number; dy: number };

// Uniform scale and offset that centre the drawing and keep every point, with half the line width
// (or a dot), inside `radius` of the canvas centre.
export function fit(radius: number, stroke: number, dot: number): Fit {
  const points = inkPoints();
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const far = Math.max(...points.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  const scale = (radius - Math.max(stroke / 2, dot)) / far;
  return { scale, dx: CENTER - cx * scale, dy: CENTER - cy * scale };
}

// The snail inside `radius` of the centre, `stroke` and `dot` in canvas units.
function lineArt(color: string, radius = SAFE_RADIUS - 1, stroke = STROKE, dot = DOT): string {
  const { scale, dx, dy } = fit(radius, stroke, dot);
  const shell = spiral()
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
  const antennae = ANTENNAE.map(
    (a) =>
      `<path d="M ${a.from[0]} ${a.from[1]} L ${a.to[0]} ${a.to[1]}"/>` +
      (dot > 0
        ? `<circle cx="${a.to[0]}" cy="${a.to[1]}" r="${(dot / scale).toFixed(3)}" fill="${color}" stroke="none"/>`
        : ''),
  ).join('');
  return (
    `<g transform="translate(${dx.toFixed(3)} ${dy.toFixed(3)}) scale(${scale.toFixed(5)})" ` +
    `fill="none" stroke="${color}" stroke-width="${(stroke / scale).toFixed(3)}" ` +
    `stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${shell}"/><path d="${bodyPath()}"/>${antennae}</g>`
  );
}

function svg(size: number, content: string, defs = ''): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${CANVAS} ${CANVAS}">${defs}${content}</svg>`
  );
}

function gradient(tokens: IconTokens): string {
  return (
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${tokens.backgroundTop}"/>` +
    `<stop offset="1" stop-color="${tokens.backgroundBottom}"/></linearGradient></defs>`
  );
}

const BACKGROUND = `<rect width="${CANVAS}" height="${CANVAS}" fill="url(#bg)"/>`;

// Adaptive icon: foreground (line on transparent, inside the safe circle) and background layers.
export function foregroundSvg(tokens: IconTokens, size: number): string {
  return svg(size, lineArt(tokens.line));
}

export function backgroundSvg(tokens: IconTokens, size: number): string {
  return svg(size, BACKGROUND, gradient(tokens));
}

// Android 13 themed icon: the system tints by alpha, so the colour does not matter.
export function monochromeSvg(size: number): string {
  return svg(size, lineArt('#ffffff'));
}

// iOS (1024, no rounded corners, opaque) and Play (512): background and line in one square. Their
// masks are rounded squares that cut less than a launcher's circle, so the snail is drawn larger
// (inside a 40 unit radius, which a 22 % corner radius does not reach).
export const FULL_ICON_RADIUS = 40;
export function fullIconSvg(tokens: IconTokens, size: number): string {
  return svg(size, BACKGROUND + lineArt(tokens.line, FULL_ICON_RADIUS), gradient(tokens));
}

// Splash screen image: the line on transparent, filling its square (the plugin sets the width and
// the background colour).
export function splashSvg(tokens: IconTokens, size: number): string {
  return svg(size, lineArt(tokens.line, CANVAS / 2 - 1));
}

// Android status bar icon: white on transparent, no mask, so the snail fills the square with a
// heavier line (it is drawn at 24 dp).
export function notificationSvg(size: number): string {
  return svg(size, lineArt('#ffffff', CANVAS / 2 - 1, STROKE * 1.8, 0));
}
