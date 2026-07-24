# 貢獻指南

[English version](../CONTRIBUTING.md)

感謝你願意改進 Tagsmith。本文件說明開發環境、架構約定與送出變更的流程。

## 開發環境

需求：Node.js ≥ 22、git。

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

設計細節見 [初始設計記錄](history/designs/2026-06-10-tagsmith-design.md)。

## 設定格式

`.tagsmith.json` 支援兩種格式，均由 `src/core/config.ts` 的 `parseConfig` 正規化成
內部 `TagsmithConfig { lines: TagLine[], default: string }` 結構：

- **多線格式**（新）：頂層 `tags` 陣列，每個元素為一條 `TagLine`（`name`、`pattern`、
  `model`、`initialVersion`、`push`、選填 `workspace`），選填頂層 `default`（省略取
  `tags[0].name`）。`workspace` 必須是 repo 內相對路徑，供 `--require-changes` 做
  monorepo release 檢查。
- **扁平格式**（舊，仍相容）：頂層直接放 `pattern`、`model`、`initialVersion`、`push`；
  載入時自動包成 `name: "default"` 的單線結構，行為與改版前完全一致。

新增設定欄位時，`lineSchema`（多線路徑）與 `legacyConfigSchema`（舊格式路徑）可能都需要調整。

## 穩定性契約

自 1.0 起，下列表面受 SemVer 保護：指令與旗標名稱、exit code、JSON envelope 與
已文件化的 `data` 欄位、診斷碼、`.tagsmith.json` 欄位、`action.yml` 的
inputs / outputs、`engines.node` 宣告範圍。人類可讀輸出文字、診斷的 `message`
字串與 `dist/` 內部結構明確**不受**保護。完整清單見中英文 README。

- 增補（新欄位、新診斷碼、新旗標）於 minor 版本發佈；文件已要求呼叫端忽略未知欄位、
  遇未知 `code` 時改看 `severity`。
- 移除或改名任何受保護項目需要 major 版本，並在 changelog 的破壞性變更區塊列出。
- exit code 維持 `0` / `1`，不可新增第三種：既有 `$? -eq 1` 的腳本會靜默失效，
  失敗分類應由診斷碼承載。
- `tests/json-contract.test.ts`、`tests/exit-codes.test.ts`、
  `tests/package-surface.test.ts` 就是這些承諾的具體形式。它們失敗時要當成「契約是否
  該改」的問題，而不是把測試改掉。

## 新增一個診斷碼

`src/core/diagnostics.ts` 的登記表是封閉的，新增一個碼必須同時改四處，否則編譯或
契約測試會失敗：

1. 在 `DIAGNOSTIC_CODES` 的對應分組加入字面值。
2. 在 `json-output.schema.json` 的 `diagnosticCode` enum 加入同一個字面值；
   契約測試會逐字比對兩份清單。
3. 在 `README.md` 與 `docs/README.zh-TW.md` 的診斷碼表格補上說明。
4. 只從以 `AssertRegistered<...>` 包裹的聯集發出該碼，讓未登記的碼維持為編譯錯誤。

注意 `releaseReadiness.checks[].code` 是另一組較短的碼，描述「執行了哪項檢查」，
屬於 `data` 契約而非診斷碼登記表。

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
- 每個 PR 與推送至 `main` 都會在 Node 22 與 24 上執行 `typecheck`、`build`、
  測試與覆蓋率門檻。
- 每個 PR 與推送至 `main` 都會執行
  [Docsentry](https://github.com/CarlLee1983/Docsentry)，將現行面向使用者的 Markdown
  與 `package.json`、`schema.json`、`action.yml` 交叉驗證；`docs/history/` 的歷史紀錄
  刻意不納入檢查。

## 提交規範

採 Conventional Commits，格式：

```
<type>: [ <scope> ] <subject>
```

`type`：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `chore`。
範例：`fix: [calver] 修正相鄰數字 token 解析邊界`。

送 PR 前請確認：`npm run typecheck`、`npm test`、`npm run build` 全部通過，
並視情況更新 `CHANGELOG.md` 的 `[Unreleased]` 區段。
