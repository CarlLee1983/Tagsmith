# Changelog

本專案遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 格式，
版本號採用 [SemVer](https://semver.org/lang/zh-TW/)。

## [Unreleased]

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

[Unreleased]: https://github.com/carl/tagsmith/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/carl/tagsmith/releases/tag/v0.1.0
