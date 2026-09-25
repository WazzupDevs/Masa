import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { ApiError } from '@/lib/api';

// Friend actions need a display name (docs/SPEC_V2.md §6.3): on display_name_required the app
// opens the name screen and, back on this screen, repeats the same action once.
export function useRetryAfterName<T>(run: (arg: T) => void) {
  const pending = useRef<{ arg: T } | null>(null);
  const retried = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const next = pending.current;
      if (!next) return;
      pending.current = null;
      retried.current = true;
      run(next.arg);
    }, [run]),
  );

  // True if the error was handled by opening the name screen.
  return (error: unknown, arg: T): boolean => {
    if (!(error instanceof ApiError) || error.code !== 'display_name_required') return false;
    if (retried.current) {
      retried.current = false;
      return false;
    }
    pending.current = { arg };
    router.push('/profile/edit');
    return true;
  };
}
