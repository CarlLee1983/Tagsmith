# 設計：0.8 Artifact 與 commit-policy 一致性

## 狀態與目標

- 狀態：Accepted
- 對應路線圖：[0.8 Artifact 與 commit-policy 一致性](../../../ROADMAP.zh-TW.md)
- 目標：在建立 tag 前驗證候選版本與對應的 `package.json` version，並讓團隊用已提交、
  可審核的規則定義 Conventional Commit 對應的 release bump。

## Configuration contract

tag line 可選擇啟用唯一的內建 artifact source：

```json
{
  "name": "api",
  "workspace": "packages/api",
  "pattern": "api/v{version}",
  "model": { "type": "semver" },
  "initialVersion": "0.1.0",
  "artifact": { "type": "package-json" }
}
```

`package-json` 固定讀取 line 的 `workspace/package.json`；未設定 `workspace` 時讀取 repository
root 的 `package.json`。這個限定避免引入一般化 source path、shell command 或公開 plugin
interface。檔案中的 `version` 必須是字串、可由該 line 的 VersionModel 解析，且其 canonical
形式須等於 tag 的 version（不包含 pattern 的 prefix / suffix）。

`releasePolicy.requireArtifactVersion` 預設為 `false`。設定為 `true` 時，
`create --enforce-policy` 必須驗證所選 line 已設定 artifact，且 candidate target commit 中
的 artifact version 和 candidate tag version 一致。這個檢查不改寫任何檔案；它也永遠讀取
target commit，而不是未提交的 worktree，以免 `--target` 與實際驗證來源不同。

頂層可選 `commitPolicy` 取代預設 Conventional Commit 分類：

```json
{
  "commitPolicy": {
    "rules": [
      { "name": "breaking", "breaking": true, "release": "major" },
      { "name": "features", "type": "feat", "release": "minor" },
      { "name": "bug fixes", "type": "fix", "release": "patch" },
      { "name": "website docs", "type": "docs", "scope": "website", "release": "patch" },
      { "name": "other docs", "type": "docs", "ignore": true }
    ]
  }
}
```

Rules are evaluated in declaration order; the first matching rule wins. `type`, `scope`, and
`breaking` are optional filters; exactly one of `release` or `ignore: true` is required. A missing
`commitPolicy` preserves the existing breaking → major, `feat` → minor, and `fix` / `perf` → patch
semantics. A configured policy is complete: unmatched commits are ignored, so teams can opt into a
smaller taxonomy intentionally.

## Audit and create decisions

`audit` verifies every conforming, uniquely assigned historical tag for a line whose artifact is
enabled. It reads that tag's `package.json` through Git, rather than the current worktree, then
reports a per-tag result. Therefore an in-progress version bump in `HEAD` does not invalidate a
previous release audit.

Stable artifact diagnostics distinguish these outcomes:

- `artifact-package-json-missing` — no manifest exists at the tag target;
- `artifact-package-json-malformed` — the manifest is not a JSON object;
- `artifact-version-missing` — `version` is absent or not a non-empty string;
- `artifact-version-invalid` — `version` is incompatible with the tag line model;
- `artifact-version-mismatch` — valid versions differ;
- no diagnostic — the artifact version is consistent.

Artifact failures are audit errors. `create --enforce-policy` receives the same pure artifact result
for its candidate and adds an explicit release-policy failure when no artifact is configured or the
candidate cannot be verified. Without `--enforce-policy`, existing create behaviour is unchanged.

The commit recommendation continues to show every matched commit. Each reason additionally records
the matched default rule or `commitPolicy.rules[n]` / optional rule name, making JSON and human output
explainable without parsing a commit message again.

## Architecture and non-goals

The package JSON parser and version comparison are pure core code. The Git adapter only reads a file
at a resolved commit; CLI modules collect facts, combine audit or release-policy diagnostics, and
format output. Commit header parsing and policy rule evaluation remain in the pure Conventional
Commit module, shared by `next`, `create`, and `plan`.

- Do not edit `package.json`, lockfiles, changelogs, or tags.
- Do not inspect package-manager dependency graphs or publish artifacts.
- Do not add arbitrary file readers, shell commands, plugin loading, or public artifact interfaces.
- Do not change default Conventional Commit behaviour when `commitPolicy` is absent.

Verification covers pure parsing/evaluation, config/schema validation, Git-backed audit and create
preflight tests, command JSON output, documentation, build, typecheck, full tests, coverage, and
documentation governance.
