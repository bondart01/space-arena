import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'shared/vitest.config.ts',
      'server/vitest.config.ts',
      'client/vitest.config.ts',
    ],
  },
});
