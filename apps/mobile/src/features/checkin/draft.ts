import type { LngLat } from '@shared/geo.ts';
import { create } from 'zustand';

// The check-in in progress (docs/SPEC_V2.md §4): the venue is chosen by hand in Keşfet first; the
// position only verifies it. Memory only: cleared after the check-in request and never persisted
// (MVP_SPEC §4.2).
export type Position = { lat: number; lng: number; accuracyM: number | null };
// A venue with a boundary (the campus) is checked against it, others against their point.
export type DraftVenue = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  boundary: readonly LngLat[] | null;
};
// "Neredesin?" at a venue with spots (docs/SPEC_V3.md §4.3).
export type DraftSpot = { id: string; name: string };

type CheckinDraft = {
  position: Position | null;
  venue: DraftVenue | null;
  spot: DraftSpot | null;
  setVenue: (venue: DraftVenue) => void;
  setPosition: (position: Position) => void;
  setSpot: (spot: DraftSpot | null) => void;
  clear: () => void;
};

export const useCheckinDraft = create<CheckinDraft>((set) => ({
  position: null,
  venue: null,
  spot: null,
  setVenue: (venue) => set({ venue, position: null, spot: null }),
  setPosition: (position) => set({ position }),
  setSpot: (spot) => set({ spot }),
  clear: () => set({ position: null, venue: null, spot: null }),
}));
