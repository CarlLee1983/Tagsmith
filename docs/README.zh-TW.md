# Tagsmith

[English documentation](../README.md) · [文件索引](README.md)

想先用決策流程理解採用路徑？閱讀 [HTML 完整流程](workflow/)。設定格式與完整 CLI 參考仍在本文件。

[![npm version](https://img.shields.io/npm/v/@carllee1983/tagsmith.svg)](https://www.npmjs.com/package/@carllee1983/tagsmith)

定義專案的 git tag 規格、檢視現有 tag，並安全地產生下一個 git tag——避免順序錯亂或格式不一致。

支援 **SemVer**、**CalVer** 與 **build number** 三種版本模型，tag 樣式可自訂（例如 `v{version}`、`release/{version}`）。

- 🏷️ **規格化** — 用 `.tagsmith.json` 定義全專案的 tag 樣式與版本模型（可選）
- 🔍 **可檢視** — 依語義排序列出 tag，標示格式 / 順序 / 重複異常
- 🛡️ **防呆** — 建立前驗證格式、版本可解析、嚴格遞增、tag 不重複
- ✅ **發版就緒檢查** — 可選擇要求正確分支、乾淨 worktree、annotated / signed tag 與 `HEAD` target
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

需求：Node.js ≥ 22、git。

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

每條線的欄位：

| 欄位 | 必填 | 說明 |
|------|:---:|------|
| `name` | ✓ | 線名，全陣列唯一，供 `--tag` 指定 |
| `pattern` | ✓ | 合法 Git tag 樣式，且**恰好包含一個** `{version}` 佔位符。例：`v{version}`、`release/{version}` |
| `model` | ✓ | 版本模型物件（見下） |
| `initialVersion` | ✓ | 無既有合規 tag 時的起點 |
| `push` | | `create` 是否預設 push（預設 `false`） |
| `workspace` | | monorepo 套件的 repo 相對路徑，供 `--require-changes` 判斷變更 |
| `artifact` | | `{ "type": "package-json" }`；檢查此 line 的 manifest version |

頂層選填欄位：

| 欄位 | 說明 |
|------|------|
| `default` | 預設操作線名；省略時取 `tags[0].name` |
| `releasePolicy` | 可選的本機發版前置條件；只有 `create --enforce-policy` 才強制執行 |
| `commitPolicy` | 選配、依順序的 Conventional Commit → release 規則 |

### 舊格式（仍相容）

既有的單線扁平格式無需修改，仍可正常載入：

```json tagsmith-config
{
  "pattern": "v{version}",
  "model": { "type": "semver", "allowPrerelease": true },
  "initialVersion": "0.1.0",
  "push": false
}
```

Tagsmith 載入時會自動將其視為一條名為 `default` 的單線設定；現有使用者**零修改**即可繼續使用。

可在檔案加上 `"$schema": "./node_modules/@carllee1983/tagsmith/schema.json"` 取得編輯器補全與驗證。

所有層級的設定物件都會拒絕未知欄位，不會靜默丟棄 typo 再套用預設值；錯誤會包含
完整位置，例如 `tags.0.pussh`。舊格式與多線格式都可合法使用 `$schema` 與
`mergePolicy`。

### Monorepo workspace

在 tag 線加上 `workspace`，即可把該線限制在某個套件目錄。既有的 `--tag` 讓每個
workspace 維持獨立版本序列；搭配 `--require-changes`，只有該套件自上個 tag 後有已提交
的變更時才會允許預覽或建立 release。
若使用 `--from-commits`，Tagsmith 也只會採納有變更該 workspace 的 commits。

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

`workspace` 必須是 repo 內的相對路徑；未設定時，既有單一 repo 的設定與行為完全不變。
`plan --all` 會讀取所有已設定的 line：有 `workspace` 的 line 只檢查該套件，未設定者則
檢查整個 repository。

### Artifact version 一致性

在 tag line 加上 `artifact: { "type": "package-json" }`，即可把該 line 的 package
manifest 作為版本來源。Tagsmith 會讀取 `workspace/package.json`；沒有 `workspace` 時讀取
repository root 的 `package.json`。其中的 `version` 必須能由該 line 的版本模型解析，且必須
完全等於不含 tag prefix / suffix 的 tag version。

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

`audit` 讀取的是每個歷史 tag 當時的 manifest，所以本機尚未提交的版本調整不會讓舊 release
失效。設定 policy 後，`create --enforce-policy` 會讀取 candidate target commit，並在
manifest 缺失、格式錯誤、version 無效或不一致時停止。Tagsmith 不會改寫 manifest、lockfile
或 artifact。

### Release readiness

頂層選配 `releasePolicy` 可把本機發版前置條件提交進 repository。未設定時完全關閉；
只有**同時**設定 policy 與傳入 `--enforce-policy`，才會改變既有 `create` 行為。

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

- `allowedBranches` 支援 `*` 與 `?` glob；detached `HEAD` 不符合規則。
- `requireCleanWorktree` 包含 staged、unstaged 與 untracked 檔案。
- `requireAnnotatedTag` 需傳入 `--message`；`signature: "required"` 需傳入
  `--sign --message "…"`，並由已設定的 Git signing key 實際簽章。
- `requireHeadTag` 只檢查**這次候選 tag**的 target，不追溯舊 tag；若刻意要選其他
  commit，可用 `--target <ref>`，但 enforce 時會依 policy 拒絕或允許。
- `requireArtifactVersion` 要求選定 line 設定支援的 artifact，並讓 candidate target 中的
  version 與 candidate tag 一致。

`tagsmith audit` 顯示目前 branch / worktree 的 readiness；沒有 `--fetch` 時絕不存取
remote。`tagsmith create --enforce-policy` 會在任何 Git 變更前，以同一組規則檢查具體候選 tag。

### Commit policy

未設定 `commitPolicy` 時，既有預設語意不變：breaking change 為 `major`、`feat` 為
`minor`、`fix` / `perf` 為 `patch`。需要採用團隊自己的分類時，可依順序定義 rules；第一個
命中的 rule 生效。rule 可用精確的 `type`、`scope`、`breaking` 篩選，並設定一個 `release`
等級或 `ignore: true`。設定 custom policy 後，未命中的 commit 會被忽略。

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

`next --from-commits`、`create --from-commits` 與 `plan --all --from-commits` 的 recommendation
都會保留相關 commit ID、摘要與命中的 rule。

若 shallow checkout 不含從最新 tag 到 `HEAD` 的完整範圍，上述指令會以
`incomplete-git-history` 失敗，不會根據部分 commit 靜默算出錯誤 bump。請先取得完整
歷史，或使用下方 Action 設定。

### 三種版本模型

| 模型 | 範例 | 專屬設定 | 遞增規則 |
|------|------|----------|----------|
| `semver` | `1.2.3`、`1.2.3-rc.1` | `allowPrerelease`（預設 `true`） | `--level major/minor/patch/prerelease` |
| `calver` | `2026.06.0` | `format`（token：`YYYY YY MM DD MICRO`） | 滾動到當天；同日遞增 `MICRO` |
| `build` | `0042` | `padding`（補零位數，預設 `0`） | 單調 +1 |

<details>
<summary>各模型設定範例（舊格式）</summary>

**SemVer**（`v1.2.3`）

```json tagsmith-config
{
  "pattern": "v{version}",
  "model": { "type": "semver", "allowPrerelease": true },
  "initialVersion": "0.1.0",
  "push": false
}
```

**CalVer**（`release/2026.06.0`，token 之間需有分隔字元或固定寬度）

```json tagsmith-config
{
  "pattern": "release/{version}",
  "model": { "type": "calver", "format": "YYYY.MM.MICRO" },
  "initialVersion": "2026.06.0",
  "push": false
}
```

**Build number**（`build-0042`）

```json tagsmith-config
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
**重複版本**（`duplicate-version`）。多線設定下，若同一 tag 同時符合多條線，會另外
標示為 **歸屬歧義**（`ambiguous-assignment`），而不再默默依設定順序指派。

預設只列出 `default` 線的 tag；多線設定可用 `--tag` 指定線或 `--all` 一次列出所有線。

| 旗標 | 說明 |
|------|------|
| `--json` | 輸出版本化 JSON envelope（見下方） |
| `-t, --tag <name>` | 只列出指定線的 tag |
| `--all` | 列出每條線（各自分組）與無主 tag（Unassigned / orphan tags） |

```jsonc
// tagsmith list --all --json（多線；共同 envelope）
{
  "schemaVersion": 1,
  "command": "list",
  "ok": true,
  "data": {
    "lines": [{ "line": "app", "latest": "v1.2.0" }],
    "orphans": ["legacy-tag"],
    "ambiguous": []
  },
  "diagnostics": [{ "code": "orphan-tag", "severity": "warning", "message": "..." }]
}
```

### `tagsmith audit`

唯讀稽核完整 tag 歷史，不建立、不推送、也不改寫任何 tag。它會彙整每條線的合規 tag
與最新版本，並回報無主 tag、無法解析或重複的版本，以及同時符合多條線的 tag。
`orphan-tag` 是 warning；`unparseable-version`、`duplicate-version` 與
`ambiguous-assignment` 是 error，出現 error 時指令會以 exit 1 結束。

設定 `releasePolicy` 時，audit 也會以 `PASS` / `WARN` / `FAIL` 顯示目前 branch 與
worktree 的 readiness。annotation、signature、target 是候選 tag 的條件，因此只有
`create --enforce-policy` 會判定；JSON 請使用穩定的 `release-*` diagnostic code。
預設不查 remote；必須明確傳入 `--fetch` 才會同步並在輸出標記 remote 已檢查。

對設定 `package-json` artifact 的 line，audit 也會讀取每個合規歷史 tag 當時的 manifest。
`artifact-package-json-missing`、`artifact-package-json-malformed`、`artifact-version-missing`、
`artifact-version-invalid` 與 `artifact-version-mismatch` 都是穩定的 error code。

audit 另外會在完全不涉及任何 tag 的情況下，判定兩條線的 pattern 是否可能接受同一個
tag 名稱。`data.overlaps` 列出每一對已證實會相交的線，並附上雙方都命中的 witness tag，
讓結果可以直接重現：

```jsonc
// tagsmith audit --json，線為 "v{version}" 與 "v{version}-rc"
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

`pattern-overlap-certain` 代表某條線實際會產生的 tag 也被另一條線命中；
`pattern-overlap-possible` 代表兩者只在「目前沒有任何線的起始版本會產生」的 tag 上相交。
兩者都是 warning，因為碰撞尚未發生 —— 已經碰撞的 tag 仍由既有的 `ambiguous-assignment`
error 負責。加上 `--strict-overlap` 可把這兩碼視為 error 並讓 audit 失敗。

```bash
tagsmith audit
tagsmith audit --json
tagsmith audit --fetch --remote origin
tagsmith audit --strict-overlap        # pattern 重疊視為 error
```

### `tagsmith plan --all`

唯讀地一次判斷所有設定 line 的發版需要。輸出順序與 `.tagsmith.json` 相同；每條 line
會是 `ready`、`skipped` 或 `blocked`。`ready` 的 candidate 與以相同條件執行
`tagsmith next --tag <name>` 一致；workspace 沒有已提交變更時為 `skipped`，不會建立或
推送任何 tag。

| 旗標 | 說明 |
|------|------|
| `--all` | 必填；明確要求檢視全部已設定 line |
| `--json` | 輸出可供 CI / script 讀取的 versioned JSON |
| `--fetch` | 規劃前從 remote 取回 tags |
| `--remote <name>` | `--fetch` 使用的 remote（預設 `origin`） |
| `--from-commits` | 依 Conventional Commits 建議 SemVer bump；非 SemVer line 會明確 blocked |
| `--require-changes` | 要求每條 line 宣告 `workspace`；未變更 line 仍是 `skipped` |

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

`blocked` line 會讓 command 回傳非零 exit code，並以
`ambiguous-assignment`、`workspace-required`、`from-commits-unsupported` 等穩定 code
說明原因；其他 line 的結果仍會完整輸出。

### `tagsmith check`
驗證指定 tag 是否符合規格；不帶參數時檢查 repo 內所有既有 tag。
適合用於 CI 或 git hook（exit 0 = 全部合規，exit 1 = 發現異常）。

多線設定下，每個 tag 會對照所有線進行比對，並在結果中回報唯一歸屬線與完整的
`matches`。`line: null` 且 `anomaly: "ambiguous-assignment"` 代表有多條線符合，
不能安全地選其中一條。`--tag <name>` 不會隱藏這種設定歧義。

| 旗標 | 說明 |
|------|------|
| `--json` | 輸出結構化 JSON |
| `--strict` | 對指定候選 tag 比對既有版本；不帶 tag 時嚴格稽核全部本地 tag |
| `-t, --tag <name>` | 只對指定線驗證 |

```jsonc
// tagsmith check v1.2.3 "release/2026.06.1" junk --json
{
  "schemaVersion": 1,
  "command": "check",
  "ok": false,
  "data": {
    "results": [
      { "raw": "v1.2.3", "line": "app", "matches": ["app"], "ok": true, "anomaly": null },
      { "raw": "junk", "line": null, "matches": [], "ok": false, "anomaly": "pattern-mismatch" }
    ],
    "strict": false
  },
  "diagnostics": [{ "code": "pattern-mismatch", "severity": "error", "message": "..." }]
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
{
  "schemaVersion": 1,
  "command": "next",
  "ok": true,
  "data": { "tag": "v1.3.0", "version": "1.3.0", "fromVersion": "1.2.0", "fresh": false, "line": "app", "workspace": null },
  "diagnostics": []
}
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
| `--enforce-policy` | 在建立前強制頂層 `releasePolicy`；未設定 policy 時維持既有行為 |
| `--target <ref>` | tag target（預設 `HEAD`） |
| `--sign` | 建立 signed annotated tag；必須同時傳入 `--message` |
| `--dry-run` | 只預覽，不建立 |
| `--allow-out-of-order` | 允許版本不大於現有最大值 |
| `-t, --tag <name>` | 操作指定線（預設：設定檔的 `default` 線） |

## 常見情境

```bash
# 發佈 patch 並推送
tagsmith create --push

# 發佈帶 annotation 的 minor release
tagsmith create -l minor -m "新增登入 API"

# 強制執行已提交的發版政策
tagsmith create --enforce-policy -m "Release 1.2.0"

# CI 中取得下一個 tag 字串
NEXT=$(tagsmith next --json | jq -r .data.tag)

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

# monorepo：先規劃全部套件，再逐一明確建立 ready 的 tag
tagsmith plan --all --from-commits --json
```

## 遠端安全與 CI

`create --push` 在計算版本前會預設從 `origin` 取回 tags，避免過期的本地 clone 重複使用
隊友已發佈的版本。預覽時可加 `--fetch`；以 `--remote <name>` 改用其他 remote。fetch 後若
仍有其他人搶先推送，Git 仍會拒絕 push；此時請重新 fetch 後重新計算版本。
`--dry-run` 預設維持本地操作；需要完全比照遠端狀態時請明確加上 `--fetch`。

`tagsmith check --strict <tag>` 會額外將候選版本與 repo 既有歷史比對；不帶 tag 時會嚴格
稽核全部本地 tag。所有 `--json` 讀取型指令（`list`、`check`、`next`、`audit`、`plan`）都輸出
`schemaVersion`、`command`、`ok`、`data`、`diagnostics`；請從 `data` 讀取指令資料，並用
diagnostic `code` 而不是 message 做自動化判斷。共同結構請見
[`json-output.schema.json`](../json-output.schema.json)。

本 repo 也可直接作為可重用 GitHub Action：自行安裝並建置 Tagsmith、預設 fetch tags，先
執行 `audit --json`，再輸出唯讀的 `plan --all --json`。

```yaml
name: Validate tags
on: [push, pull_request]

jobs:
  tags:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          fetch-depth: 0
      - id: tagsmith
        uses: CarlLee1983/Tagsmith@main # 正式環境請固定 release tag 或 commit SHA。
        with:
          plan-from-commits: "true"
          plan-tag: api
      - if: steps.tagsmith.outputs.has-releases == 'true'
        env:
          TAGSMITH_PLAN: ${{ steps.tagsmith.outputs.plan }}
        run: printf '%s\n' "$TAGSMITH_PLAN" | jq .
```

若設定檔不在 repo 根目錄，或已自行同步 tags，可設定：
`with: { working-directory: packages/api, fetch-tags: "false" }`。

當 `plan-from-commits` 與 `fetch-tags` 都是 `true`，Action 會補全 shallow history，並從
`remote`（預設 `origin`）取得 tags。若設為 `fetch-tags: "false"`，Action 完全不會 fetch；
使用者必須自行設定 `fetch-depth: 0`，否則不完整歷史會明確失敗。

Action 的 `plan` output
是完整 JSON envelope；`has-releases` 在任一 line 為 ready 時為 `true`；`next-tag` 是
`plan-tag` 或設定預設 line 的 ready candidate（否則為空字串）。它不會建立 tag。

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

## 穩定性契約

自 1.0 起，下列表面受 SemVer 保護，破壞它們需要 major 版本：

| 表面 | 承諾內容 |
| --- | --- |
| 指令與旗標 | 既有指令名、`ls` 別名、旗標名與其語意 |
| 結束代碼 | 每個指令回傳 0 / 非 0 的條件（見下表） |
| JSON envelope | `schemaVersion`、`command`、`ok`、`data`、`diagnostics` 與已文件化的 `data` 欄位 |
| 診斷碼 | 登記表中每個碼的字面值與觸發條件 |
| 設定檔 | `.tagsmith.json` 既有欄位語意與 `schema.json` |
| GitHub Action | `action.yml` 的 inputs / outputs 名稱與語意 |
| 支援平台 | `engines.node` 宣告的範圍 |

下列項目**不受**保護，任何版本都可能調整：

- 人類可讀輸出的措辭、顏色與排版。自動化請一律使用 `--json`，這正是 envelope 存在的理由。
- 診斷訊息的 `message` 字串。只有 `code` 是契約。
- `dist/` 的內部模組結構。Tagsmith 發佈的是 CLI 而非 library：`exports` 僅開放
  `schema.json`、`json-output.schema.json` 與 `package.json`。

新增欄位、新增診斷碼與新增旗標都是增補，於 minor 版本發佈。因此呼叫端必須忽略未知的
`data` 欄位，遇到未知 `code` 時改以 `severity` 判斷嚴重度。

### 結束代碼

Tagsmith 只用 `0`（成功）與 `1`（其餘），刻意不細分失敗類型——既有
`$? -eq 1` 的腳本不會失效，失敗分類則由 `--json` 的診斷碼承載。

| 指令 | 回傳 0 | 回傳 1 |
| --- | --- | --- |
| `list` | 成功讀取 tag | 無法讀取設定或 repository |
| `check` | 所有受檢 tag 皆通過 | 任一 tag 不通過 |
| `next` | 成功算出候選 | 沒有安全的候選 |
| `audit` | 無 error 等級診斷 | 有 error 等級診斷 |
| `plan --all` | 沒有任何線被阻擋 | 任一線被阻擋 |
| `create` | 建立成功，或 `--dry-run` 預覽成功 | 驗證失敗或 git 指令錯誤 |
| `merge-check` | 政策通過，或以 `HUSKY=0` / `TAGSMITH_SKIP=1` 略過 | 政策拒絕該次合併 |
| `hooks install` / `uninstall` | 完成 | 前置檢查失敗 |

### 診斷碼

登記表是封閉的；`json-output.schema.json` 以 enum 發佈同一份清單，程式與 schema
一旦分歧測試即失敗。

| 分組 | 診斷碼 |
| --- | --- |
| Tag 異常 | `pattern-mismatch`、`unparseable-version`、`duplicate-version`、`ambiguous-assignment`、`invalid-git-tag` |
| 設定層級 | `orphan-tag`、`pattern-overlap-certain`、`pattern-overlap-possible`、`workspace-required`、`from-commits-unsupported` |
| Repository 歷史 | `incomplete-git-history` |
| Artifact 一致性 | `artifact-package-json-missing`、`artifact-package-json-malformed`、`artifact-version-missing`、`artifact-version-invalid`、`artifact-version-mismatch` |
| 發版政策 | `release-branch-not-allowed`、`release-worktree-dirty`、`release-remote-not-checked`、`release-annotation-required`、`release-target-not-head`、`release-signature-required`、`release-artifact-not-configured`、`release-artifact-version-invalid` |
| 指令層級 | `command-error`（指令無法完成時發出，此時 `data` 為 `null`） |

`data.releaseReadiness.checks[].code` 是另一組較短的碼（`release-branch`、
`release-worktree`、`release-remote`、`release-annotation`、`release-target`、
`release-signature`、`release-artifact`），描述「執行了哪項檢查」，而非失敗原因。

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
