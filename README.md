# Tagsmith

[![npm version](https://img.shields.io/npm/v/@carllee1983/tagsmith.svg)](https://www.npmjs.com/package/@carllee1983/tagsmith)

Define a git-tag convention, inspect the tags already in a repository, and safely
generate the next one. Tagsmith prevents format drift, duplicate versions, and
out-of-order releases before a tag is created or pushed.

Supports **SemVer**, **CalVer**, and monotonically increasing **build numbers**.
Tag formats are configurable, including `v{version}` and `release/{version}`.

> [繁體中文文件](docs/README.zh-TW.md) · [Documentation index](docs/README.md)

## Why Tagsmith?

- **Standardize** — keep the project's tag convention in `.tagsmith.json`.
- **Inspect** — list or audit tags in semantic order and identify format,
  parsing, duplicate-version, orphan, and tag-line assignment problems.
- **Create safely** — validate the format, parseability, strict version ordering,
  and tag uniqueness before creating a tag.
- **Start with zero configuration** — infer a SemVer-style pattern from existing
  tags when no configuration file exists.
- **Support multiple release lines** — give independent version models and tag
  patterns to application, release, or other tag lines.
- **Plan monorepo releases** — inspect every line's committed changes, candidate
  tag, and blockers before choosing which existing create commands to run.
- **Release safely with a team** — fetch remote tags before a push and use the
  included GitHub Action to enforce the same checks in CI.
- **Check release readiness** — optionally require the correct branch, a clean
  worktree, an annotated or signed tag, and a `HEAD` target before creation.
- **Guard merges locally** — optionally restrict which branches may merge into
  protected branches through managed git hooks.

## Install

```bash
# Install globally (the command is still named `tagsmith`)
npm install -g @carllee1983/tagsmith

# Or run without installing
npx @carllee1983/tagsmith <command>

# Add to a project for CI or hooks
npm install -D @carllee1983/tagsmith
# Then run: npx tagsmith <command>
```

Requirements: Node.js >=18 and git.

## Quick start

### Zero configuration

In a repository that already has SemVer-like tags such as `v0.1.0`:

```bash
tagsmith list                    # Inspect existing tags
tagsmith next                    # Preview the next patch tag
tagsmith next --level minor      # For example: v0.1.0 → v0.2.0
tagsmith create --push           # Create and push the tag
```

Without `.tagsmith.json`, Tagsmith uses SemVer and `v{version}` by default and
infers common existing formats such as `{version}`. For a team repository, run
`tagsmith init` and commit the generated configuration to make the convention
explicit.

### Configure a project

```bash
# 1. Define the convention in the current repository (interactive and optional)
tagsmith init

# Need help? Use the interactive walkthrough
tagsmith guide

# 2. Inspect tags and anomalies
tagsmith list

# 3. Preview a tag without changing the repository
tagsmith next --level minor

# 4. Create and push an annotated tag
tagsmith create --level minor -m "Release 1.2.0" --push
```

## Configuration

`tagsmith init` creates `.tagsmith.json` in the repository root. A configuration
can define one or more independent tag lines:

```json tagsmith-config
{
  "tags": [
    {
      "name": "app",
      "pattern": "v{version}",
      "model": { "type": "semver", "allowPrerelease": true },
      "initialVersion": "0.1.0",
      "push": false
    },
    {
      "name": "release",
      "pattern": "release/{version}",
      "model": { "type": "calver", "format": "YYYY.MM.MICRO" },
      "initialVersion": "2026.06.0",
      "push": true
    }
  ],
  "default": "app"
}
```

Each line has its own pattern and version sequence. Select a non-default line
with `--tag <name>`.

| Field | Required | Meaning |
| --- | :---: | --- |
| `name` | Yes | Unique line name, used by `--tag` |
| `pattern` | Yes | Tag format containing `{version}` |
| `model` | Yes | Version-model object |
| `initialVersion` | Yes | Starting point when no valid tag exists |
| `push` | No | Whether `create` pushes by default (`false`) |
| `workspace` | No | Repository-relative monorepo path used by `--require-changes` |
| `artifact` | No | `{ "type": "package-json" }` version source for this line |
| `default` | No | Default line; defaults to the first item in `tags` |

The legacy single-line format remains supported. It is normalized internally as
a line named `default`, so existing users do not need to migrate.

```json tagsmith-config
{
  "pattern": "v{version}",
  "model": { "type": "semver", "allowPrerelease": true },
  "initialVersion": "0.1.0",
  "push": false
}
```

Add `"$schema": "./node_modules/@carllee1983/tagsmith/schema.json"` to enable
editor completion and validation.

### Monorepo workspaces

A tag line can be scoped to a package path. The existing `--tag` selector then
keeps each workspace's tag sequence independent, while `--require-changes`
prevents a release when that package has not changed since its latest tag.
When using `--from-commits`, Tagsmith likewise considers only commits that
touch the selected workspace.

```json tagsmith-config
{
  "tags": [
    {
      "name": "api",
      "workspace": "packages/api",
      "pattern": "api/v{version}",
      "model": { "type": "semver" },
      "initialVersion": "0.1.0"
    }
  ],
  "default": "api"
}
```

```bash
tagsmith next --tag api --require-changes
tagsmith create --tag api --require-changes --push
tagsmith plan --all --from-commits
```

`workspace` must stay inside the repository and is evaluated against committed
changes only. It is optional, so existing single-repository configurations are
unchanged. `plan --all` reads every configured line: it scopes lines with a
`workspace` to that package and evaluates an unscoped line against the entire
repository.

### Artifact version consistency

Add `artifact: { "type": "package-json" }` to a line to make its package
manifest a version source. Tagsmith reads `workspace/package.json`, or the
repository-root `package.json` for an unscoped line. The `version` must parse
under the line's version model and exactly match the tag version without its
tag-pattern prefix or suffix.

```json tagsmith-config
{
  "tags": [{
    "name": "api",
    "workspace": "packages/api",
    "pattern": "api/v{version}",
    "model": { "type": "semver" },
    "initialVersion": "0.1.0",
    "artifact": { "type": "package-json" }
  }],
  "releasePolicy": { "requireArtifactVersion": true }
}
```

`audit` reads the manifest from each historical tag, so an in-progress local
version bump cannot invalidate a previous release. With the policy flag,
`create --enforce-policy` reads the selected target commit and blocks a missing,
malformed, invalid, or mismatched manifest. Tagsmith never edits manifests,
lockfiles, or artifacts.

### Release readiness

An optional top-level `releasePolicy` records local, pre-create guardrails. It
is disabled by default: existing `create` behaviour changes only when you add
the policy **and** pass `--enforce-policy`.

```json tagsmith-config
{
  "pattern": "v{version}",
  "model": { "type": "semver" },
  "initialVersion": "0.1.0",
  "releasePolicy": {
    "allowedBranches": ["main", "release/*"],
    "requireCleanWorktree": true,
    "requireAnnotatedTag": true,
    "requireHeadTag": true,
    "signature": "required",
    "requireArtifactVersion": true
  }
}
```

`allowedBranches` supports `*` and `?` globs. A clean worktree includes no
staged, unstaged, or untracked files. `requireAnnotatedTag` needs `--message`;
`signature: "required"` needs `--sign --message "…"` and a Git signing key.
`requireHeadTag` applies to the candidate being created, not old tags; use
`--target <ref>` only when an intentional non-`HEAD` target is needed.
`requireArtifactVersion` requires the selected line to configure a supported
artifact and makes its version match the candidate tag at the candidate target.

Use `tagsmith audit` to inspect the configured branch/worktree rules. It makes
no remote request unless `--fetch` is explicit. `tagsmith create --enforce-policy`
runs the same checks with the concrete tag candidate before it changes Git state.

### Version models

| Model | Example | Model setting | Increment |
| --- | --- | --- | --- |
| `semver` | `1.2.3`, `1.2.3-rc.1` | `allowPrerelease` (default `true`) | `major`, `minor`, `patch`, `prerelease` |
| `calver` | `2026.06.0` | `format`: `YYYY`, `YY`, `MM`, `DD`, `MICRO` | Rolls by date; increments `MICRO` on the same date |
| `build` | `0042` | `padding` (default `0`) | Increments by one |

For CalVer, numeric token widths are strict: `YYYY` has four digits, `YY`,
`MM`, and `DD` have two, and `MICRO` has no leading zero. This prevents
non-canonical tags from representing the same version.

## Commands

| Command | Purpose |
| --- | --- |
| `tagsmith init` | Interactively create a tag specification (optional) |
| `tagsmith guide` | Walk through init → list → next → create |
| `tagsmith list` / `ls` | List tags in semantic order and report anomalies |
| `tagsmith audit` | Audit tag history plus configured release readiness |
| `tagsmith plan --all` | Plan read-only releases across every configured tag line |
| `tagsmith check [tags...]` | Validate supplied tags, or all repository tags with no arguments |
| `tagsmith next` | Compute the next valid tag without creating it |
| `tagsmith create` | Create the next or an explicit tag after validation |
| `tagsmith hooks install` | Install merge-policy hooks |
| `tagsmith hooks uninstall` | Remove only Tagsmith-managed merge-policy hooks |

Useful options:

```bash
tagsmith list --all                    # Show every configured line and orphan tags
tagsmith audit --json                  # Machine-readable complete tag audit
tagsmith audit --fetch --remote origin # Include freshly fetched remote tags
tagsmith audit --strict-overlap        # Fail when two patterns can collide
tagsmith plan --all --json             # Read every line's release decision
tagsmith plan --all --from-commits     # Use Conventional Commits for SemVer lines
tagsmith check --strict --json         # Audit tag shape and duplicate versions
tagsmith next --fetch --remote origin  # Include tags fetched from a remote
tagsmith next --from-commits           # Recommend a SemVer bump from commits
tagsmith next --tag api --require-changes
tagsmith create --level minor --push   # Create and push a minor release
tagsmith create --set-version 1.0.5 --allow-out-of-order
tagsmith create --level major --dry-run
tagsmith create --enforce-policy -m "Release 1.2.0"
```

`next` and `create` accept `--level major|minor|patch|prerelease|auto`.
`--from-commits` is an alternative to `--level` for SemVer lines: a breaking
change recommends `major`, `feat` recommends `minor`, and `fix` or `perf`
recommends `patch`. For a workspace-scoped line, the recommendation considers
only commits that touch that workspace. `create` also accepts `--message`, `--set-version`,
`--push`, `--dry-run`, and `--allow-out-of-order`.

### Commit policy

When `commitPolicy` is absent, those default Conventional Commit rules remain
unchanged. To use a team-specific taxonomy, declare ordered rules. The first
matching rule wins; a rule can filter exact `type`, `scope`, and `breaking`
status, then set one `release` level or `ignore: true`. Unmatched commits are
ignored when a custom policy is configured.

```json
{
  "commitPolicy": {
    "rules": [
      { "name": "breaking", "breaking": true, "release": "major" },
      { "name": "product work", "type": "product", "release": "minor" },
      { "name": "website docs", "type": "docs", "scope": "website", "release": "patch" },
      { "type": "docs", "ignore": true }
    ]
  }
}
```

`next --from-commits`, `create --from-commits`, and `plan --all --from-commits`
all include the contributing commit IDs, summaries, and matching rule in their
recommendation evidence.

### Planning monorepo releases

`tagsmith plan --all` is a read-only multi-line decision. Every configured
line is reported in configuration order as `ready`, `skipped`, or `blocked`.
A ready line supplies a candidate that matches `tagsmith next --tag <name>`;
unchanged workspaces are skipped, not errors. The plan never creates or pushes
tags.

| Flag | Meaning |
| --- | --- |
| `--all` | Required acknowledgement that every configured line will be inspected |
| `--json` | Output the versioned plan envelope for CI or scripts |
| `--fetch` / `--remote <name>` | Fetch tags before planning (default remote: `origin`) |
| `--from-commits` | Derive SemVer bumps from Conventional Commits; non-SemVer lines are blocked explicitly |
| `--require-changes` | Require every line to define `workspace`; unchanged lines remain `skipped` |

```jsonc
// tagsmith plan --all --from-commits --json
{
  "schemaVersion": 1,
  "command": "plan",
  "ok": true,
  "data": {
    "defaultLine": "api",
    "hasReleases": true,
    "lines": [
      {
        "line": "api",
        "workspace": "packages/api",
        "status": "ready",
        "changed": true,
        "bump": "minor",
        "candidate": { "tag": "api/v1.3.0", "version": "1.3.0", "fromVersion": "1.2.0", "fresh": false },
        "recommendation": { "level": "minor", "reasons": [{ "id": "…", "level": "minor", "rule": "default.feat", "summary": "feat(api): add search" }] },
        "commits": [{ "id": "…", "summary": "feat(api): add search" }],
        "blockers": [],
        "anomalies": []
      },
      { "line": "web", "status": "skipped", "changed": false, "bump": null, "candidate": null }
    ]
  },
  "diagnostics": []
}
```

`blocked` lines make the command exit non-zero and include stable diagnostic
codes such as `ambiguous-assignment`, `workspace-required`, or
`from-commits-unsupported`; the other lines are still available in the result.

### Auditing assignment safety

`tagsmith audit` is a read-only repository check. It reports malformed and
duplicate versions, tags that no configured line owns, and tags whose pattern
matches more than one line. An ambiguous tag is not silently assigned according
to configuration order: `next` and `create` refuse to use a line affected by
that history until it is resolved.

For a line with a package-json artifact, audit also checks the exact manifest
stored at every conforming historical tag. It reports stable errors for a
missing or malformed manifest, missing/invalid version, or version mismatch.

Audit also proves, without any tag being involved, whether two configured
patterns can ever accept the same tag name. `data.overlaps` lists each proven
pair together with a witness tag that both patterns match, so the finding can
be reproduced directly:

```jsonc
// tagsmith audit --json, for lines "v{version}" and "v{version}-rc"
"overlaps": [
  {
    "a": "app",
    "b": "rc",
    "verdict": "overlapping",
    "witness": "v0.1.0-rc",
    "witnessSource": "line-version",
    "witnessOrigin": { "line": "rc", "version": "0.1.0" }
  }
]
```

`pattern-overlap-certain` means one line really renders a tag the other line
also matches; `pattern-overlap-possible` means the patterns intersect only
through a tag no configured initial version produces today. Both are warnings,
because the collision has not happened yet — the existing `ambiguous-assignment`
error still covers tags that already collide. Pass `--strict-overlap` to treat
either code as an error and fail the audit.

Every `--json` result from `list`, `check`, `next`, `audit`, and `plan` uses the same
versioned envelope. Read command-specific fields from `data`, and make
automation decisions from stable diagnostic `code` values rather than parsing
human-readable messages:

```json
{
  "schemaVersion": 1,
  "command": "next",
  "ok": true,
  "data": { "tag": "v1.3.0" },
  "diagnostics": []
}
```

The published [JSON output schema](json-output.schema.json) describes the common
envelope. Existing scripts that previously read `.tag` should read `.data.tag`.

When `releasePolicy` is configured, audit also reports `PASS`, `WARN`, or
`FAIL` checks for the current branch and worktree. Candidate-only checks
(annotation, signature, and target) are marked not applicable until `create
--enforce-policy` supplies the tag it intends to make. In JSON, use the stable
`release-*` diagnostic codes rather than parsing messages.

## Remote safety and CI

`create --push` fetches tags from `origin` before choosing a version, so a
stale local clone does not reuse a version already published by a teammate.
Use `--fetch` for the same protection on a preview, and `--remote <name>` to
select another remote. A push can still be rejected if another release wins the
race after the fetch; re-fetch and choose a new version in that case. A
`--dry-run` remains local unless `--fetch` is supplied explicitly.

`check --strict <tag>` also checks a proposed version against the repository's
existing tag history. `check` reports `matches` for every candidate; a
`line: null` plus `ambiguous-assignment` means more than one configured pattern
matched, so there is no safe unique owner.

The repository is a reusable GitHub Action. It builds Tagsmith from the checked
out action, fetches tags by default, runs `audit --json`, then exposes the
read-only `plan --all --json` result:

```yaml
name: Validate tags
on: [push, pull_request]

jobs:
  tags:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: tagsmith
        uses: CarlLee1983/Tagsmith@main # Pin a release tag or commit SHA in production.
        with:
          plan-from-commits: "true"
          plan-tag: api
      - if: steps.tagsmith.outputs.has-releases == 'true'
        run: echo '${{ steps.tagsmith.outputs.plan }}' | jq .
```

Set `with: { working-directory: packages/api, fetch-tags: "false" }` when the
configuration lives below the repository root or tags are already available.
The Action's `plan` output is the full JSON envelope; `has-releases` is `true`
when any line is ready, and `next-tag` is the ready candidate for `plan-tag` or
the config default line (otherwise an empty string). It does not create tags.

## Merge policy

Tagsmith can also act as a local git-workflow guardrail. A `mergePolicy` limits
the source branches that may merge into protected branches; it is enforced by
managed `prepare-commit-msg` and `post-merge` hooks. It does not configure PR
rules or remote/server-side policy.

```jsonc
{
  "pattern": "v{version}",
  "model": { "type": "semver" },
  "initialVersion": "0.1.0",
  "mergePolicy": {
    "protectedBranches": {
      "develop": { "allow": ["main"] },
      "main": { "deny": ["develop", "testing", "feature/*"] }
    },
    "onUnknownSource": "block"
  }
}
```

- `mergePolicy` is optional and disabled by default.
- A protected branch must specify exactly one of `allow` or `deny`.
- Patterns support `*` (including `/`) and `?`.
- `onUnknownSource` defaults to `block`; choose `allow` only when that is an
  intentional policy decision.

Install the hooks after adding the policy:

```bash
npm install -D @carllee1983/tagsmith
npx tagsmith hooks install
```

If a target hook contains unmanaged content, installation stops without writing
anything; use `--force` only when replacing that hook is intended. For an
emergency one-off bypass, set `TAGSMITH_SKIP=1` or `HUSKY=0` for the `git merge`
command.

## Documentation

- [Documentation index](docs/README.md)
- [Contributing guide](CONTRIBUTING.md) · [繁體中文](docs/CONTRIBUTING.zh-TW.md)
- [Husky pre-push setup](docs/husky-pre-push.md) · [繁體中文](docs/husky-pre-push.zh-TW.md)
- [Changelog](CHANGELOG.md)
- [Development roadmap (繁體中文)](ROADMAP.zh-TW.md)

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev -- <command>
```

## License

[MIT](LICENSE) © 2026 carl
