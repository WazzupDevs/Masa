// One import per weight (the package roots would bundle every weight of the family). The files are
// JS assets loaded with expo-font at runtime, so they travel with an OTA update.
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import type { FontSource } from 'expo-font';

import type { FontName, FontSet } from './tokens';

const FONT_ASSETS: Record<FontName, FontSource> = {
  Fraunces_600SemiBold,
  Figtree_400Regular,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
};

// The files the theme needs, for `useFonts`.
export function fontsOf(set: FontSet): Record<string, FontSource> {
  const map: Record<string, FontSource> = {};
  for (const name of Object.values(set)) {
    if (name) map[name] = FONT_ASSETS[name];
  }
  return map;
}
