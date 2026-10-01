import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';

// The system's "reduce motion" setting, kept up to date by one listener for the whole app.
// Animations jump to their end state when on.
const useStore = create<{ reduce: boolean }>(() => ({ reduce: false }));
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => useStore.setState({ reduce }));
  AccessibilityInfo.addEventListener('reduceMotionChanged', (reduce) =>
    useStore.setState({ reduce }),
  );
}

export function useReduceMotion(): boolean {
  listen();
  return useStore((s) => s.reduce);
}
