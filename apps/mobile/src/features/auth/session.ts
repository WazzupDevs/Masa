import type { Session } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

type SessionState = {
  session: Session | null;
  initialized: boolean;
};

export const useSessionStore = create<SessionState>(() => ({ session: null, initialized: false }));

let started = false;

// Call once at app start: loads the stored session and keeps the store in sync.
export function startSessionSync(): void {
  if (started) return;
  started = true;

  supabase.auth.getSession().then(({ data }) => {
    useSessionStore.setState({ session: data.session, initialized: true });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    useSessionStore.setState({ session, initialized: true });
  });

  // Refresh tokens only while the app is in the foreground (Supabase React Native guidance).
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
