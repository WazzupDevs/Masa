import { calm } from './themes/calm';
import { night } from './themes/night';
import { play } from './themes/play';
import type { ColorScheme, Palette, ShadowSet, ThemeDefinition, ThemeName } from './tokens';

export const THEMES: Record<ThemeName, ThemeDefinition> = { night, play, calm };
export const THEME_NAMES = ['night', 'play', 'calm'] as const satisfies readonly ThemeName[];

// The direction the app ships with. Production always uses it; the preview channel can switch
// (Ayarlar → Tasarım (test)). Change this one line once a direction is chosen.
export const DEFAULT_THEME: ThemeName = 'calm';

export type SchemePreference = ColorScheme | 'system';
export const SCHEME_PREFERENCES = ['light', 'dark', 'system'] as const;

export type ThemePreference = { theme: ThemeName; scheme: SchemePreference | null };

// `scheme: null` means the theme's own default (Gece Kafe: dark, the others: the system's).
export function resolveScheme(
  theme: ThemeDefinition,
  preference: SchemePreference | null,
  system: string | null | undefined, // useColorScheme(): may also be "unspecified"
): ColorScheme {
  const wanted = preference ?? theme.defaultScheme;
  if (wanted !== 'system') return wanted;
  return system === 'dark' ? 'dark' : 'light';
}

function isThemeName(v: unknown): v is ThemeName {
  return typeof v === 'string' && (THEME_NAMES as readonly string[]).includes(v);
}

function isSchemePreference(v: unknown): v is SchemePreference {
  return typeof v === 'string' && (SCHEME_PREFERENCES as readonly string[]).includes(v);
}

// The stored test choice; anything unreadable falls back to the defaults.
export function parseThemePreference(raw: string | null): ThemePreference {
  const fallback: ThemePreference = { theme: DEFAULT_THEME, scheme: null };
  if (!raw) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return fallback;
    const v = value as Record<string, unknown>;
    return {
      theme: isThemeName(v.theme) ? v.theme : DEFAULT_THEME,
      scheme: isSchemePreference(v.scheme) ? v.scheme : null,
    };
  } catch {
    return fallback;
  }
}

// `{border}` / `{accent}` in a shadow token → the palette colour.
export function resolveShadow(shadow: string | null, palette: Palette): string | undefined {
  if (shadow === null) return undefined;
  return shadow.replace('{border}', palette.border).replace('{accent}', palette.accent);
}

export function resolveShadows(
  set: ShadowSet,
  palette: Palette,
): Record<keyof ShadowSet, string | undefined> {
  return {
    card: resolveShadow(set.card, palette),
    primaryButton: resolveShadow(set.primaryButton, palette),
    button: resolveShadow(set.button, palette),
    venueButton: resolveShadow(set.venueButton, palette),
    raised: resolveShadow(set.raised, palette),
    pin: resolveShadow(set.pin, palette),
  };
}
