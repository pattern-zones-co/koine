/** @type {import('@commitlint/types').UserConfig} */
export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"type-enum": [
			2,
			"always",
			[
				"feat", // New feature
				"fix", // Bug fix
				"docs", // Documentation only
				"style", // Formatting, missing semicolons, etc
				"refactor", // Code change that neither fixes a bug nor adds a feature
				"perf", // Performance improvement
				"test", // Adding missing tests
				"build", // Changes to build process or dependencies
				"ci", // CI configuration changes
				"chore", // Other changes that don't modify src or test files
				"revert", // Reverts a previous commit
			],
		],
		"subject-case": [2, "always", "lower-case"],
		"subject-empty": [2, "never"],
		"subject-full-stop": [2, "never", "."],
		"type-case": [2, "always", "lower-case"],
		"type-empty": [2, "never"],
		"body-max-line-length": [0, "always", 100], // Disable body line length limit
	},
};
