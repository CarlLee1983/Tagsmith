# Merge Policy — 設計規格

- 日期：2026-06-11
- 套件：`@carllee1983/tagsmith`
- 目標版本：0.3.0（minor，向後相容）
- 分支：`feat/merge-policy`

## 1. 背景與目標

把「受保護分支合併來源限制」（原本以 husky + POSIX sh 腳本實作於各專案）收斂成
tagsmith 的內建功能，讓任何 repo 透過 npm 安裝即可重用，不必各自複製維護 sh 腳本。

tagsmith 的定位從「git tag 工具」演進為「git 工作流護欄」。新功能與既有 tag 邏輯
解耦，放在獨立模組，共用既有 `src/git/git.ts`。

### 非目標（本次不做）

- 不處理 PR / 遠端 server 端政策（純 local git hook）。
- 不改既有 tag 相關命令的行為。
- 不負責把 arcade-report 既有 sh 腳本遷移過來（發版後另案處理）。

## 2. 設定（`.tagsmith.json` 新增 `mergePolicy` 區塊）

```jsonc
{
  "pattern": "v{version}",        // 既有 tag 設定不變
  "model": { "type": "semver" },
  "initialVersion": "0.1.0",

  "mergePolicy": {
    "protectedBranches": {
      "develop":  { "allow": ["main"] },
      "main":     { "deny":  ["develop", "testing", "feature/*"] },
      "testing":  { "deny":  ["develop", "main"] }
    },
    "onUnknownSource": "block"      // 無法解析來源時：block | allow（預設 block）
  }
}
```

規則：

- `mergePolicy` 為**選配**。缺省即功能關閉，對既有 tagsmith 使用者完全向後相容。
- `protectedBranches` 的 key 是受保護分支名；只有目前所在分支落在此清單時才檢查，
  其餘分支一律放行。
- 每個受保護分支的值**二選一**：
  - `allow`: 只允許名單內來源合併進來，其餘封鎖（白名單）。
  - `deny`: 名單內來源封鎖，其餘放行（黑名單）。
  - 同時提供 `allow` 與 `deny`、或兩者皆缺 → 設定驗證錯誤（zod `oneOf`）。
- 來源比對支援萬用字元（glob），如 `feature/*`、`hotfix/*`；以簡單 glob→regex 實作
  （`*` → `[^/]*` 或 `.*`，採 `.*` 以涵蓋多層；`?` → `.`）。
- `onUnknownSource`：當來源分支無法解析時的行為，預設 `block`。

schema.json 同步擴充，`additionalProperties` 仍維持嚴格；`mergePolicy` 加入 properties。

## 3. CLI 子命令

### `tagsmith merge-check [--mode <merge-head|post-merge>]`

由 git hook 呼叫，非使用者日常輸入。

- 讀取 git 狀態：current branch、`MERGE_HEAD`、`MERGE_MSG`、`ORIG_HEAD`。
- 解析合併來源分支（移植自原 sh 的 `resolve_merge_source_from_head` 與
  `resolve_ff_merge_source` 兩條路徑）。
- 套用政策；違規時印出 target / source / reason，並：
  - `merge-head` 模式（merge commit，尚未 commit 完成）：無法乾淨回滾，exit 1
    中止，訊息提示 `git merge --abort`。
  - `post-merge` 模式（fast-forward 已改動 HEAD）：`git reset --hard ORIG_HEAD`
    回滾到合併前，exit 1。
- 通過則 exit 0。
- `--mode` 預設 `merge-head`。

### `tagsmith hooks install [--force]` / `tagsmith hooks uninstall`

把呼叫 `merge-check` 的 hooks 裝進目標 repo。

- 偵測 repo hook 機制：
  - 有 husky（存在 `.husky/` 目錄）→ 寫 `.husky/prepare-commit-msg`、`.husky/post-merge`。
  - 否則 → 寫 `.git/hooks/prepare-commit-msg`、`.git/hooks/post-merge`（或設 `core.hooksPath`）。
- hook 內容只負責呼叫 tagsmith，例如：
  - `prepare-commit-msg`：當 `$2 = merge` 時執行 `npx tagsmith merge-check --mode merge-head`。
  - `post-merge`：執行 `npx tagsmith merge-check --mode post-merge`。
- `--force` 覆寫既有 hook；無 `--force` 且已存在不同內容 → 提示並中止。
- `uninstall` 移除 tagsmith 寫入的 hook 段落 / 檔案。

### （選配）`tagsmith init`

既有 init 流程可詢問是否一併裝 hooks（可後續迭代，不阻擋本次主功能）。

## 4. 原始碼模組

```
src/core/merge-policy/
  schema.ts        # zod：mergePolicy 結構 + allow/deny oneOf
  match.ts         # glob → regex 來源比對
  resolve.ts       # 解析 merge 來源（merge-head / fast-forward 兩路徑）
  validate.ts      # 套用 allow/deny → { ok } | { ok:false, reason }
src/cli/
  merge-check.ts   # commander 子命令
  hooks.ts         # install / uninstall
src/git/git.ts     # 擴充：mergeHead、mergeMsg、origHead、branchesPointingAt、
                   #       nameRev、isAncestor、resetHard、currentBranch
```

模組各自單一職責、可獨立測試：

- `match`：純函式，輸入 (pattern, branchName) → boolean。
- `validate`：純函式，輸入 (policy, currentBranch, sourceBranch) → 判定結果，不碰 git。
- `resolve`：封裝 git 查詢，回傳來源分支名或 null。
- `merge-check`：組合上述三者 + 副作用（回滾、exit code、輸出）。

## 5. 行為細節（沿用原 sh 腳本語意）

- 只在 current branch ∈ `protectedBranches` 時檢查，其餘 exit 0。
- 受保護分支上 detached HEAD → block（無法判定合併安全性）。
- 環境變數 `HUSKY=0` 或 `TAGSMITH_SKIP=1` 可緊急略過檢查。
- post-merge 模式下，若為 octopus（parent > 2）或非 fast-forward 前進，沿用原邏輯
  判斷是否略過。
- 違規訊息含：target 分支、source 分支、reason、補救指令、略過方式。

## 6. 測試（vitest，沿用現有風格，維持 80%+ 覆蓋）

- 單元：
  - `match`：精確比對、`*`、`feature/*`、多層路徑、不匹配。
  - `validate`：allow 命中/未命中、deny 命中/未命中、非受保護分支放行、
    來源 unknown × `onUnknownSource` 兩種值。
  - `schema`：合法設定、allow+deny 並存報錯、兩者皆缺報錯。
- 整合：
  - `hooks install` 在臨時 repo（有/無 husky）正確寫檔，內容可執行。
  - `merge-check` 在臨時 repo 跑真實 merge：白名單通過、黑名單封鎖並回滾、
    fast-forward 回滾到 ORIG_HEAD。

## 7. 發版與後續

- 版本：0.3.0。更新 CHANGELOG、README（新增 mergePolicy 段落）、schema.json。
- 後續另案：tagsmith 0.3.0 發布後，將 arcade-report 既有 `scripts/git/check-merge-policy.sh`
  + husky hooks 換成 `tagsmith hooks install`；過渡期保留 arcade-report 的
  `chore/merge-policy-hooks` 分支。
