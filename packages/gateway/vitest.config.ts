import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		testTimeout: 10000,
		setupFiles: ["./__tests__/setup.ts"],
		include: ["__tests__/**/*.test.ts"],
		exclude: ["__tests__/e2e/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			include: ["src/**/*.ts"],
			exclude: ["src/index.ts"], // Entry point tested via integration
		},
	},
});
