import AsyncStorage from '@react-native-async-storage/async-storage';
import { isLoaded, loadAsync } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { vars } from 'nativewind';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { type TextStyle, useColorScheme, View } from 'react-native';
import { create } from 'zustand';

import { rgbChannels } from './contrast';
import { fontsOf } from './fonts';
import {
  parseThemePreference,
  resolveScheme,
  resolveShadows,
  type SchemePreference,
  type ThemePreference,
} from './registry';
import { THEME } from './theme';
import {
  colorClass,
  type ColorScheme,
  type FontSet,
  PALETTE_KEYS,
  type Palette,
  type Shape,
  type ShadowSet,
  type TypeVariant,
  type Typography,
} from './tokens';

export type AppTheme = {
  scheme: ColorScheme;
  colors: Palette;
  fonts: FontSet;
  typography: Typography;
  shape: Omit<Shape, 'shadow'> & { shadow: Record<keyof ShadowSet, string | undefined> };
  eventTagTilt: number;
  profiledTagDashed: boolean;
};

// The test picker (Ayarlar → Tasarım (test)) exists only in preview builds, development and the
// E2E APK (built with EXPO_PUBLIC_APP_ENV=e2e, no update channel); it picks light, dark or the
// system's. Production always uses the theme's default scheme.
export const designPickerEnabled =
  Updates.channel === 'preview' || __DEV__ || process.env.EXPO_PUBLIC_APP_ENV === 'e2e';

const STORAGE_KEY = 'masa.design.v1';

type DesignState = ThemePreference & { loaded: boolean };

const useDesignStore = create<DesignState>(() => ({
  scheme: null,
  loaded: !designPickerEnabled,
}));

function loadPreference() {
  if (useDesignStore.getState().loaded) return;
  AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => useDesignStore.setState({ ...parseThemePreference(raw), loaded: true }))
    .catch(() => useDesignStore.setState({ loaded: true }));
}

export function setSchemePreference(scheme: SchemePreference) {
  if (!designPickerEnabled) return;
  useDesignStore.setState({ scheme });
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ scheme })).catch(() => undefined);
}

export function useSchemePreference(): SchemePreference | null {
  return useDesignStore((s) => s.scheme);
}

function buildTheme(scheme: ColorScheme): AppTheme {
  const def = THEME;
  const colors = def.palettes[scheme];
  return {
    scheme,
    colors,
    fonts: def.fonts,
    typography: def.typography,
    shape: { ...def.shape, shadow: resolveShadows(def.shape.shadow, colors) },
    eventTagTilt: def.eventTagTilt,
    profiledTagDashed: def.profiledTagDashed,
  };
}

const ThemeContext = createContext<AppTheme>(buildTheme('light'));

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}

// Text style of a type variant in the active theme. Custom fonts carry their weight, so no
// fontWeight is set (Android does not pick a weight file from fontWeight).
export function typeStyle(theme: AppTheme, variant: TypeVariant): TextStyle {
  const t = theme.typography[variant];
  const family =
    theme.fonts[t.font] ?? (t.font === 'displayItalic' ? theme.fonts.display : theme.fonts.regular);
  return {
    fontFamily: family,
    fontSize: t.size,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
    textTransform: t.uppercase ? 'uppercase' : undefined,
  };
}

// Whether a font set is loaded, loading it if not. (`useFonts` from expo-font loads only the map
// it was first called with.) A font that fails to load falls back to the system font.
function useFontsReady(set: FontSet): boolean {
  const [settled, setSettled] = useState<FontSet | null>(null);
  const map = useMemo(() => fontsOf(set), [set]);
  const ready = settled === set || Object.keys(map).every((f) => isLoaded(f));
  useEffect(() => {
    if (ready) return;
    let live = true;
    const finish = () => {
      if (live) setSettled(set);
    };
    loadAsync(map).then(finish, finish);
    return () => {
      live = false;
    };
  }, [map, set, ready]);
  return ready;
}

// Screen backgrounds, the tab bar and any native navigation chrome follow the theme.
function navigationTheme(theme: AppTheme) {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: theme.scheme === 'dark',
    colors: {
      ...base.colors,
      primary: theme.colors.accent,
      background: theme.colors.canvas,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.divider,
      notification: theme.colors.danger,
    },
  };
}

// Colours as NativeWind variables (`bg-surface`, `text-muted`, `border-border` …).
function colorVars(colors: Palette) {
  const entries = PALETTE_KEYS.map((k) => [`--color-${colorClass(k)}`, rgbChannels(colors[k])]);
  return vars(Object.fromEntries(entries));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSchemePreference();
  const loaded = useDesignStore((s) => s.loaded);
  const system = useColorScheme();

  useEffect(loadPreference, []);

  const scheme = resolveScheme(THEME, designPickerEnabled ? preference : null, system);
  const target = useMemo(() => buildTheme(scheme), [scheme]);
  const targetReady = useFontsReady(target.fonts);

  // The theme shows once its fonts are in; a light/dark switch keeps them, so the navigation state
  // survives it.
  const [shown, setShown] = useState<AppTheme | null>(null);
  if (targetReady && shown !== target) setShown(target);
  const theme = targetReady ? target : shown;

  const navTheme = useMemo(() => (theme ? navigationTheme(theme) : null), [theme]);
  const style = useMemo(
    () =>
      theme ? [{ flex: 1, backgroundColor: theme.colors.canvas }, colorVars(theme.colors)] : null,
    [theme],
  );

  // Before the stored choice and the first fonts are in (bundled assets, a moment) nothing renders.
  if (!loaded || !theme || !style || !navTheme) return null;
  return (
    <ThemeContext.Provider value={theme}>
      <NavigationTheme value={navTheme}>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <View style={style}>{children}</View>
      </NavigationTheme>
    </ThemeContext.Provider>
  );
}
