# Tagsmith 設計文件

> 日期：2026-06-10
> 狀態：已核可（設計方向經互動式問答確認）

## 目標

提供一個 CLI 工具，讓專案能：

1. **定義** git tag 規格（樣式 + 版本模型），例如 `v{version}`、`release/{version}`。
2. **檢視** 現有 tag，依語義排序並標示格式 / 順序異常。
3. **快速生成** 下一個合規 tag，避免順序錯亂或格式不一致。

## 技術選型

| 項目 | 選擇 | 理由 |
|------|------|------|
| 語言 / Runtime | Node.js 22 + TypeScript | 跨平台、`npx @carllee1983/tagsmith` 易發佈 |
| CLI 框架 | commander | 輕量、成熟 |
| 互動式 init | @clack/prompts | 優質互動 UX |
| 顏色輸出 | picocolors | 體積極小 |
| 設定驗證 | zod | 邊界驗證、型別推導 |
| Git 操作 | `node:child_process` execFile 薄封裝 | 避免重依賴 |
| 測試 | vitest | TDD、覆蓋率 |
| 版本比較 | semver 套件（僅 semver model 用） | 標準語義比較 |

## 架構與模組

```
src/
├─ cli/        指令入口（commander 組裝、輸出）
│  ├─ index.ts │ init.ts │ list.ts │ next.ts │ create.ts
├─ core/       純函式，不碰 git，易測
│  ├─ config.ts    載入 / 驗證 .tagsmith.json（zod）
│  ├─ pattern.ts   tag 樣式 ⇄ {version} 解析與還原
│  ├─ models/      VersionModel 介面 + semver/calver/build
│  ├─ analyze.ts   解析現有 tag、排序、偵測異常
│  └─ plan.ts      計算 next 並保證嚴格遞增
├─ git/git.ts  execFile 封裝（listTags/createTag/push/ensureRepo）
└─ types.ts
tests/         vitest 單元 + 整合（臨時 git repo）
```

**設計原則**：`core/` 為純函式（不做 IO），`git/` 只負責 IO，`cli/` 只做組裝與輸出。三層各自可獨立測試。

## 設定檔結構（`.tagsmith.json`）

```jsonc
{
  "$schema": "./node_modules/@carllee1983/tagsmith/schema.json",
  "pattern": "v{version}",        // 必含 {version} 佔位符
  "model": {
    "type": "semver",             // "semver" | "calver" | "build"
    "allowPrerelease": true,      // semver 專用
    "format": "YYYY.MM.MICRO",    // calver 專用
    "padding": 0                  // build 專用（數字補零位數）
  },
  "initialVersion": "0.1.0",      // 無既有 tag 時的起點
  "push": false                   // create 預設是否 push
}
```

## VersionModel 介面

```ts
interface VersionModel<V = unknown> {
  readonly type: string
  parse(raw: string): V | null              // 解析版本字串，失敗回 null
  compare(a: V, b: V): number               // <0 / 0 / >0
  format(v: V): string                      // 還原為字串
  bump(v: V, level: BumpLevel): V           // 遞增
  initial(raw: string): V                   // 從 initialVersion 建立
}
type BumpLevel = "major" | "minor" | "patch" | "prerelease" | "auto"
```

- **semver**：以 `semver` 套件實作 parse/compare/bump，支援 prerelease。
- **calver**：依 `format`（YYYY/MM/DD/MICRO）以「今天」產生；同日已存在則遞增 MICRO。日期由呼叫端注入（純函式可測）。
- **build**：單調遞增整數，支援補零。

## 指令行為

### `tagsmith init`
互動式問答（pattern、model 類型與參數、initialVersion、push 預設），寫出 `.tagsmith.json`。
支援非互動旗標（`--pattern`、`--model`、`--yes`）。已存在則需 `--force`。

### `tagsmith list`
讀 config → `git tag -l` → 對每個 tag 套 pattern 解析：
- **合規**：符合 pattern 且版本可解析 → 依 compare 由新到舊排序。
- **異常**：不符 pattern / 版本無法解析 / 重複版本 → 標示原因。
輸出表格（含最新版本標記）；異常項一律列出；`--json` 輸出結構化資料。

### `tagsmith next`
讀 config → 找出最新合規版本 → 依 `--level`（semver 預設 patch）bump → 套 pattern。
印出候選 tag；保證候選 > 目前最大（由 bump 數學保證）。`--json` 輸出。
無既有 tag 時用 `initialVersion`。

### `tagsmith create`
計算（或 `--version` 指定）候選 → 驗證：
1. 格式符合 pattern。
2. 版本可解析。
3. 嚴格大於現有最大合規版本（除非 `--allow-out-of-order`）。
4. tag 名稱尚未存在。
通過後執行 `git tag`（`-m` 則為 annotated）；`--push` 推送；`--dry-run` 只預覽。

## 錯誤處理

- 邊界驗證：config（zod）、git repo 存在性、pattern 含 `{version}`。
- 找不到 config → 使用 zero-config semver 預設（0.2.0+）；自訂規格可執行 `tagsmith init`。
- 非 git repo → 明確錯誤。
- create 違反順序 / 重複 → 阻擋並說明，提供覆寫旗標。
- 錯誤訊息對使用者友善；細節走 stderr。

## 測試策略

- **單元**：models（parse/compare/bump/format）、pattern、analyze、plan、config 驗證 → 純函式全覆蓋。
- **整合**：在 `os.tmpdir()` 建臨時 git repo，跑 list/next/create 全流程。
- 目標覆蓋率 ≥ 80%。

## 非目標（v1 YAGNI）

- 多 channel / 多 pattern（rc、stable 分流）。
- TS/JS 動態 config。
- monorepo 多套件版本協調。
- changelog 生成。
```

