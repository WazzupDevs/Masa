import { create } from 'zustand';

// Set once any Edge Function answers update_required; the root layout then shows only the
// "Güncelleme gerekli" screen. Nothing clears it: a newer binary starts with a fresh state.
type UpdateGate = { required: boolean; markRequired: () => void };

export const useUpdateGate = create<UpdateGate>((set) => ({
  required: false,
  markRequired: () => set({ required: true }),
}));
