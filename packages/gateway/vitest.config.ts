import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		testTimeout: 10000,
		setupFiles: ["./__tests__/setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			include: ["src/**/*.ts"],
			exclude: ["src/index.ts"], // Entry point tested via integration
		},
		// Use projects to run different test sets with different pools.
		// Integration and concurrency tests need isolation (forks pool)
		// to avoid flaky tests from shared state (#70, #72).
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					include: ["__tests__/**/*.test.ts"],
					exclude: [
						"__tests__/e2e/**/*.test.ts",
						"__tests__/integration/**/*.test.ts",
						"__tests__/concurrency.test.ts",
					],
					pool: "threads",
				},
			},
			{
				extends: true,
				test: {
					name: "integration",
					include: ["__tests__/integration/**/*.test.ts"],
					pool: "forks",
				},
			},
			{
				extends: true,
				test: {
					name: "concurrency",
					include: ["__tests__/concurrency.test.ts"],
					pool: "forks",
				},
			},
		],
	},
});
