import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/e2e/**/*.test.ts"],
    testTimeout: 120000, // E2E tests may take longer with real CLI
  },
});
