# Tagsmith

[English documentation](../README.md) · [文件索引](README.md)

想先用決策流程理解採用路徑？閱讀 [HTML 完整流程](workflow/)。設定格式與完整 CLI 參考仍在本文件。

[![npm version](https://img.shields.io/npm/v/@carllee1983/tagsmith.svg)](https://www.npmjs.com/package/@carllee1983/tagsmith)

定義專案的 git tag 規格、檢視現有 tag，並安全地產生下一個 git tag——避免順序錯亂或格式不一致。

支援 **SemVer**、**CalVer** 與 **build number** 三種版本模型，tag 樣式可自訂（例如 `v{version}`、`release/{version}`）。

- 🏷️ **規格化** — 用 `.tagsmith.json` 定義全專案的 tag 樣式與版本模型（可選）
- 🔍 **可檢視** — 依語義排序列出 tag，標示格式 / 順序 / 重複異常
- 🛡️ **防呆** — 建立前驗證格式、版本可解析、嚴格遞增、tag 不重複
- 🚀 **零設定** — 無設定檔時自動以 semver 推斷 pattern，讀 repo 既有 tag 即可用
- 🧩 **可擴充** — 版本模型走介面抽象，新增不動核心邏輯
- 🚧 **合併護欄** — 以 `mergePolicy` 限制受保護分支的合併來源（白 / 黑名單），由 git hook 自動把關

## 安裝

```bash
# 全域安裝（指令名稱仍為 tagsmith）
npm install -g @carllee1983/tagsmith

# 或免安裝直接執行
npx @carllee1983/tagsmith <command>

# 專案相依（CI / husky hook 常用）
npm install -D @carllee1983/tagsmith
# 裝在本機後可直接：npx tagsmith <command>
```

npm：[https://www.npmjs.com/package/@carllee1983/tagsmith](https://www.npmjs.com/package/@carllee1983/tagsmith)

需求：Node.js ≥ 18、git。

## 快速開始

### 零設定（無 `.tagsmith.json`）

已有 semver 風格 tag（如 `v0.1.0`）的 repo 可直接使用：

```bash
tagsmith list                    # 檢視既有 tag
tagsmith next                    # 預覽下一個 tag（預設 patch bump）
tagsmith next --level minor      # 例如 v0.1.0 → v0.2.0
tagsmith create --push           # 建立並推送
```

無設定檔時預設 semver、`v{version}` pattern；會從既有 tag 自動推斷格式（如 `{version}`）。
團隊協作建議仍執行 `init` 並 commit `.tagsmith.json` 以固定規格。

### 完整流程（自訂規格）

```bash
# 1. 在 repo 內定義 tag 規格（互動式，可選）
tagsmith init

# 不熟指令？走一次互動式導覽
tagsmith guide

# 2. 檢視現有 tag（依語義排序、標示異常）
tagsmith list

# 3. 預覽下一個 tag（不建立）
tagsmith next --level minor

# 4. 建立 tag（自動驗證格式與順序）
tagsmith create --level minor -m "Release 1.2.0" --push
```

## 設定檔 `.tagsmith.json`

`tagsmith init` 會在 repo 根目錄產生設定檔。

### 多條 tag 線

一份設定檔可定義多條獨立的 tag 線，各線有自己的 pattern 與版本模型，彼此獨立遞增：

```json
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

每條線的欄位：

| 欄位 | 必填 | 說明 |
|------|:---:|------|
| `name` | ✓ | 線名，全陣列唯一，供 `--tag` 指定 |
| `pattern` | ✓ | tag 樣式，**必含** `{version}` 佔位符。例：`v{version}`、`release/{version}` |
| `model` | ✓ | 版本模型物件（見下） |
| `initialVersion` | ✓ | 無既有合規 tag 時的起點 |
| `push` | | `create` 是否預設 push（預設 `false`） |
| `workspace` | | monorepo 套件的 repo 相對路徑，供 `--require-changes` 判斷變更 |

頂層選填欄位：

| 欄位 | 說明 |
|------|------|
| `default` | 預設操作線名；省略時取 `tags[0].name` |

### 舊格式（仍相容）

既有的單線扁平格式無需修改，仍可正常載入：

```json
{
  "pattern": "v{version}",
  "model": { "type": "semver", "allowPrerelease": true },
  "initialVersion": "0.1.0",
  "push": false
}
```

Tagsmith 載入時會自動將其視為一條名為 `default` 的單線設定；現有使用者**零修改**即可繼續使用。

可在檔案加上 `"$schema": "./node_modules/@carllee1983/tagsmith/schema.json"` 取得編輯器補全與驗證。

### Monorepo workspace

在 tag 線加上 `workspace`，即可把該線限制在某個套件目錄。既有的 `--tag` 讓每個
workspace 維持獨立版本序列；搭配 `--require-changes`，只有該套件自上個 tag 後有已提交
的變更時才會允許預覽或建立 release。
若使用 `--from-commits`，Tagsmith 也只會採納有變更該 workspace 的 commits。

```json
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
```

`workspace` 必須是 repo 內的相對路徑；未設定時，既有單一 repo 的設定與行為完全不變。

### 三種版本模型

| 模型 | 範例 | 專屬設定 | 遞增規則 |
|------|------|----------|----------|
| `semver` | `1.2.3`、`1.2.3-rc.1` | `allowPrerelease`（預設 `true`） | `--level major/minor/patch/prerelease` |
| `calver` | `2026.06.0` | `format`（token：`YYYY YY MM DD MICRO`） | 滾動到當天；同日遞增 `MICRO` |
| `build` | `0042` | `padding`（補零位數，預設 `0`） | 單調 +1 |

<details>
<summary>各模型設定範例（舊格式）</summary>

**SemVer**（`v1.2.3`）

```json
{
  "pattern": "v{version}",
  "model": { "type": "semver", "allowPrerelease": true },
  "initialVersion": "0.1.0",
  "push": false
}
```

**CalVer**（`release/2026.06.0`，token 之間需有分隔字元或固定寬度）

```json
{
  "pattern": "release/{version}",
  "model": { "type": "calver", "format": "YYYY.MM.MICRO" },
  "initialVersion": "2026.06.0",
  "push": false
}
```

**Build number**（`build-0042`）

```json
{
  "pattern": "build-{version}",
  "model": { "type": "build", "padding": 4 },
  "initialVersion": "1",
  "push": false
}
```

</details>

> **CalVer `format` 注意**：可解析的數字寬度固定——`YYYY`=4 碼、`YY`/`MM`/`DD`=2 碼、
> `MICRO` 不限。未補零（如 `2026.6.0`）或含前導零的 `MICRO`（如 `...007`）會被視為
> **非合規**，以避免假冒或重複正規 tag。

## 指令

### `tagsmith init`
互動式產生 `.tagsmith.json`（**可選**；zero-config 模式下可略過，團隊協作仍建議 commit 設定檔）。

| 旗標 | 說明 |
|------|------|
| `--pattern <pattern>` | tag 樣式 |
| `--model <type>` | `semver` \| `calver` \| `build` |
| `--initial-version <version>` | 初始版本 |
| `--push` | 預設 push |
| `--force` | 覆寫既有設定檔 |
| `-y, --yes` | 非互動，使用旗標 / 預設值 |

### `tagsmith list` (`ls`)
列出 git tag，依規格解析後由新到舊排序，並標示異常 tag：
**不符樣式**（`pattern-mismatch`）、**版本無法解析**（`unparseable-version`）、
**重複版本**（`duplicate-version`）。

預設只列出 `default` 線的 tag；多線設定可用 `--tag` 指定線或 `--all` 一次列出所有線。

| 旗標 | 說明 |
|------|------|
| `--json` | 輸出結構化 JSON |
| `-t, --tag <name>` | 只列出指定線的 tag |
| `--all` | 列出每條線（各自分組）與無主 tag（Unassigned / orphan tags） |

```jsonc
// tagsmith list --json（單線或指定 --tag）
{
  "conforming": [
    { "tag": "v1.2.0", "version": "1.2.0" },
    { "tag": "v1.1.0", "version": "1.1.0" }
  ],
  "anomalies": [
    { "tag": "nightly", "reason": "pattern-mismatch" }
  ],
  "latest": "v1.2.0"
}
```

```jsonc
// tagsmith list --all --json（多線）
{
  "lines": [
    {
      "line": "app",
      "conforming": [{ "tag": "v1.2.0", "version": "1.2.0" }],
      "anomalies": [],
      "latest": "v1.2.0"
    },
    {
      "line": "release",
      "conforming": [{ "tag": "release/2026.06.0", "version": "2026.06.0" }],
      "anomalies": [],
      "latest": "release/2026.06.0"
    }
  ],
  "orphans": ["legacy-tag"]
}
```

### `tagsmith check`
驗證指定 tag 是否符合規格；不帶參數時檢查 repo 內所有既有 tag。
適合用於 CI 或 git hook（exit 0 = 全部合規，exit 1 = 發現異常）。

多線設定下，每個 tag 會對照所有線進行比對，並在結果中回報歸屬線（或 `null` 表示無主）。
`--tag <name>` 可限定只對某條線驗證。

| 旗標 | 說明 |
|------|------|
| `--json` | 輸出結構化 JSON |
| `--strict` | 對指定候選 tag 比對既有版本；不帶 tag 時嚴格稽核全部本地 tag |
| `-t, --tag <name>` | 只對指定線驗證 |

```jsonc
// tagsmith check v1.2.3 "release/2026.06.1" junk --json
{
  "results": [
    { "raw": "v1.2.3",           "line": "app",     "ok": true,  "anomaly": null },
    { "raw": "release/2026.06.1","line": "release",  "ok": true,  "anomaly": null },
    { "raw": "junk",             "line": null,        "ok": false, "anomaly": "pattern-mismatch" }
  ],
  "strict": false
}
```

### `tagsmith next`
計算並印出下一個 tag，**不**實際建立。保證結果嚴格大於目前最大合規版本；
無既有合規 tag 時改用 `initialVersion`。

| 旗標 | 說明 |
|------|------|
| `-l, --level <level>` | `major` \| `minor` \| `patch` \| `prerelease` \| `auto`（預設 `patch`） |
| `--json` | 輸出 JSON |
| `--fetch` | 計算前從 remote 取回 tags |
| `--remote <name>` | `--fetch` 使用的 remote（預設 `origin`） |
| `--from-commits` | 僅限 SemVer；依 Conventional Commits 建議遞增等級，不能與 `--level` 合用 |
| `--require-changes` | 要求指定線的 `workspace` 自最新 tag 後有已提交變更 |
| `-t, --tag <name>` | 操作指定線（預設：設定檔的 `default` 線） |

```jsonc
// tagsmith next --level minor --json
{ "tag": "v1.3.0", "version": "1.3.0", "fromVersion": "1.2.0", "fresh": false, "line": "app", "workspace": null }
```

### `tagsmith create`
建立下一個（或以 `--set-version` 指定的）tag。建立前驗證：格式符合 pattern、
版本可解析、嚴格遞增、tag 不重複。push 行為優先取命令列 `--push`，其次取該線設定的 `push`。

| 旗標 | 說明 |
|------|------|
| `-l, --level <level>` | 遞增等級（同 `next`） |
| `--set-version <version>` | 改用指定版本，而非自動遞增 |
| `-m, --message <message>` | 建立 annotated tag |
| `--push` | 建立後推送（覆寫該線的 `push` 設定） |
| `--fetch` | 建立前從 remote 取回 tags；`--push` 時預設自動執行 |
| `--remote <name>` | `--fetch` 與 `--push` 使用的 remote（預設 `origin`） |
| `--from-commits` | 僅限 SemVer；依 Conventional Commits 決定遞增等級，不能與 `--level` / `--set-version` 合用 |
| `--require-changes` | 要求指定線的 `workspace` 自最新 tag 後有已提交變更 |
| `--dry-run` | 只預覽，不建立 |
| `--allow-out-of-order` | 允許版本不大於現有最大值 |
| `-t, --tag <name>` | 操作指定線（預設：設定檔的 `default` 線） |

## 常見情境

```bash
# 發佈 patch 並推送
tagsmith create --push

# 發佈帶 annotation 的 minor release
tagsmith create -l minor -m "新增登入 API"

# CI 中取得下一個 tag 字串
NEXT=$(tagsmith next --json | jq -r .tag)

# 補一個歷史版本（明知順序在後）
tagsmith create --set-version 1.0.5 --allow-out-of-order

# 先看會發生什麼，不動 repo
tagsmith create -l major --dry-run

# 多線：在 release 線建立下一個 tag
tagsmith create --tag release

# 多線：預覽 release 線的下一個 tag
tagsmith next --tag release --json

# 多線：一次檢視所有線的 tag 狀況（含無主 tag）
tagsmith list --all

# 從 origin 讀取最新 tag 後再預覽，避免使用過期本地歷史
tagsmith next --fetch

# 由 Conventional Commits 建議下一個 SemVer 版本
tagsmith next --from-commits

# monorepo：只有 api 套件有變更才建立其 tag
tagsmith create --tag api --require-changes --push
```

## 遠端安全與 CI

`create --push` 在計算版本前會預設從 `origin` 取回 tags，避免過期的本地 clone 重複使用
隊友已發佈的版本。預覽時可加 `--fetch`；以 `--remote <name>` 改用其他 remote。fetch 後若
仍有其他人搶先推送，Git 仍會拒絕 push；此時請重新 fetch 後重新計算版本。
`--dry-run` 預設維持本地操作；需要完全比照遠端狀態時請明確加上 `--fetch`。

`tagsmith check --strict <tag>` 會額外將候選版本與 repo 既有歷史比對；不帶 tag 時會嚴格
稽核全部本地 tag。JSON 的 `line: null` 表示沒有任何設定的 pattern 符合；若 pattern 符合但
版本無法解析，仍會標示其所屬線。

本 repo 也可直接作為可重用 GitHub Action：自行安裝並建置 Tagsmith、預設 fetch tags，最後
執行 `check --json --strict`。

```yaml
name: Validate tags
on: [push, pull_request]

jobs:
  tags:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: CarlLee1983/Tagsmith@main # 正式環境請固定 release tag 或 commit SHA。
```

若設定檔不在 repo 根目錄，或已自行同步 tags，可設定：
`with: { working-directory: packages/api, fetch-tags: "false" }`。

## 搭配 husky 守 tag

可用 git `pre-push` hook 在推送時自動驗證 tag，擋下不符規格者。
詳見 [husky-pre-push.zh-TW.md](husky-pre-push.zh-TW.md)（需安裝 `@carllee1983/tagsmith`）。

## 合併政策（merge policy）

除了管 tag，Tagsmith 也能當 **git 工作流護欄**：限制哪些分支可以合併進受保護分支，
避免誤把 `develop`、`feature/*` 直接併進 `main`。規則寫在 `.tagsmith.json` 的
`mergePolicy` 區塊，由本機 git hook（`prepare-commit-msg` / `post-merge`）自動執行——
**純本機檢查，不涉及 PR 或遠端 server 端政策**。

### 設定

```jsonc
{
  "pattern": "v{version}",          // 既有 tag 設定不受影響
  "model": { "type": "semver" },
  "initialVersion": "0.1.0",

  "mergePolicy": {
    "protectedBranches": {
      "develop": { "allow": ["main"] },                    // 白名單：只准 main 併入
      "main":    { "deny":  ["develop", "testing", "feature/*"] }, // 黑名單：擋這些
      "testing": { "deny":  ["develop", "main"] }
    },
    "onUnknownSource": "block"        // 無法解析來源時：block（預設）| allow
  }
}
```

規則：

- `mergePolicy` **選配**，缺省即關閉，對既有使用者完全向後相容。
- `protectedBranches` 的 key 是受保護分支名；**只有目前所在分支落在清單時才檢查**，
  其餘分支一律放行。
- 每個受保護分支**二選一**：
  - `allow`（白名單）— 只允許名單內來源合併進來，其餘封鎖。
  - `deny`（黑名單）— 名單內來源封鎖，其餘放行。
  - 同時提供或兩者皆缺 → 設定驗證錯誤。
- 來源比對支援萬用字元：`*` 比對任意字元（**含 `/`**，可跨多層），`?` 比對單一字元；
  例如 `feature/*`、`hotfix/*`。
- `onUnknownSource` — 無法解析合併來源分支時的行為，預設 `block`。

### 安裝 hooks

```bash
npm install -D @carllee1983/tagsmith   # 先把套件裝進專案
npx tagsmith hooks install             # 寫入 git hooks
```

`hooks install` 會偵測 hook 機制：有 `.husky/` 目錄則寫入 husky，否則寫入 `.git/hooks/`。
寫入的 hook 只負責呼叫 `tagsmith merge-check`，內容帶有 `# tagsmith-merge-policy (managed)`
標記。若目標位置已有非 tagsmith 管理的 hook，預設中止（**不寫入任何檔案**），需加 `--force` 覆寫。
移除用 `tagsmith hooks uninstall`（只移除帶標記的檔案，不動其他 hook）。

### 攔截行為

當合併違反政策時：

- **建立 merge commit**（`prepare-commit-msg`，尚未 commit）— 無法乾淨回滾，直接中止，
  提示 `git merge --abort`。
- **fast-forward 合併**（`post-merge`，HEAD 已前進）— 自動 `git reset --hard ORIG_HEAD`
  回到合併前狀態。

訊息會列出 target 分支、source 分支與封鎖原因。緊急時可用環境變數略過檢查：

```bash
TAGSMITH_SKIP=1 git merge ...   # 略過一次（緊急用）
HUSKY=0 git merge ...           # 同樣略過
```

### 相關指令

| 指令 | 說明 |
|------|------|
| `tagsmith hooks install [--force]` | 安裝 merge-policy git hooks（`--force` 覆寫既有非 tagsmith hook） |
| `tagsmith hooks uninstall` | 移除 tagsmith 管理的 hooks |
| `tagsmith merge-check [--mode <merge-head\|post-merge>]` | 由 hook 呼叫，套用政策；非日常手動輸入 |

## 結束代碼

| 代碼 | 意義 |
|:---:|------|
| `0` | 成功（含 `--dry-run`） |
| `1` | 失敗：非 git repo、驗證未通過、git 指令錯誤等（訊息走 stderr） |

## 設計

三層架構，各自可獨立測試：

- `core/` — 純函式（pattern、版本模型、analyze、plan、config 驗證），不碰 IO，時鐘由外部注入。
- `git/` — `git` 指令薄封裝（`execFile`，陣列參數、無 shell）。
- `cli/` — commander 指令組裝與輸出。

詳見 [初始設計記錄](history/designs/2026-06-10-tagsmith-design.md)。

## 開發

```bash
npm install
npm test          # 跑全部測試（vitest）
npm run coverage  # 覆蓋率（門檻 80%）
npm run build     # 編譯到 dist/
npm run dev -- <command>   # 以 tsx 直接執行原始碼
```

貢獻流程、新增版本模型的步驟見 [CONTRIBUTING.zh-TW.md](CONTRIBUTING.zh-TW.md)；
版本紀錄見 [CHANGELOG.md](../CHANGELOG.md)。

## License

[MIT](../LICENSE) © 2026 carl
