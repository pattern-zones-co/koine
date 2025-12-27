# Changelog

## [2.2.0](https://github.com/pattern-zones-co/koine/compare/v2.1.0...v2.2.0) (2025-12-27)


### Features

* **gateway:** use native --json-schema for structured output ([#68](https://github.com/pattern-zones-co/koine/issues/68)) ([1e14a82](https://github.com/pattern-zones-co/koine/commit/1e14a82fa398a6a7d6aee035e7dc757c1a743fa3))
* **stream-object:** add /stream-object endpoint with SDK support ([#73](https://github.com/pattern-zones-co/koine/issues/73)) ([9ed751e](https://github.com/pattern-zones-co/koine/commit/9ed751e6edeb2b519b3dabd277bce7da2734e053))


### Bug Fixes

* **gateway:** resolve flaky tests from port conflicts and shared state ([#75](https://github.com/pattern-zones-co/koine/issues/75)) ([a34fa7d](https://github.com/pattern-zones-co/koine/commit/a34fa7d64274231da24e3b15170d3d78f588f7a9))

## [2.1.0](https://github.com/pattern-zones-co/koine/compare/v2.0.4...v2.1.0) (2025-12-26)


### Features

* **gateway:** add concurrency limits for request handling ([#65](https://github.com/pattern-zones-co/koine/issues/65)) ([c36a43d](https://github.com/pattern-zones-co/koine/commit/c36a43d2b39d93f1fe6e609a7e298fee6d93c3bd))


### Documentation

* add CLAUDE.md for Claude Code guidance ([e37f9b3](https://github.com/pattern-zones-co/koine/commit/e37f9b3331ab397289ba96d2a8127f393ffd50f8))

## [2.0.4](https://github.com/pattern-zones-co/koine/compare/v2.0.3...v2.0.4) (2025-12-26)


### Documentation

* add link to openapi.yaml in api-reference ([39b3424](https://github.com/pattern-zones-co/koine/commit/39b34243caf28da906a0184349053c3427108582))
* recommend API keys over OAuth tokens for automation ([e7dd97d](https://github.com/pattern-zones-co/koine/commit/e7dd97d683521307830e665d1e044f8a54bcce47))


### Code Refactoring

* **test:** replace setTimeout with deterministic spawn polling ([#63](https://github.com/pattern-zones-co/koine/issues/63)) ([bd2a7c6](https://github.com/pattern-zones-co/koine/commit/bd2a7c6bb06cb90579507f7aac8e53be88c1ae5b))

## [2.0.3](https://github.com/pattern-zones-co/koine/compare/v2.0.2...v2.0.3) (2025-12-26)


### Documentation

* add PNG logo to README ([bff3527](https://github.com/pattern-zones-co/koine/commit/bff3527107fedb1634f40d7edbe41bc015bf3135))
* fix api-reference.md inconsistencies ([8052a2c](https://github.com/pattern-zones-co/koine/commit/8052a2c10b9b86d295ed1e674d9917c74af01395))
* left-align logo ([0d8bbac](https://github.com/pattern-zones-co/koine/commit/0d8bbacde6636ede4bb4988ce88ac4b4be1593b3))
* replace header with ASCII art logo ([8591683](https://github.com/pattern-zones-co/koine/commit/8591683dde4642f4a1117c11cc687bff32fdba72))
* revert to ASCII art logo ([7a72d3d](https://github.com/pattern-zones-co/koine/commit/7a72d3d950f1379a85b4a68738e39037456e8104))
* revert to simple heading, remove logo ([9e658f7](https://github.com/pattern-zones-co/koine/commit/9e658f747fa3d86461badd8232eeb9c0e7fc7e78))
* update SDK examples to factory pattern, add example READMEs ([50bbfcb](https://github.com/pattern-zones-co/koine/commit/50bbfcb2b0caad6e005c3eeb705569a9715ed04f))
* use pre tag for tighter ASCII logo rendering ([ce5548c](https://github.com/pattern-zones-co/koine/commit/ce5548ce2335975b7062b56cc54a69ced93ec307))

## [2.0.2](https://github.com/pattern-zones-co/koine/compare/v2.0.1...v2.0.2) (2025-12-25)


### Bug Fixes

* **sdk:** correct license expression to AGPL-3.0 + Commercial dual license ([a5dc0be](https://github.com/pattern-zones-co/koine/commit/a5dc0be9f5e8842fe35818182f08fbbefe009319))


### Documentation

* rewrite README for better developer uptake ([886e276](https://github.com/pattern-zones-co/koine/commit/886e27638cf207bd42c37ad75541f219d54cee80))

## [2.0.1](https://github.com/pattern-zones-co/koine/compare/v2.0.0...v2.0.1) (2025-12-25)


### Documentation

* update SDK docs for 2.0 breaking changes ([#54](https://github.com/pattern-zones-co/koine/issues/54)) ([a90095f](https://github.com/pattern-zones-co/koine/commit/a90095f2727edb9d17a338cd81f6483b046daa00))

## [2.0.0](https://github.com/pattern-zones-co/koine/compare/v1.1.6...v2.0.0) (2025-12-25)


### ⚠ BREAKING CHANGES

* **sdk:** Remove standalone functions in favor of factory pattern.
* stream_text now returns a context manager instead of a coroutine. Must use `async with stream_text(...)` instead of `await stream_text(...)`.

### Features

* **ci:** add automated PyPI publishing for Python SDK ([#52](https://github.com/pattern-zones-co/koine/issues/52)) ([dbe045c](https://github.com/pattern-zones-co/koine/commit/dbe045cb330663d0571f89f1ab66c1a8e5e92a9d))
* Python SDK for Koine gateway ([#42](https://github.com/pattern-zones-co/koine/issues/42)) ([65ef9b7](https://github.com/pattern-zones-co/koine/commit/65ef9b7b2e6af2f89bc94ca18d46a6424d0dcec2))


### Bug Fixes

* **ci:** improve issue triage workflow and disable PR review ([#44](https://github.com/pattern-zones-co/koine/issues/44)) ([be4f1e2](https://github.com/pattern-zones-co/koine/commit/be4f1e2fad7277e10caca1fc0a9bcaff4d54fd67))
* **sdk:** address TypeScript SDK review findings ([#48](https://github.com/pattern-zones-co/koine/issues/48)) ([a5da0f3](https://github.com/pattern-zones-co/koine/commit/a5da0f3f295d6f47927cdc0a4a4aad152e3e80c4))


### Code Refactoring

* move SDK examples into package directories ([#46](https://github.com/pattern-zones-co/koine/issues/46)) ([6f1a098](https://github.com/pattern-zones-co/koine/commit/6f1a098761bdceeb7e16ab5c419d4e5f712a3a91)), closes [#40](https://github.com/pattern-zones-co/koine/issues/40)
* **sdk:** Python SDK modular architecture with factory pattern ([#50](https://github.com/pattern-zones-co/koine/issues/50)) ([6ae0ddf](https://github.com/pattern-zones-co/koine/commit/6ae0ddfafa8e5c6b187982281525af8d998a4947))

## [1.1.6](https://github.com/pattern-zones-co/koine/compare/v1.1.5...v1.1.6) (2025-12-25)


### Bug Fixes

* **ci:** pin biome version to match project dependency ([e6a7bbe](https://github.com/pattern-zones-co/koine/commit/e6a7bbefe8ebe4f41fe5faf11a3eec7503e94fb9))
* **ci:** use bunx to run biome without full dependency install ([ae022d8](https://github.com/pattern-zones-co/koine/commit/ae022d86cdbebb7f80343ad5219cf44bf061ab61))
* **ci:** use fromJson to extract PR branch from release-please output ([b1eda71](https://github.com/pattern-zones-co/koine/commit/b1eda71eadd68bd08fb998010ce22618c1557646))
* **docker:** consolidate dev service into single build+image service ([#35](https://github.com/pattern-zones-co/koine/issues/35)) ([84d7f60](https://github.com/pattern-zones-co/koine/commit/84d7f60b5c199b458bf035e320ce1ae58724fc3f))
* **gateway:** enable progressive SSE streaming ([#34](https://github.com/pattern-zones-co/koine/issues/34)) ([dc4c570](https://github.com/pattern-zones-co/koine/commit/dc4c570e4b1e9de154142fcf74ec4fffd5197998))

## [1.1.5](https://github.com/pattern-zones-co/koine/compare/v1.1.4...v1.1.5) (2025-12-25)


### Documentation

* add SDK examples for TypeScript client ([#32](https://github.com/pattern-zones-co/koine/issues/32)) ([6aa7bcb](https://github.com/pattern-zones-co/koine/commit/6aa7bcbb802d348ccb157bebc3ac9fb5d6edaa56))

## [1.1.4](https://github.com/pattern-zones-co/koine/compare/v1.1.3...v1.1.4) (2025-12-25)


### Documentation

* update for Docker-first deployment and dual license ([#28](https://github.com/pattern-zones-co/koine/issues/28)) ([b4a18bd](https://github.com/pattern-zones-co/koine/commit/b4a18bd64e2522a8862405311b3d2da61f8ca2b3))

## [1.1.3](https://github.com/pattern-zones-co/koine/compare/v1.1.2...v1.1.3) (2025-12-25)


### Bug Fixes

* **ci:** skip lint in release ci-checks job ([5d0bf71](https://github.com/pattern-zones-co/koine/commit/5d0bf71b588b7628c227d1fe461cbffd865831ef))

## [1.1.2](https://github.com/pattern-zones-co/koine/compare/v1.1.1...v1.1.2) (2025-12-25)


### Code Refactoring

* **ci:** unify release workflows with chaining pattern ([#25](https://github.com/pattern-zones-co/koine/issues/25)) ([d35e3c5](https://github.com/pattern-zones-co/koine/commit/d35e3c5c7d18a5fcec395ae6df9946653c584152))

## [1.1.1](https://github.com/pattern-zones-co/koine/compare/v1.1.0...v1.1.1) (2025-12-25)


### Bug Fixes

* **ci:** use push tag trigger for Docker workflow ([e35e029](https://github.com/pattern-zones-co/koine/commit/e35e029d28fd418b1414403d36d649c27bd3e89e))

## [1.1.0](https://github.com/pattern-zones-co/koine/compare/v1.0.0...v1.1.0) (2025-12-24)


### Features

* add automated releases with semantic versioning ([#19](https://github.com/pattern-zones-co/koine/issues/19)) ([#21](https://github.com/pattern-zones-co/koine/issues/21)) ([42b5644](https://github.com/pattern-zones-co/koine/commit/42b56440f983fcb63f2eb22331e7f52b5feffc42))
* add CI workflows and pre-commit hooks ([#7](https://github.com/pattern-zones-co/koine/issues/7)) ([2dee07c](https://github.com/pattern-zones-co/koine/commit/2dee07cca24e06c5e6e03d62c78e0bae79b1a09c))
* add SDK integration tests with real HTTP requests ([#14](https://github.com/pattern-zones-co/koine/issues/14)) ([a3f2578](https://github.com/pattern-zones-co/koine/commit/a3f25783f2a6da98b08c41cd75f20a1f24a5cde9))
* automated PR agents ([8d77edc](https://github.com/pattern-zones-co/koine/commit/8d77edc708f3800a9d41376461e9bf5afd1cf549))


### Bug Fixes

* improve CI workflows and issue triage automation ([#11](https://github.com/pattern-zones-co/koine/issues/11)) ([e6c3cba](https://github.com/pattern-zones-co/koine/commit/e6c3cbaa913159d0563f1bfdcfea33d36ba961fb))
* Update CLI parser for new usage stats format ([f6384c4](https://github.com/pattern-zones-co/koine/commit/f6384c481cc8b22e138db88b477ba4c1017f8d14))


### Documentation

* Add Claude Code instructions ([c010817](https://github.com/pattern-zones-co/koine/commit/c010817ea1abb7517d3619014e65c5f5e8ac228b))
* add Codecov badge to README ([c3921c5](https://github.com/pattern-zones-co/koine/commit/c3921c5cd20c29b503760c0269040352430fb646))
* Add concurrency limits and queuing to roadmap ([bb146e1](https://github.com/pattern-zones-co/koine/commit/bb146e193889adb96bb6a88dd5078d42375fc117))
* Add contributing guidelines ([8a2444d](https://github.com/pattern-zones-co/koine/commit/8a2444df2f57e6c475ec6c0237d37d44879587b8))
* Add terms of service warning to README ([c1d72d7](https://github.com/pattern-zones-co/koine/commit/c1d72d76cdbc0133432fb768822e3abefe64805c))
* Add terms of use warning for OAuth vs API key authentication ([2b61820](https://github.com/pattern-zones-co/koine/commit/2b6182004e1d2f929103ebfd47804d28e898e5ed))
* fix project structure in README ([fed2b6b](https://github.com/pattern-zones-co/koine/commit/fed2b6bb7a05766cde3912bc85c133a45d5ec6a3))
* Remove MIT license references (license TBD) ([8a95019](https://github.com/pattern-zones-co/koine/commit/8a95019e451846b6443dbbcb2a3f057df15c3e80))
* restructure documentation for Docker-first deployment ([#18](https://github.com/pattern-zones-co/koine/issues/18)) ([309cee4](https://github.com/pattern-zones-co/koine/commit/309cee478250a66d2412a530d9091838b9c5b066))
* update README to use bun instead of pnpm ([e92d4ef](https://github.com/pattern-zones-co/koine/commit/e92d4ef25568de3ced8a30e40ad2984e001774f0))
* Update Terms of Service warning in README ([8132c70](https://github.com/pattern-zones-co/koine/commit/8132c70390958d817e771b8fe1f3be2b677fa472))
* Use GitHub warning alert syntax ([cdfd763](https://github.com/pattern-zones-co/koine/commit/cdfd763ac2e0ae27f6f0b2d66f8d3fbbd740b088))


### Code Refactoring

* Move SDK to packages/sdks/typescript for multi-language support ([2081ff5](https://github.com/pattern-zones-co/koine/commit/2081ff5d6383f6d7c871d731b2fb34d02145d515))
* Rename project from claude-code-gateway to Koine ([148a066](https://github.com/pattern-zones-co/koine/commit/148a066dba1bde6f90af75cb09642d397b11f931))
