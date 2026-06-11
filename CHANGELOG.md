# Changelog

本專案遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 格式，
版本號採用 [SemVer](https://semver.org/lang/zh-TW/)。

## [Unreleased]

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

[Unreleased]: https://github.com/CarlLee1983/Tagsmith/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/CarlLee1983/Tagsmith/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CarlLee1983/Tagsmith/releases/tag/v0.1.0
