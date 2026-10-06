import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

// "İlk oyun" (docs/SPEC_V3.md §19.2): Sesli Tabu's short intro shows once per device, on the first
// two-table game. Remembered in this device's storage only.
const KEY = 'kabuk.firstGameIntro.tabu';

type IntroState = { seen: boolean | null; load: () => void; markSeen: () => void };

export const useFirstGameIntro = create<IntroState>((set, get) => ({
  seen: null,
  load: () => {
    if (get().seen !== null) return;
    AsyncStorage.getItem(KEY)
      .then((value) => set({ seen: value === '1' }))
      .catch(() => set({ seen: false }));
  },
  markSeen: () => {
    set({ seen: true });
    void AsyncStorage.setItem(KEY, '1').catch(() => undefined);
  },
}));
