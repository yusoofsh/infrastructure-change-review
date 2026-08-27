import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/contract/**/*.spec.ts'],
    restoreMocks: true,
    passWithNoTests: false,
  },
})
