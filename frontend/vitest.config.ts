import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Unit tests only. The Playwright E2E specs live in tests/ and must not be
    // picked up by vitest.
    include: ['lib/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'tests'],
  },
});
