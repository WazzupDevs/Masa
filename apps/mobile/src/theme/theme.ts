import { baseTypography, type ThemeDefinition } from './tokens';

// The app's one theme, "Oyun Gecesi": cream ground (dark: neutral near-black), a purple accent
// (dark: lemon), lemon and orange stickers, soft cards, ink outline and hard shadow only on the
// primary button and the featured card; Bricolage Grotesque 800 headings over Nunito. Visual source: the
// Claude Design canvas (Aşama 1 · Son → Palet, Tipografi, Bileşenler). Every text/ground pair is
// AA (contrast.test.ts). Trust surfaces (sheets, `Quiet`) drop the outlines and hard shadows.
export const THEME: ThemeDefinition = {
  defaultScheme: 'system',
  palettes: {
    light: {
      canvas: '#FFF7E6',
      surface: '#FFFFFF',
      surface2: '#FFF0CC',
      raised: '#FFFFFF',
      text: '#1B1433',
      muted: '#544A6B',
      accent: '#5B2EEA',
      onAccent: '#FFFFFF',
      violet: '#5B2EEA',
      onViolet: '#FFFFFF',
      border: '#1B1433',
      divider: '#DDD5EA',
      danger: '#C42B14',
      onDanger: '#FFFFFF',
      success: '#1F7A3A',
      onSuccess: '#FFFFFF',
      signal: '#E6F3A6',
      onSignal: '#1B1433',
      calm: '#E4F4FF',
      onCalm: '#0F4A73',
      lively: '#FFE3F1',
      onLively: '#8A1454',
      buzz: '#D7F75B',
      onBuzz: '#1B1433',
      event: '#FF6B3D',
      onEvent: '#1B1433',
      scrim: '#000000',
    },
    // Neutral near-black ground, two surface tones, lemon accent and a bright violet second
    // accent (canvas: Aşama 4 · Yenileme → Koyu palet).
    dark: {
      canvas: '#0F0F11',
      surface: '#1B1B1F',
      surface2: '#26262C',
      raised: '#26262C',
      text: '#F6F5F1',
      muted: '#AEADB6',
      accent: '#DCFF52',
      onAccent: '#0F0F11',
      violet: '#B9A2FF',
      onViolet: '#0F0F11',
      border: '#F6F5F1',
      divider: '#2E2E35',
      danger: '#FF8A73',
      onDanger: '#1E0903',
      success: '#6FE08A',
      onSuccess: '#06200D',
      signal: '#C9DE7A',
      onSignal: '#0F0F11',
      calm: '#16324A',
      onCalm: '#CDEBFF',
      lively: '#47172F',
      onLively: '#FFD1EA',
      buzz: '#DCFF52',
      onBuzz: '#0F0F11',
      event: '#FF7A50',
      onEvent: '#0F0F11',
      scrim: '#000000',
    },
  },
  fonts: {
    display: 'BricolageGrotesque_800ExtraBold',
    displayItalic: null,
    italic: null,
    regular: 'Nunito_400Regular',
    semibold: 'Nunito_600SemiBold',
    bold: 'Nunito_700Bold',
    extrabold: 'Nunito_800ExtraBold',
  },
  shape: {
    radius: { sm: 12, md: 18, lg: 24, pill: 999 },
    // Stage 4: outlines and hard shadows only on the primary button and the one featured card;
    // other cards are soft (the shadow barely shows on the dark ground, the surface tone carries
    // them there).
    stroke: { card: 0, feature: 2, control: 2, tag: 0, hairline: 1, venueRing: 2 },
    shadow: {
      card: '0px 10px 28px -12px rgba(27, 20, 51, 0.22)',
      feature: '3px 3px 0px {border}',
      primaryButton: '3px 3px 0px {border}',
      button: null,
      venueButton: null,
      raised: '0px 2px 6px -2px rgba(27, 20, 51, 0.2)',
      pin: '0px 4px 10px rgba(0, 0, 0, 0.25)',
      // The floating tab bar: wide, soft, low opacity (no outline on its top edge).
      tabBar: '0px 14px 36px -8px rgba(0, 0, 0, 0.24)',
      focus: '3px 3px 0px {accent}',
    },
    selectedTeam: 'fill',
    screenPadding: 20,
  },
  typography: baseTypography({
    display: { font: 'display', size: 30, lineHeight: 34, letterSpacing: -0.6 },
    word: { font: 'display', size: 40, lineHeight: 44, letterSpacing: -0.8 },
  }),
  eventTagTilt: -2,
  profiledTagDashed: false,
};
