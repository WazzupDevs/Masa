import { create } from 'zustand';

// Position for the check-in in progress. Memory only: cleared after the check-in request and
// never persisted (MVP_SPEC §4.2).
export type Position = { lat: number; lng: number; accuracyM: number | null };

type CheckinDraft = {
  position: Position | null;
  venue: { id: string; name: string } | null;
  setPosition: (position: Position) => void;
  setVenue: (venue: { id: string; name: string }) => void;
  clear: () => void;
};

export const useCheckinDraft = create<CheckinDraft>((set) => ({
  position: null,
  venue: null,
  setPosition: (position) => set({ position, venue: null }),
  setVenue: (venue) => set({ venue }),
  clear: () => set({ position: null, venue: null }),
}));
