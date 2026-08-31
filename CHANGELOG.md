# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/).

> [繁體中文版](docs/CHANGELOG.zh-TW.md)

## [Unreleased]

## [1.1.0] - 2026-08-31

### Added

- Strict runtime configuration validation with JSON Schema parity and complete
  paths for unknown fields.
- Stable `incomplete-git-history` and `invalid-git-tag` diagnostics.

### Security

- Commit-derived planning now fails closed on incomplete Git history, and the
  reusable Action completes shallow history when configured to fetch tags.
- Every generated candidate is checked against Git tag-ref rules, and Action
  outputs use collision-resistant multiline delimiters.
- CI audits production dependencies, third-party Actions are pinned to commit
  SHAs, and Dependabot covers npm and GitHub Actions dependencies.

## [1.0.0] - 2026-07-24

Command output, exit codes and configuration are unchanged from `0.9.0`; the
JSON `schemaVersion` remains `1`. This release defines what is contractual and
makes the contract machine-checked.

### Breaking

- `engines.node` is now `>=22`. Tagsmith only promises support for Node
  versions still under LTS support; Node 18 and 20 have both reached
  end-of-life.
- The package declares `exports`, exposing only `schema.json`,
  `json-output.schema.json` and `package.json`. Tagsmith publishes a CLI, not a
  library, so `dist/` modules are no longer importable. The `tagsmith` binary is
  unaffected.

### Added

- A documented stability contract: which surfaces are covered by SemVer (
  commands, flags, exit codes, JSON envelope, diagnostic codes, configuration,
  Action inputs/outputs, supported runtimes) and which are not (human-readable
  text, diagnostic `message` strings, internal module layout).
- A closed diagnostic-code registry in `src/core/diagnostics.ts`, published as
  an enum in `json-output.schema.json` and mirrored in both READMEs.
- Per-command `data` schemas in `json-output.schema.json`, including the two
  shapes `list` emits with and without `--all`, validated against real command
  output by `tests/json-contract.test.ts`.
- `tests/exit-codes.test.ts`, pinning a success and failure case for every
  command.
- A CI workflow running typecheck, build, tests and the coverage threshold on
  Node 22 and 24.

### Changed

- `JsonDiagnostic.code` and `ReleasePlanBlocker.code` are typed as the registry
  union instead of `string`, so an unregistered code is a compile error.

### Removed

- An unreachable `tag-anomaly` fallback code in `next --json`; every anomaly
  already carries a registered code.

## [0.9.0] - 2026-07-24

### Added

- `audit` now proves statically whether two configured tag-line patterns can
  ever accept the same tag name, before any colliding tag exists. Results are
  reported as `data.overlaps` with a witness tag verified against both
  patterns, and as the `pattern-overlap-certain` and
  `pattern-overlap-possible` diagnostics.
- `audit --strict-overlap` raises both overlap diagnostics from warning to
  error so CI can reject an ambiguous configuration.

### Changed

- `CompiledPattern` exposes its literal `prefix` and `suffix`, keeping pattern
  semantics owned by a single module.
- Overlap findings are configuration-level, so `list` output is unchanged and
  already-colliding tags remain the existing `ambiguous-assignment` error.

## [0.8.0] - 2026-07-23

### Added

- Optional `artifact: { "type": "package-json" }` per tag line. `audit` now
  verifies every conforming historical tag against the manifest committed at
  that tag; `create --enforce-policy` can require its candidate's artifact
  version to match through `releasePolicy.requireArtifactVersion`.
- Configurable, ordered `commitPolicy.rules` for team-specific Conventional
  Commit types, scopes, breaking-change handling, and ignored commits.
  Recommendations expose the matching rule for each contributing commit.

### Changed

- Artifact reads stay internal and Git-ref based; Tagsmith never edits package
  manifests, lockfiles, tags, or published artifacts.

## [0.7.0] - 2026-07-23

### Added

- `tagsmith plan --all`, a read-only, configuration-ordered monorepo release
  plan with `ready`, `skipped`, and per-line `blocked` results.
- Workspace-scoped committed-change and Conventional Commit evidence, candidate
  tags, stable blockers, and `hasReleases` in the versioned plan JSON output.
- GitHub Action outputs for the full plan JSON, whether any line is ready, and
  the selected line's next tag.

### Changed

- The JSON envelope now recognizes the `plan` command while retaining schema
  version 1 and the existing diagnostics contract.

## [0.6.0] - 2026-07-23

### Added

- Optional `releasePolicy` guardrails for allowed branches, clean worktrees,
  annotated tags, `HEAD` tag targets, and Git-managed tag signatures.
- `audit --fetch [--remote <name>]` plus pass/warn/fail release-readiness
  checks and stable `release-*` diagnostics in its JSON envelope.
- `create --enforce-policy`, `--target <ref>`, and `--sign` for an explicit,
  locally verifiable release preflight.

### Changed

- `create` reuses audit's pure release-readiness evaluator before it changes
  Git state; policy remains opt-in, so existing create flows are unchanged.

## [0.5.0] - 2026-07-23

### Added

- `tagsmith audit`, a read-only complete-history audit for malformed or
  duplicate versions, orphan tags, and tag-line assignment ambiguity.
- A versioned JSON output envelope for `list`, `check`, `next`, and `audit`,
  plus the published `json-output.schema.json` contract.
- `ambiguous-assignment` diagnostics and `matches` in check results, so a tag
  matching multiple configured lines is never silently owned by the first one.

### Changed

- `next` and `create` now refuse a tag line affected by ambiguous tag history.
- The reusable GitHub Action runs `audit --json` after fetching tags.

## [0.4.0] - 2026-07-23

### Added

- Remote-aware release planning: `next --fetch` and `create --push` fetch tags
  before choosing a version; `--remote` selects a different remote.
- `check --strict` validates proposed versions against local tag history and
  exposes its mode in JSON output.
- Reusable GitHub Action that builds Tagsmith, fetches tags, and runs strict
  validation in CI.
- Monorepo-scoped tag lines with `workspace` and `--require-changes`, so a
  package releases only after its own committed changes; Conventional Commit
  recommendations are scoped to that workspace too.
- `next --from-commits` and `create --from-commits` for SemVer bump
  recommendations based on Conventional Commits.
- JSON Schema support for both multi-line and legacy configuration shapes,
  including workspace-scoped lines.

## [0.3.1] - 2026-06-11

### Fixed

- Do not roll back a valid merge commit in the `post-merge` check. The check now
  applies only to genuine fast-forward merges.
- Allow a protected branch to fast-forward from its own remote tracking branch;
  this is synchronization, not a cross-branch merge.

## [0.3.0] - 2026-06-11

### Added

- Optional merge policies that allow or deny source branches for protected
  branches, with `*` and `?` glob support.
- `merge-check`, plus `hooks install` and `hooks uninstall`, for local
  merge-policy enforcement through managed git hooks.
- Atomic hook installation: unmanaged hooks are left untouched unless `--force`
  is explicitly supplied.
- `TAGSMITH_SKIP=1` and `HUSKY=0` emergency bypasses for merge checks.
- JSON Schema support for `mergePolicy`.

## [0.2.1] - 2026-06-11

### Fixed

- Read the CLI version from `package.json` rather than a stale hard-coded value.

### Documentation

- Updated package naming, zero-configuration guidance, and schema paths across
  the README, contributing guide, and Husky guide.

## [0.2.0] - 2026-06-11

### Added

- Public npm publication as `@carllee1983/tagsmith`, while retaining the
  `tagsmith` executable name.
- Multiple independent tag lines, selected with `--tag`; legacy flat
  configuration is automatically treated as a `default` line.
- `check` command, `guide` command, `list --all`, JSON output, and next-step
  guidance for interactive commands.
- Zero-configuration SemVer operation that infers common existing tag patterns.
- Husky `pre-push` documentation and template.

## [0.1.0] - 2026-06-10

### Added

- Initial CLI with `init`, `list`, `next`, and `create` commands.
- SemVer, CalVer, and build-number version models, plus configurable tag
  patterns and a JSON Schema.
- Safety checks for pattern conformance, version parsing, strict ordering, and
  duplicate tag names.
- A three-layer core/git/CLI architecture and unit, integration, and CLI E2E
  test coverage.

[Unreleased]: https://github.com/CarlLee1983/Tagsmith/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/CarlLee1983/Tagsmith/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/CarlLee1983/Tagsmith/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/CarlLee1983/Tagsmith/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CarlLee1983/Tagsmith/releases/tag/v0.1.0
