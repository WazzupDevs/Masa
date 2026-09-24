import { defineConfig } from 'vitest/config';

// Runs against the local Supabase stack: `pnpm supabase start` and `pnpm supabase functions serve`.
export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
