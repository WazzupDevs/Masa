import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'scripts/**/*.test.ts',
      'supabase/functions/_shared/pure/**/*.test.ts',
      // Design tokens: contrast and the no-hard-coded-style guard.
      'apps/mobile/src/theme/**/*.test.ts',
    ],
  },
});
