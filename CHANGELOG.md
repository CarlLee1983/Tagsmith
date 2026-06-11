# Changelog

本專案遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 格式，
版本號採用 [SemVer](https://semver.org/lang/zh-TW/)。

## [Unreleased]

## [0.3.1] - 2026-06-11

### 修正

- **post-merge 不再誤殺正常合併 commit**：`merge-check --mode post-merge` 原本把本次
  建立的 merge commit（`--no-ff` 或分歧合併）誤判為 fast-forward，因解析不到來源而
  `reset --hard` 還原已被 `prepare-commit-msg` 放行的合併。改為僅在 HEAD 確實是
  fast-forward（非本次新建的 merge commit）時才於 post-merge 套用政策。
- **允許分支拉取自身遠端**：在受保護分支上 fast-forward `git pull`（HEAD 推進到自身
  `origin/<branch>`）原本來源解析為 null 而被 `onUnknownSource` 封鎖。現視為分支對自身的
  同步（非跨分支合併），一律放行。

## [0.3.0] - 2026-06-11

### 新增

- **合併政策（merge policy）**：Tagsmith 從「tag 工具」延伸為 git 工作流護欄。
  新增 `.tagsmith.json` 選配 `mergePolicy` 區塊，限制受保護分支的合併來源
  （`allow` 白名單 / `deny` 黑名單，二選一），來源比對支援 glob（`*`、`?`）。
  選配且缺省即關閉，對既有使用者完全向後相容。
- `merge-check` 指令：由 git hook 呼叫，讀取 git 狀態解析合併來源並套用政策。
  違規時 `merge-head` 模式中止並提示 `git merge --abort`；`post-merge` 模式（fast-forward）
  自動 `git reset --hard ORIG_HEAD` 回滾。支援 `--mode merge-head|post-merge`。
- `hooks install [--force]` / `hooks uninstall` 指令：把呼叫 `merge-check` 的
  `prepare-commit-msg` / `post-merge` hook 寫入專案（偵測 `.husky/`，否則 `.git/hooks/`）。
  安裝具原子性——任一 hook 為外來內容時預設中止且不寫入任何檔案，需 `--force` 覆寫；
  uninstall 只移除帶 `# tagsmith-merge-policy (managed)` 標記的 hook。
- 環境變數 `TAGSMITH_SKIP=1` 或 `HUSKY=0` 可緊急略過合併檢查。
- `schema.json` 擴充 `mergePolicy` 結構，提供編輯器補全與驗證。

## [0.2.1] - 2026-06-11

### 修正

- CLI `--version` 改從 `package.json` 讀取，不再寫死舊版號。

### 文件

- README / CONTRIBUTING / CLAUDE / husky 範本：更新為 npm 套件 `@carllee1983/tagsmith`、zero-config 用法與 `$schema` 路徑。
- `schema.json` 的 `$id` 改指向 `CarlLee1983/Tagsmith` repo。

## [0.2.0] - 2026-06-11

### 新增

- **npm 發佈**：以 [`@carllee1983/tagsmith`](https://www.npmjs.com/package/@carllee1983/tagsmith) 發佈至 npm（scoped 公開套件；CLI 指令名稱仍為 `tagsmith`）。
- **多條 tag 線（multi tag-line）**：設定檔可定義多條獨立 tag 線（`tags` 陣列），
  各線有自己的 `pattern`、版本模型與 `push` 設定，彼此獨立遞增。tag 依 `lines` 宣告
  順序歸屬第一條符合的線；不符任何線者列為無主（orphan）tag。
- **舊扁平格式自動升格**：無 `tags` 欄位的舊設定載入時自動包成單一 `default` 線，
  既有使用者零修改相容。
- `check` 指令：依規格驗證給定 tag，或不帶參數時 lint 全部 repo tag；多線下對照所有線
  並回報歸屬線（或 `null`），支援 `--tag <name>` 限定與 `--json`。
- `guide` 指令：互動式導覽 init → list → next → create。
- `list --all`：一次檢視所有線（各自分組）與無主 tag；`--json` 對應輸出 `lines` /
  `orphans` 結構。
- `next` / `create` / `list` / `check` 新增 `-t, --tag <name>` 選線（省略時取設定檔的
  `default` 線）。
- 各指令完成後印出「下一步」引導提示（`--json` 模式不印）。
- Husky `pre-push` 範本與教學文件（`docs/husky-pre-push.md`），於推送前自動以
  `tagsmith check` 把關。
- **Zero-config 模式**：無 `.tagsmith.json` 時，`next` / `create` / `list` / `check`
  自動以 semver 預設值運作，並從既有 git tag 推斷 pattern（如 `v{version}`、`{version}`）；
  `init` 改為可選。

## [0.1.0] - 2026-06-10

### 新增

- 初版 CLI，四個核心指令：
  - `init` — 互動式產生 `.tagsmith.json` tag 規格（亦支援 `--yes` 非互動模式）。
  - `list` (`ls`) — 列出 git tag，依語義排序，標示格式 / 順序 / 重複異常。
  - `next` — 計算並預覽下一個 tag，保證嚴格遞增，不實際建立。
  - `create` — 驗證後建立 git tag，支援 annotated、`--push`、`--dry-run`、
    `--set-version`、`--allow-out-of-order`。
- 三種版本模型（`VersionModel` 介面）：
  - `semver` — 標準語義化版本，可選 `allowPrerelease`。
  - `calver` — 日曆版本，`format` 支援 `YYYY YY MM DD MICRO` token。
  - `build` — 單調遞增 build number，可選 `padding` 補零。
- 自訂 tag 樣式（`pattern` 必含 `{version}` 佔位符），例如 `v{version}`、
  `release/{version}`。
- 設定檔 JSON Schema（`schema.json`）。
- 安全保證：建立 tag 前驗證格式符合 pattern、版本可解析、嚴格大於現有最大版本、
  tag 名稱不重複。
- 三層架構：`core/`（純函式）、`git/`（`execFile` 薄封裝）、`cli/`（commander）。
- 測試：68 個（vitest），覆蓋率 84%，含臨時 git repo 整合測試與 built-binary E2E。

[Unreleased]: https://github.com/CarlLee1983/Tagsmith/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/CarlLee1983/Tagsmith/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/CarlLee1983/Tagsmith/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CarlLee1983/Tagsmith/releases/tag/v0.1.0
