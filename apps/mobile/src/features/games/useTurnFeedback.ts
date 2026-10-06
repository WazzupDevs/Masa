import { turnCue } from '@shared/tabu.ts';
import { useEffect, useRef } from 'react';
import { Vibration } from 'react-native';

import { TIME_UP_MS, useGameSignals } from './gameSignals';

// Feedback at the end of a running turn (docs/SPEC_V3.md §19.2): a short vibration in each of the
// last 5 seconds and a longer one when the time is up, plus "Süre bitti!" over the game for about
// 1.5 s. React Native's own Vibration (VIBRATE is in the 0.3.0 manifest); no new native module.
// `turnKey` names the turn, so each cue happens once.
export function useTurnFeedback(turnKey: string, secondsLeft: number, detail?: string): void {
  const done = useRef(new Set<string>());
  const showTimeUp = useGameSignals((s) => s.showTimeUp);
  const hideTimeUp = useGameSignals((s) => s.hideTimeUp);

  useEffect(() => {
    const cue = turnCue(secondsLeft);
    if (!cue) return undefined;
    const key = `${turnKey}:${secondsLeft}`;
    if (done.current.has(key)) return undefined;
    done.current.add(key);
    try {
      Vibration.vibrate(cue.vibrateMs);
    } catch {
      // No vibrator: the overlay and the clock still show it.
    }
    if (cue.kind !== 'timeUp') return undefined;
    showTimeUp(turnKey, detail);
    const timer = setTimeout(hideTimeUp, TIME_UP_MS);
    return () => clearTimeout(timer);
  }, [turnKey, secondsLeft, detail, showTimeUp, hideTimeUp]);
}
