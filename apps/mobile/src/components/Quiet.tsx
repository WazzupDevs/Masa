import { createContext, useContext } from 'react';

// Trust screens (join request, "Tanışalım mı?", friend requests, safety sheets) speak calmly in
// every theme: hairlines instead of outlines, no hard shadows, no tilted stickers. Components
// inside a `Quiet` provider draw themselves that way.
const QuietContext = createContext(false);

export const Quiet = QuietContext.Provider;

export function useQuiet(): boolean {
  return useContext(QuietContext);
}
