// Semantic colours (src/theme/tokens.ts), bound at runtime to the active theme through NativeWind
// variables (src/theme/ThemeProvider.tsx).

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

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: Object.fromEntries(COLORS.map((c) => [c, `rgb(var(--color-${c}) / <alpha-value>)`])),
    },
  },
  plugins: [],
};
