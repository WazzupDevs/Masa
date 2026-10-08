// Design tokens of the app's theme (src/theme/theme.ts). Pure data:
// no React Native import, so the contrast tests run in vitest. Screens never read these values
// directly; they use the kit components and the semantic NativeWind classes (tailwind.config.js).

export type ColorScheme = 'light' | 'dark';

// Semantic colours. The NativeWind class name is the key in kebab case (`surface2` → `bg-surface2`,
// `onAccent` → `text-on-accent`); see COLOR_CLASS below.
export type Palette = {
  canvas: string; // screen background
  surface: string; // cards, sheets, tab bar
  surface2: string; // quiet fills: segments, badges, role note, timer track
  raised: string; // lifted off the canvas and off cards: secondary buttons, fields, others' bubbles
  text: string;
  muted: string; // secondary text
  accent: string;
  onAccent: string;
  // The second accent: profile faces (initials), the "profilli" tag, colour blocks.
  violet: string;
  onViolet: string;
  read: string; // DM: the double tick of a read message
  border: string; // the outline colour (cards, controls)
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
  'raised',
  'text',
  'muted',
  'accent',
  'onAccent',
  'violet',
  'onViolet',
  'read',
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
  | 'BricolageGrotesque_800ExtraBold'
  | 'Nunito_400Regular'
  | 'Nunito_600SemiBold'
  | 'Nunito_700Bold'
  | 'Nunito_800ExtraBold';

export type FontSet = {
  display: FontName; // headings, aliases, scores, the Tabu word
  displayItalic: FontName | null; // an italic Tabu word, if the theme has one
  italic: FontName | null; // italic subtitles and eyebrows, if the theme has one
  regular: FontName;
  semibold: FontName;
  bold: FontName;
  extrabold: FontName;
};

// Where a shadow is drawn. Values are CSS `box-shadow` strings (React Native `boxShadow`); `null`
// draws none. `{border}` and `{accent}` are replaced with the palette colour.
export type ShadowSet = {
  card: string | null; // every card: soft
  feature: string | null; // the one featured card per screen (and the Tabu card): hard
  // Aşama 8 · Saha: the 3D look of every button and game control (src/components/Depth.tsx): an
  // outline in `border` and this hard shadow; pressed, the shadow goes and the face moves into it.
  depth: string | null;
  raised: string | null; // the selected segment of a switch
  pin: string | null; // map pins
  tabBar: string | null; // the floating tab bar
  focus: string | null; // the code box that takes the next digit
};

export type Shape = {
  radius: { sm: number; md: number; lg: number; pill: number };
  // Border widths: cards (0 = none), the featured card, controls (inputs, segments, switches),
  // tags, the hairline (list rows, trust screens) and the raised Mekan tab's ring.
  stroke: {
    card: number;
    feature: number;
    control: number;
    tag: number;
    hairline: number;
    venueRing: number;
  };
  shadow: ShadowSet;
  // The 3D look: outline width and how far the face sinks when pressed (the shadow's offset).
  depth: { stroke: number; offset: number };
  // The describing team in Tabu: an accent ring or a filled sticker.
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
  | 'forbidden' // the Tabu card's forbidden words
  | 'score' // a Tabu team score
  | 'hero' // shareable moments: "Süre bitti!", a reveal (read in a screen recording)
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
  | 'buttonSmall' // a small button in a header ("Masadan ayrıl", "Odayı bitir")
  | 'tag'
  | 'caption' // tab labels, small counters
  | 'overline' // "Söylenmeyecekler"
  | 'signalMark'; // the emoji of the "Tanışalım mı?" signal

export type Typography = Record<TypeVariant, TypeStyle>;

export type ThemeDefinition = {
  // Scheme used when the viewer has not picked one in the test picker, and in production.
  defaultScheme: ColorScheme | 'system';
  palettes: Record<ColorScheme, Palette>;
  fonts: FontSet;
  shape: Shape;
  typography: Typography;
  // Tags that lean (an event sticker). Never on trust screens.
  eventTagTilt: number;
  // Draws the "profilli" tag with a dashed outline.
  profiledTagDashed: boolean;
};

// Spacing scale (4 · 8 · 12 · 16 · 24 · 32, plus the in-between steps
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
  9: 36,
  10: 40,
  11: 44,
  12: 48,
  14: 56,
  16: 64,
} as const;

// The tab bar's colours (canvas: Aşama 8 · Saha → Sekme çubuğu): the selected tab's icon is drawn in
// its own colour; the others are muted. Mekan is the raised disc: filled with its colour, the icon
// in the colour's foreground. contrast.test.ts checks each against the bar and the icon's halo.
export const TAB_TONES = {
  explore: 'success',
  activities: 'violet',
  messages: 'read',
  profile: 'danger',
} as const satisfies Record<string, PaletteKey>;
export const VENUE_TAB_TONE = { fill: 'event', icon: 'onEvent' } as const satisfies Record<
  string,
  PaletteKey
>;

// Icon sizes (Ionicons).
export const ICON = { xs: 12, sm: 16, md: 20, lg: 24, xl: 28 } as const;

// Minimum touch target (WCAG 2.5.8 is 24; the mockups and Android guidance use 44–48).
export const TOUCH = { min: 44, button: 48, tab: 56, large: 64 } as const;

// Keşfet map pins, drawn by MapLibre GL layers (sizes in points). Placeholder until the design
// session's pin image; colours come from the palette. MAP_FONTS must be font stacks served by the
// map style's glyph server (OpenFreeMap "liberty" serves Noto Sans), not the app's fonts.
export const MAP_PIN = {
  radius: 16,
  // The selected venue grows and gets a hard shadow (canvas: Aşama 5 · Harita işaretçileri).
  selectedRadius: 22,
  shadow: 3,
  // The kind glyph inside the circle (24 pt in its image): 18 pt, 24 when selected.
  glyphScale: 0.75,
  selectedGlyphScale: 1,
  ring: 3,
  outline: 2,
  eventDot: 6,
  eventOffset: 12,
  clusterRadius: [18, 22, 26],
  clusterSteps: [10, 30],
  labelSize: 12,
  countSize: 14,
  labelOffset: 1.4,
  labelHalo: 2,
} as const;
export const MAP_FONTS = { regular: ['Noto Sans Regular'], bold: ['Noto Sans Bold'] } as const;

// Type sizes from directions.html; the theme overrides what differs.
export function baseTypography(overrides: Partial<Typography> = {}): Typography {
  return {
    display: { font: 'display', size: 30, lineHeight: 34, letterSpacing: -0.3 },
    title: { font: 'display', size: 23, lineHeight: 28 },
    heading: { font: 'display', size: 18, lineHeight: 24 },
    alias: { font: 'display', size: 26, lineHeight: 32 },
    word: { font: 'display', size: 38, lineHeight: 42, letterSpacing: 0.8 },
    forbidden: { font: 'semibold', size: 18, lineHeight: 24 },
    score: { font: 'display', size: 30, lineHeight: 34 },
    hero: { font: 'display', size: 54, lineHeight: 58, letterSpacing: -1 },
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
    buttonSmall: { font: 'bold', size: 14, lineHeight: 18 },
    tag: { font: 'bold', size: 13, lineHeight: 17 },
    caption: { font: 'bold', size: 12, lineHeight: 16 },
    overline: { font: 'extrabold', size: 12, lineHeight: 16, letterSpacing: 1, uppercase: true },
    signalMark: { font: 'regular', size: 104, lineHeight: 126 },
    ...overrides,
  };
}
