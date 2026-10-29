import { defineConfig } from 'vitest/config'

// Unit tests cover pure logic only; browser behaviour is tested with Playwright (e2e/).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
