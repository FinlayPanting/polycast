import { defineConfig } from 'vitest/config'

// Unit tests for app logic that doesn't touch React Native (player controller, formatting).
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } })
