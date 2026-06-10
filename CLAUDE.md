# CLAUDE.md — Tagsmith 專案指引

給未來 Claude Code 工作階段的專案內指引。全域規範見 `~/.claude/CLAUDE.md`，
本檔僅記錄本專案特有約定。

## 專案目的

CLI 工具：定義專案 git tag 規格（如 `v{version}`、`release/{version}`）、檢視 tag、
安全產生下一個 tag，避免順序或格式異常。

## 技術棧

Node.js + TypeScript（ESM、`"type": "module"`）。commander（CLI）、@clack/prompts
（互動式 init）、picocolors（輸出）、zod（設定驗證）、semver（語義比較）、vitest（測試）。
Git 操作用 `node:child_process` 的 `execFile`，不引入重依賴、不經 shell。

## 架構鐵則（修改時務必遵守）

- **三層分離**：`core/`（純函式，零 IO）→ `git/`（execFile 薄封裝）→ `cli/`（commander）。
- **core 不可有副作用**：不存取時鐘 / 檔案 / 網路。版本模型需要「今天」時，由工廠注入
  `now`（見 `src/core/models/calver.ts`）。這是測試可重現的前提。
- **版本模型走 `VersionModel` 介面**（`src/types.ts`）。新增模型不改核心邏輯；
  步驟見 `CONTRIBUTING.md`。
- **安全保證不可退化**：建立 tag 前必須驗證「格式符合 pattern、版本可解析、嚴格遞增、
  不重複」。改動 `plan.ts` / 模型 `bump`/`parse` 時，務必保留這些不變式並補測試。

## 已知陷阱（過往修正，勿回退）

- **CalVer 相鄰數字 token**：matcher 用固定寬度（`TOKEN_REGEX`），不可改回貪婪 `\d+`，
  否則 `YYYYMM` 會切錯邊界。
- **非正規化版本**：`calver.parse` 末端有 round-trip 檢查（`format(value) === raw`），
  拒絕未補零 / 前導零字串，避免假重複。勿移除。
- **build number 精度**：`build.parse` 限 15 位數，避免超過 `MAX_SAFE_INTEGER`。

## 常用指令

```bash
npm run dev -- <command>   # 免編譯執行原始碼
npm test                   # vitest 全部
npm run coverage           # 覆蓋率（門檻 80%）
npm run build              # 編譯到 dist/（CLI E2E 測試前需先跑）
```

## 注意事項

- CLI 子指令避免用 `--version`（與 commander 全域 `--version` 衝突）；本專案用
  `--set-version`。
- 對外輸出：正常訊息走 stdout，錯誤走 stderr（`src/cli/ui.ts`）；`--json` 模式只印 JSON。
