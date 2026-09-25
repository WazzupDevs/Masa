import { AppState } from 'react-native';
import { create } from 'zustand';

// Set once any Edge Function answers update_required; the root layout then shows only the
// "Güncelleme gerekli" screen. Nothing clears it: a newer binary starts with a fresh state.
type UpdateGate = { required: boolean; markRequired: () => void };

export const useUpdateGate = create<UpdateGate>((set) => ({
  required: false,
  markRequired: () => set({ required: true }),
}));

// The gate is checked by every Edge Function call, and on launch and on every return to the
// foreground, so a session that only reads (Keşfet) is caught too.
export function watchUpdateGate(ping: () => Promise<void>): () => void {
  void ping();
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void ping();
  });
  return () => sub.remove();
}
