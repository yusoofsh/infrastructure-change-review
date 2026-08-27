import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/domain/**/*.spec.ts'],
    restoreMocks: true,
    passWithNoTests: false,
  },
})
