import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The mobile app's @shared alias (strings import shared helpers).
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared/pure', import.meta.url)),
    },
  },
  test: {
    include: [
      'scripts/**/*.test.ts',
      'supabase/functions/_shared/pure/**/*.test.ts',
      // Design tokens: contrast and the no-hard-coded-style guard.
      'apps/mobile/src/theme/**/*.test.ts',
      // Turkish suffixes built in the strings file.
      'apps/mobile/src/i18n/**/*.test.ts',
    ],
  },
});
