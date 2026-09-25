import { create } from 'zustand';

// The check-in in progress (docs/SPEC_V2.md §4): the venue is chosen by hand in Keşfet first; the
// position only verifies it. Memory only: cleared after the check-in request and never persisted
// (MVP_SPEC §4.2).
export type Position = { lat: number; lng: number; accuracyM: number | null };
export type DraftVenue = { id: string; name: string; lat: number; lng: number };

type CheckinDraft = {
  position: Position | null;
  venue: DraftVenue | null;
  setVenue: (venue: DraftVenue) => void;
  setPosition: (position: Position) => void;
  clear: () => void;
};

export const useCheckinDraft = create<CheckinDraft>((set) => ({
  position: null,
  venue: null,
  setVenue: (venue) => set({ venue, position: null }),
  setPosition: (position) => set({ position }),
  clear: () => set({ position: null, venue: null }),
}));
