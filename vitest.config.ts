import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    restoreMocks: true,
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/domain/**/*.ts', 'src/webmcp/**/*.ts'],
      exclude: ['**/*.d.ts'],
    },
  },
})
