import { contrastRatio, luminance, readableOn } from './contrast';
import type { Palette } from './tokens';

export type SwitchColors = {
  track: string;
  trackBorder: string;
  thumb: string;
  thumbBorder: string;
};

// The switch as the canvas draws it ("Profilimle yaz"): an outlined track, accent when on and
// surface2 when off, and an outlined thumb. On, the thumb is the lighter of the accent's text colour
// and the text colour (white in both schemes); its outline is whichever ink reads best on the
// track, so the thumb always stands 3:1 apart from the track.
export function switchColors(palette: Palette, on: boolean): SwitchColors {
  const track = on ? palette.accent : palette.surface2;
  const thumb = on
    ? luminance(palette.onAccent) >= luminance(palette.text)
      ? palette.onAccent
      : palette.text
    : palette.surface;
  const thumbBorder = readableOn(track, [palette.border, palette.onAccent]);
  return { track, trackBorder: palette.border, thumb, thumbBorder };
}

// For the test: how far apart the thumb's outline and the track are.
export function thumbContrast(colors: SwitchColors): number {
  return contrastRatio(colors.thumbBorder, colors.track);
}
