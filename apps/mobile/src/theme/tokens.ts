// Design tokens shared by the three test directions (design/explore → directions.html). Pure data:
// no React Native import, so the contrast tests run in vitest. Screens never read these values
// directly; they use the kit components and the semantic NativeWind classes (tailwind.config.js).

export type ColorScheme = 'light' | 'dark';

// Semantic colours. The NativeWind class name is the key in kebab case (`surface2` → `bg-surface2`,
// `onAccent` → `text-on-accent`); see COLOR_CLASS below.
export type Palette = {
  canvas: string; // screen background
  surface: string; // cards, sheets, tab bar
  surface2: string; // quiet fills: segments, badges, role note, timer track
  text: string;
  muted: string; // secondary text
  accent: string;
  onAccent: string;
  border: string; // the direction's outline colour (cards, controls)
  divider: string; // hairlines: list rows, trust screens
  danger: string;
  onDanger: string;
  success: string;
  onSuccess: string;
  signal: string; // "Tanışalım mı?" highlight
  onSignal: string;
  calm: string; // Keşfet buckets and the event tag
  onCalm: string;
  lively: string;
  onLively: string;
  buzz: string;
  onBuzz: string;
  event: string;
  onEvent: string;
  scrim: string; // behind sheets
};

export const PALETTE_KEYS = [
  'canvas',
  'surface',
  'surface2',
  'text',
  'muted',
  'accent',
  'onAccent',
  'border',
  'divider',
  'danger',
  'onDanger',
  'success',
  'onSuccess',
  'signal',
  'onSignal',
  'calm',
  'onCalm',
  'lively',
  'onLively',
  'buzz',
  'onBuzz',
  'event',
  'onEvent',
  'scrim',
] as const satisfies readonly (keyof Palette)[];

export type PaletteKey = (typeof PALETTE_KEYS)[number];

// `onAccent` → `on-accent`: the Tailwind colour name and the CSS variable (`--color-on-accent`).
export function colorClass(key: PaletteKey): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

// Font family names as registered with expo-font (the @expo-google-fonts export names). Only these
// weights are bundled (src/theme/fonts.ts maps each to its file).
export type FontName =
  | 'Fraunces_600SemiBold'
  | 'Fraunces_600SemiBold_Italic'
  | 'Fraunces_500Medium_Italic'
  | 'Inter_400Regular'
  | 'Inter_600SemiBold'
  | 'Inter_700Bold'
  | 'BricolageGrotesque_800ExtraBold'
  | 'Nunito_400Regular'
  | 'Nunito_600SemiBold'
  | 'Nunito_700Bold'
  | 'Nunito_800ExtraBold'
  | 'Figtree_400Regular'
  | 'Figtree_600SemiBold'
  | 'Figtree_700Bold'
  | 'Figtree_800ExtraBold';

export type FontSet = {
  display: FontName; // headings, aliases, scores, the Tabu word
  displayItalic: FontName | null; // Gece Kafe: the Tabu word
  italic: FontName | null; // Gece Kafe: subtitles and eyebrows
  regular: FontName;
  semibold: FontName;
  bold: FontName;
  extrabold: FontName;
};

// Where a shadow is drawn. Values are CSS `box-shadow` strings (React Native `boxShadow`); `null`
// draws none. `{border}` and `{accent}` are replaced with the palette colour.
export type ShadowSet = {
  card: string | null;
  primaryButton: string | null;
  button: string | null; // secondary, danger and success buttons
  venueButton: string | null; // the raised Mekan tab
};

export type Shape = {
  radius: { sm: number; md: number; lg: number; pill: number };
  // Border widths: cards (0 = none), controls (secondary buttons, inputs, segments), tags, the
  // hairline (list rows, trust screens) and the raised Mekan tab's ring.
  stroke: { card: number; control: number; tag: number; hairline: number; venueRing: number };
  shadow: ShadowSet;
  // The describing team in Tabu: an accent ring, or Oyun Gecesi's filled sticker.
  selectedTeam: 'ring' | 'fill';
  screenPadding: number;
};

export type TypeStyle = {
  font: keyof FontSet; // a null italic falls back to `display` / `regular`
  size: number;
  lineHeight: number;
  letterSpacing?: number;
  uppercase?: boolean;
};

export type TypeVariant =
  | 'display' // screen title (h1)
  | 'title' // sheet title (h2)
  | 'heading' // section title (h3)
  | 'alias' // table alias, profile name
  | 'word' // the Tabu card word
  | 'score' // a Tabu team score
  | 'mark' // a large number or mark: headcount choice
  | 'body'
  | 'bodyStrong'
  | 'subtitle' // under the screen title
  | 'eyebrow' // above the screen title
  | 'label' // form and section labels
  | 'fine' // explanations, hints
  | 'button'
  | 'buttonLarge' // the Tabu judge buttons
  | 'buttonDetail'
  | 'tag'
  | 'caption' // tab labels, small counters
  | 'overline'; // "Söylenmeyecekler"

export type Typography = Record<TypeVariant, TypeStyle>;

export type ThemeName = 'night' | 'play' | 'calm';

export type ThemeDefinition = {
  name: ThemeName;
  // Scheme used when the viewer picks "Sistem" in the test picker, and in production.
  defaultScheme: ColorScheme | 'system';
  palettes: Record<ColorScheme, Palette>;
  fonts: FontSet;
  shape: Shape;
  typography: Typography;
  // Tags that lean (Oyun Gecesi's event sticker). Never on trust screens.
  eventTagTilt: number;
  // Gece Kafe draws the "profilli" tag with a dashed outline.
  profiledTagDashed: boolean;
};

// Spacing scale shared by every direction (4 · 8 · 12 · 16 · 24 · 32, plus the in-between steps
// the mockups use). tailwind.config.js exposes the same keys.
export const SPACING = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
} as const;

// Icon sizes (Ionicons).
export const ICON = { sm: 16, md: 20, lg: 24, xl: 28 } as const;

// Minimum touch target (WCAG 2.5.8 is 24; the mockups and Android guidance use 44–48).
export const TOUCH = { min: 44, button: 48, tab: 56, large: 64 } as const;

// Shared by all directions: sizes from directions.html. A direction overrides what differs.
export function baseTypography(overrides: Partial<Typography> = {}): Typography {
  return {
    display: { font: 'display', size: 30, lineHeight: 34, letterSpacing: -0.3 },
    title: { font: 'display', size: 23, lineHeight: 28 },
    heading: { font: 'display', size: 18, lineHeight: 24 },
    alias: { font: 'display', size: 26, lineHeight: 32 },
    word: { font: 'display', size: 38, lineHeight: 42, letterSpacing: 0.8 },
    score: { font: 'display', size: 30, lineHeight: 34 },
    mark: { font: 'display', size: 20, lineHeight: 24 },
    body: { font: 'regular', size: 16, lineHeight: 23 },
    bodyStrong: { font: 'semibold', size: 16, lineHeight: 23 },
    subtitle: { font: 'regular', size: 14, lineHeight: 20 },
    eyebrow: { font: 'semibold', size: 14, lineHeight: 20 },
    label: { font: 'semibold', size: 13, lineHeight: 18 },
    fine: { font: 'regular', size: 13, lineHeight: 18 },
    button: { font: 'bold', size: 16, lineHeight: 20 },
    buttonLarge: { font: 'bold', size: 18, lineHeight: 22 },
    buttonDetail: { font: 'semibold', size: 16, lineHeight: 20 },
    tag: { font: 'bold', size: 13, lineHeight: 17 },
    caption: { font: 'bold', size: 12, lineHeight: 16 },
    overline: { font: 'extrabold', size: 12, lineHeight: 16, letterSpacing: 1, uppercase: true },
    ...overrides,
  };
}
