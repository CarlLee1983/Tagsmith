# 設計：0.6 Release Readiness

## 狀態與目標

- 狀態：Accepted
- 對應路線圖：[0.6 Release Readiness](../../../ROADMAP.zh-TW.md)
- 目標：讓 maintainer 把「現在是否可建立這個 tag」寫成可提交、可稽核、可選擇性強制
  執行的本地規則；不改變既有 `create` 的預設行為。

## Policy 形狀與相容性

`.tagsmith.json` 新增可選的頂層 `releasePolicy`。未設定時不產生任何 release-readiness
診斷，既有設定、`audit` 與 `create` 的結果完全保持不變。

```json tagsmith-config
{
  "releasePolicy": {
    "allowedBranches": ["main", "release/*"],
    "requireCleanWorktree": true,
    "requireAnnotatedTag": true,
    "requireHeadTag": true,
    "signature": "required"
  }
}
```

- `allowedBranches` 使用既有 `*` / `?` glob 語意；detached `HEAD` 不符合此條件。
- `requireCleanWorktree` 包含 staged、unstaged 與 untracked 檔案。
- `requireAnnotatedTag` 要求本次 create 以 `--message` 建立 annotated tag。
- `requireHeadTag` 要求本次 tag 的 target 是 `HEAD`。`create --target <ref>` 讓非預設
  target 成為明確、可被 policy 拒絕的操作；不指定時仍是 `HEAD`。
- `signature` 可為 `optional`（預設）或 `required`。需要簽章時，create 必須傳 `--sign`；
  Git / GPG 實際簽章與驗證仍由 Git 執行，Tagsmith 不讀取或保存任何金鑰。

`requireAnnotatedTag`、`requireHeadTag` 與 `signature: "required"` 是**候選 tag**的條件，
不是對整段歷史套用的規則。否則一個正常的後續 commit 會讓舊 release tag 不再指向
`HEAD`，反而永久阻擋下一次 release。

## Core Interface

`src/core/release-policy/validate.ts` 提供 pure
`evaluateReleaseReadiness(policy, facts)`。它只接收已取得的 Git facts，回傳固定的
`pass` / `warn` / `fail` checks 與穩定 diagnostic codes；它不讀 Git、不印輸出，也不
知道 CLI flags。

Git adapter 只負責取得下列 facts：current branch、worktree 是否乾淨、`HEAD` SHA 與
候選 target SHA。CLI 建立 candidate：tag name、是否 annotated、是否 sign、target。這使
`audit` 和 `create` 不會各自重寫 policy 判斷。

`tagsmith audit` 在沒有 candidate 時，檢查 repository-level conditions（branch、
worktree）並把 candidate-only checks 標示為 `not-applicable`。`create --enforce-policy`
則在所有既有 tag 安全檢查與版本規劃完成後、但在建立 tag 前，以同一 evaluator 帶入
candidate；任何 fail 都不會改寫 Git state。

## CLI 行為

| 指令 | 0.6 行為 |
| --- | --- |
| `audit` | 持續稽核 tag 歷史，並附上 release-policy readiness checks。`--fetch --remote` 是唯一會接觸 remote 的 audit 路徑，輸出會明示 remote 是否已同步。 |
| `create` | 預設完全相容；只有 `--enforce-policy` 才會因 releasePolicy 拒絕建立。`--dry-run --enforce-policy` 同樣檢查但不建立。 |
| `create --target <ref>` | 明確選擇 tag target；預設 `HEAD`。與 `requireHeadTag` 同用時，非 `HEAD` target 在建立前被拒絕。 |
| `create --sign` | 請 Git 建立 signed annotated tag。與 `signature: "required"` 同用時必須提供。 |

human audit 顯示每個 check 的 `PASS` / `WARN` / `FAIL`，JSON 將 stable diagnostics 放在
既有 versioned envelope 的 `diagnostics`，並在 `data.releaseReadiness` 提供完整 check
facts。`audit --fetch` 會在 Git fetch 成功後回報 remote；沒有 `--fetch` 時 remote 狀態
是未檢查，而非假設為同步。

## 非目標與限制

- 不設定 remote branch protection、不取代 push race 防護、不建立 GitHub Release 或發布
  artifact。
- 不管理 GPG / SSH key、信任鏈或簽章 keyring；Git 無法簽章時 create 失敗並保留 Git
  自己的錯誤。
- 不回溯要求舊 tag 都符合新 policy。歷史格式與歧義仍由既有 tag audit 負責。
- 不自動修正 dirty worktree、切換 branch 或將 tag target 改成 `HEAD`。

## 驗證

- schema / config tests：合法與不合法 policy、兩種 config shape；
- core tests：branch glob、dirty、annotation、signature 與 target 的 pass/fail；
- Git integration tests：dirty worktree、錯誤分支與 `HEAD~1` target 被 enforcement 阻擋；
- command tests：human/JSON audit、`--fetch`、`--dry-run --enforce-policy`；
- 完整 `npm test`、`npm run typecheck`、`npm run build` 與 built CLI smoke test。
