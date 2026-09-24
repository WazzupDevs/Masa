import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts', 'supabase/functions/_shared/pure/**/*.test.ts'],
  },
});
