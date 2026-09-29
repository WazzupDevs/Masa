import { readableOn } from './contrast';

// The mutual "Tanışalım mı?" signal fills the screen with the server's colour (@shared/reveal.ts),
// identical on both phones whatever theme each one runs. Text and buttons on it use whichever of
// these reads better.
export const REVEAL_FOREGROUNDS = ['#FFFFFF', '#14100C'] as const;

export function revealForeground(background: string): string {
  return readableOn(background, REVEAL_FOREGROUNDS);
}
