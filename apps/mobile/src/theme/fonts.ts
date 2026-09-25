// One import per weight (the package roots would bundle every weight of the family). The files are
// JS assets loaded with expo-font at runtime, so they travel with an OTA update.
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { Fraunces_500Medium_Italic } from '@expo-google-fonts/fraunces/500Medium_Italic';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Fraunces_600SemiBold_Italic } from '@expo-google-fonts/fraunces/600SemiBold_Italic';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import type { FontSource } from 'expo-font';

import type { FontName, FontSet } from './tokens';

const FONT_ASSETS: Record<FontName, FontSource> = {
  Fraunces_600SemiBold,
  Fraunces_600SemiBold_Italic,
  Fraunces_500Medium_Italic,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  BricolageGrotesque_800ExtraBold,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Figtree_400Regular,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
};

// The files one theme needs, for `useFonts`.
export function fontsOf(set: FontSet): Record<string, FontSource> {
  const map: Record<string, FontSource> = {};
  for (const name of Object.values(set)) {
    if (name) map[name] = FONT_ASSETS[name];
  }
  return map;
}
