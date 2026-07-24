# Contributing to Tagsmith

Thanks for helping improve Tagsmith. This guide covers the development setup,
architecture boundaries, and expectations for a change.

> [繁體中文版](docs/CONTRIBUTING.zh-TW.md)

## Development setup

Requirements: Node.js 22 or newer and git.

This repository contains the package source. The published npm package is
[`@carllee1983/tagsmith`](https://www.npmjs.com/package/@carllee1983/tagsmith),
while the installed CLI remains `tagsmith`.

```bash
git clone <repo>
cd Tagsmith
npm install

npm run dev -- list  # Run the TypeScript source directly
npm test             # Run all tests
npm run test:watch   # Watch mode
npm run coverage     # Coverage, with an 80% threshold
npm run typecheck    # Type-check only
npm run build        # Compile to dist/
```

## Architecture

The codebase has three independently testable layers:

| Layer | Path | Responsibility | Constraint |
| --- | --- | --- | --- |
| Core | `src/core/` | Patterns, version models, analysis, planning, config validation | Pure functions; no I/O or clock access |
| Git | `src/git/` | Small wrapper around git commands | I/O only; use `execFile` with argument arrays and no shell |
| CLI | `src/cli/` | Commander setup and output | Parse options, call core/git, format output |

See the [original design record](docs/history/designs/2026-06-10-tagsmith-design.md)
for the initial design decisions.

## Configuration changes

`.tagsmith.json` accepts both a multi-line format and the legacy flat format.
`parseConfig` in `src/core/config.ts` normalizes either form to
`TagsmithConfig { lines: TagLine[], default: string }`.

When adding configuration fields, check both `lineSchema` (multi-line input) and
`legacyConfigSchema` (flat input). Add schema coverage and retain backwards
compatibility unless a breaking change has been explicitly planned.

## Adding a version model

1. Add a `create<Name>Model()` factory in `src/core/models/<name>.ts`.
2. Add its configuration type to the `ModelConfig` union in `src/types.ts`.
3. Add its branch to `modelSchema` in `src/core/config.ts`.
4. Register it in the `createModel()` switch in `src/core/models/index.ts`.
5. Add the JSON Schema branch in `schema.json`.
6. Add interactive and default handling in `src/cli/init.ts`.
7. Test parsing, comparison, bumping, and formatting.

Model rules:

- Keep model logic pure. Inject time (as CalVer does); do not call `new Date()`
  or use randomness.
- Reject non-canonical strings: parsing must satisfy
  `format(parse(value)) === value`.
- Ensure `bump` returns a strictly greater version, or throw so `plan.ts` can
  prevent an unsafe tag.
- Bound numeric parsing to avoid exceeding `Number.MAX_SAFE_INTEGER`.

## Tests and pull requests

- Add a failing test before implementing new behavior or a bug fix.
- Preserve the 80% project coverage threshold.
- Unit tests live in focused `tests/*.test.ts` files; integration tests create
  temporary git repositories; CLI end-to-end tests use the built binary.
- Run `npm run build` before CLI E2E tests.
- Documentation governance runs [Docsentry](https://github.com/CarlLee1983/Docsentry)
  on every pull request and `main` push. It verifies active user-facing Markdown
  against `package.json`, `schema.json`, and `action.yml`; historical records in
  `docs/history/` are intentionally excluded.
- Use Conventional Commits: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
  `test`, or `chore`, optionally followed by a scope.
- Before opening a pull request, run `npm run typecheck`, `npm test`, and
  `npm run build`; update the `[Unreleased]` section of `CHANGELOG.md` when
  appropriate.
