import { create } from 'zustand';

// What a running game tells the room screen around it (docs/SPEC_V3.md §19.2): the "Süre bitti"
// overlay, which the full-screen stage draws over everything, and how far a one-table game got,
// for game_abandoned when "Oyunu bitir" stops it. Memory only.
type LocalProgress = { turnNo: number; totalTurns: number; finished: boolean };

type GameSignals = {
  timeUp: { key: string; detail?: string } | null;
  local: LocalProgress | null;
  showTimeUp: (key: string, detail?: string) => void;
  hideTimeUp: () => void;
  setLocal: (local: LocalProgress | null) => void;
};

export const useGameSignals = create<GameSignals>((set) => ({
  timeUp: null,
  local: null,
  showTimeUp: (key, detail) => set({ timeUp: { key, detail } }),
  hideTimeUp: () => set({ timeUp: null }),
  setLocal: (local) => set({ local }),
}));

// How long "Süre bitti!" stays up.
export const TIME_UP_MS = 1500;
