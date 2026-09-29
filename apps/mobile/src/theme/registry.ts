import type { ColorScheme, Palette, ShadowSet, ThemeDefinition } from './tokens';

export type SchemePreference = ColorScheme | 'system';
export const SCHEME_PREFERENCES = ['light', 'dark', 'system'] as const;

// The test picker (Ayarlar → Tasarım (test)) chooses only light, dark or the system's; production
// always uses the theme's default.
export type ThemePreference = { scheme: SchemePreference | null };

// `scheme: null` means the theme's own default.
export function resolveScheme(
  theme: ThemeDefinition,
  preference: SchemePreference | null,
  system: string | null | undefined, // useColorScheme(): may also be "unspecified"
): ColorScheme {
  const wanted = preference ?? theme.defaultScheme;
  if (wanted !== 'system') return wanted;
  return system === 'dark' ? 'dark' : 'light';
}

function isSchemePreference(v: unknown): v is SchemePreference {
  return typeof v === 'string' && (SCHEME_PREFERENCES as readonly string[]).includes(v);
}

// The stored test choice; anything unreadable falls back to the defaults.
export function parseThemePreference(raw: string | null): ThemePreference {
  const fallback: ThemePreference = { scheme: null };
  if (!raw) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return fallback;
    const v = value as Record<string, unknown>;
    // Earlier builds also stored a `theme`; it is ignored.
    return { scheme: isSchemePreference(v.scheme) ? v.scheme : null };
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
