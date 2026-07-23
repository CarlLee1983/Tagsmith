# 設計：0.7 Monorepo release planning

## 狀態與目標

- 狀態：Accepted
- 對應路線圖：[0.7 Monorepo release planning](../../../ROADMAP.zh-TW.md)
- 目標：在不建立或推送任何 tag 的前提下，一次檢視每條 tag line 是否應發版、候選
  tag 與決策依據；單線的實際建立仍由既有 `next` / `create` 明確執行。

## Command contract

新增 `tagsmith plan --all`。`--all` 是刻意明確的必要旗標：此指令的用途是跨所有 tag
line 做一次 release plan，而不是取代既有預設線的 `next`。

它支援 `--json`、`--fetch [--remote <name>]`、`--from-commits` 與
`--require-changes`。`--fetch` 是唯一會接觸 remote 的路徑；其他情況只讀取本地 Git
history。`plan` 永遠不建立、推送或修改 tag / worktree。

每個 line 按 `.tagsmith.json` 的宣告順序輸出下列穩定資料：

- `status`: `ready`、`skipped` 或 `blocked`；
- `changed`: 自該 line 最新 tag 至 `HEAD` 是否有已提交變更；有 `workspace` 時只讀該
  路徑，未設定時讀整個 repository；
- `bump`、候選 `tag` / `version` 與其 `fromVersion`；
- 參與判斷的 commit id / summary，以及 `--from-commits` 的 Conventional Commit
  recommendation；
- 固定 code 的 `blockers` 與 tag-history warnings。

`ready` 才有 candidate。沒有已提交變更、或 `--from-commits` 找不到 release-worthy
commit 時是 `skipped`，不是 command error。任何 line 因配置或安全歷史無法得到可靠
決策時是 `blocked`，整個 command 以非零碼結束，但仍輸出其他 line 的完整結果。

## Decision rules

1. 每條線使用既有 `assignTagsToLines` 與 `planNext`。因此一個 `ready` candidate 必須與
   同條件下的 `tagsmith next --tag <name>` 相同。
2. 未傳 `--from-commits` 時，對有變更的 line 採既有 `next` 的預設 `patch` bump；CalVer
   與 build model 維持它們既有的 bump 規則。
3. 傳入 `--from-commits` 時，SemVer line 由既有 Conventional Commit evaluator 取
   `major` / `minor` / `patch`。非 SemVer line 以
   `from-commits-unsupported` blocked，與單線 `next` 的限制一致。
4. `--require-changes` 要求每條可規劃 line 都有 `workspace`；沒有 workspace 的 line 以
   `workspace-required` blocked，保留既有 flag 的明確語意。
5. 會影響某條線的 ambiguous tag assignment 以 `ambiguous-assignment` blocked，與
   `next` / `create` 相同；其他 malformed history 僅依既有 next 規則列為 warning。

`hasReleases` 只在至少一條 line 是 `ready` 時為 true；全部 `skipped` 的 plan 成功且
`hasReleases: false`。JSON envelope 延續 schema version 1，新增 `command: "plan"`。

## Architecture and GitHub Action

`src/core/release-plan.ts` 是 pure module：它根據已取得的 tag、Git change facts 與
commit messages 建立單線 status / candidate，並直接重用 `planNext` 與
`recommendConventionalBump`。Git adapter 只取得 scoped or repository-wide change facts，
CLI 負責 fetch、組合多線輸出與 human formatting。

可重用 GitHub Action 仍先執行完整 audit，接著執行 `plan --all --json`，並輸出：

- `plan`：完整 versioned JSON envelope；
- `has-releases`：是否至少有一條 `ready` line；
- `next-tag`：指定 `plan-tag`（預設 config default line）的 ready candidate，否則空字串。

Action 只提供資訊給既有 workflow；不建立 tag、不發布套件，也不編排多 package release。

## 非目標與驗證

- 不自動執行多條 `create`、push、GitHub Release 或 npm publish。
- 不從 package manager lockfile 或 dependency graph 猜測跨 workspace 發版順序；相依
  影響仍留待明確設定的後續需求。
- 不把未提交變更當成 release evidence。

驗證包含 pure plan status / candidate tests、scoped Git integration / command tests、built
CLI E2E、Action output contract tests，以及 `npm test`、coverage、typecheck、build 與
documentation governance。
