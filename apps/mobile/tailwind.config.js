// Only design tokens exist as classes (src/theme/tokens.ts). Colours are the semantic names, bound
// at runtime to the active theme through NativeWind variables (src/theme/ThemeProvider.tsx), so a
// palette class such as `bg-white` or `text-neutral-500` does not exist. Type sizes, weights,
// fonts and radii come from the kit components (src/components), never from classes.
// src/theme/styleGuard.test.ts checks that these lists match the tokens.

const COLORS = [
  'canvas',
  'surface',
  'surface2',
  'text',
  'muted',
  'accent',
  'on-accent',
  'border',
  'divider',
  'danger',
  'on-danger',
  'success',
  'on-success',
  'signal',
  'on-signal',
  'calm',
  'on-calm',
  'lively',
  'on-lively',
  'buzz',
  'on-buzz',
  'event',
  'on-event',
  'scrim',
];

const SPACING = {
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
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    colors: {
      transparent: 'transparent',
      ...Object.fromEntries(COLORS.map((c) => [c, `rgb(var(--color-${c}) / <alpha-value>)`])),
    },
    spacing: Object.fromEntries(Object.entries(SPACING).map(([k, v]) => [k, `${v}px`])),
    fontSize: {},
    fontWeight: {},
    fontFamily: {},
    borderRadius: { none: '0px', full: '9999px' },
    extend: {},
  },
  plugins: [],
};
