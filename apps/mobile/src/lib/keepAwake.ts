import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

const TAG = 'kabuk-game';

// The screen stays on while a game runs (docs/SPEC_V3.md §19.2). expo-keep-awake is linked into
// the 0.3.0 build through expo; should a build lack the native module, this quietly does nothing.
export function useKeepAwakeWhile(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    try {
      void activateKeepAwakeAsync(TAG).catch(() => undefined);
    } catch {
      return undefined;
    }
    return () => {
      try {
        void Promise.resolve(deactivateKeepAwake(TAG)).catch(() => undefined);
      } catch {
        // No native module: nothing was turned on.
      }
    };
  }, [active]);
}
