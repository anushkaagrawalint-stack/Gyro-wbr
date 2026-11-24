import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // vmThreads: the default pools failed to register suites on this machine ("failed to find the current suite")
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 60000, pool: 'vmThreads' },
});
