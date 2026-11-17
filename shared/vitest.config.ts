import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'shared',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{js,ts}'],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        lines: 85,
      },
    },
  },
});
