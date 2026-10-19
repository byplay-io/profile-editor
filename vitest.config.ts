import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __OFFLINE__: 'false' },
  test: { include: ['test/**/*.test.ts', 'worker/**/*.test.ts'] },
});
