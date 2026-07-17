# 貢獻指南

[English version](../CONTRIBUTING.md)

感謝你願意改進 Tagsmith。本文件說明開發環境、架構約定與送出變更的流程。

## 開發環境

需求：Node.js ≥ 18、git。

本 repo 為套件原始碼；發佈至 npm 的套件名為 **`@carllee1983/tagsmith`**
（[npm 頁面](https://www.npmjs.com/package/@carllee1983/tagsmith)）。使用者安裝後 CLI 指令仍為 `tagsmith`。

```bash
git clone <repo>
cd Tagsmith
npm install

npm run dev -- list      # 以 tsx 直接執行原始碼（免編譯）
npm test                 # 跑全部測試
npm run test:watch       # 監看模式
npm run coverage         # 覆蓋率（門檻 80%）
npm run typecheck        # 純型別檢查
npm run build            # 編譯到 dist/
```

## 架構

三層，職責清楚、各自可獨立測試：

| 層 | 路徑 | 職責 | 約束 |
|----|------|------|------|
| core | `src/core/` | pattern、版本模型、analyze、plan、config 驗證 | **純函式，禁止 IO 與時鐘存取**（日期由外部注入） |
| git | `src/git/` | `git` 指令薄封裝 | 只做 IO，所有指令用 `execFile`（陣列參數，無 shell） |
| cli | `src/cli/` | commander 指令組裝與輸出 | 只負責解析旗標、呼叫 core/git、格式化輸出 |

設計細節見 [設計文件](superpowers/specs/2026-06-10-tagsmith-design.md)。

## 設定格式

`.tagsmith.json` 支援兩種格式，均由 `src/core/config.ts` 的 `parseConfig` 正規化成
內部 `TagsmithConfig { lines: TagLine[], default: string }` 結構：

- **多線格式**（新）：頂層 `tags` 陣列，每個元素為一條 `TagLine`（`name`、`pattern`、
  `model`、`initialVersion`、`push`），選填頂層 `default`（省略取 `tags[0].name`）。
- **扁平格式**（舊，仍相容）：頂層直接放 `pattern`、`model`、`initialVersion`、`push`；
  載入時自動包成 `name: "default"` 的單線結構，行為與改版前完全一致。

新增設定欄位時，`lineSchema`（多線路徑）與 `legacyConfigSchema`（舊格式路徑）可能都需要調整。

## 新增一種版本模型

版本模型實作 `src/types.ts` 的 `VersionModel` 介面（`parse` / `compare` /
`format` / `bump` / `initial`），新增模型不需改動核心邏輯：

1. 在 `src/core/models/<name>.ts` 建立 `create<Name>Model()` 工廠函式。
2. 在 `src/types.ts` 的 `ModelConfig` 聯集加入設定型別。
3. 在 `src/core/config.ts` 的 `modelSchema`（discriminated union）加入對應分支；
   `lineSchema` 與 `legacyConfigSchema` 共用此 schema，無需重複修改。
4. 在 `src/core/models/index.ts` 的 `createModel()` switch 加上分支。
5. 在 `schema.json` 補上 JSON Schema 分支。
6. 在 `src/cli/init.ts` 加入互動式 / 預設值。
7. 為 `parse`/`compare`/`bump`/`format` 補單元測試。

### 模型實作鐵則

- **純函式**：不可呼叫 `new Date()`、`Math.random()` 等；需要「今天」時由工廠注入
  `now`（見 `calver.ts`）。
- **round-trip 正規化**：`parse` 必須拒絕無法 `format(parse(x)) === x` 的非正規字串，
  避免非正規 tag 假冒或重複正規 tag。
- **嚴格遞增**：`bump` 的結果必須 `compare(next, prev) > 0`；無法保證時應拋錯，
  讓 `plan.ts` 的防護攔截。
- **數值精度**：限制可解析的位數，避免超過 `Number.MAX_SAFE_INTEGER` 導致比較失準。

## 測試要求

- 新功能 / 修 bug 一律先補測試（TDD）。
- 核心純函式應接近全覆蓋；整體覆蓋率門檻 80%（`vitest.config.ts`）。
- 測試分三類：
  - 單元 — `tests/{models,pattern,analyze,plan,config}.test.ts`
  - 整合 — `tests/integration.test.ts`（在 `os.tmpdir()` 建臨時 git repo）
  - 指令 — `tests/commands.test.ts`（in-process）、`tests/cli.test.ts`（built binary E2E）
- CLI E2E 需先 `npm run build`。

## 提交規範

採 Conventional Commits，格式：

```
<type>: [ <scope> ] <subject>
```

`type`：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `chore`。
範例：`fix: [calver] 修正相鄰數字 token 解析邊界`。

送 PR 前請確認：`npm run typecheck`、`npm test`、`npm run build` 全部通過，
並視情況更新 `CHANGELOG.md` 的 `[Unreleased]` 區段。
