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

## 設定格式與多線架構

- **內部形狀**：`TagsmithConfig` 一律正規化為 `{ lines: TagLine[], default: string }`。
  所有 core / CLI 函式操作此正規化結構，不直接碰原始 JSON。
- **舊扁平格式自動升格**：`parseConfig` 在載入時判斷是否為舊格式（無 `tags` 欄位），
  自動包成單一 `TagLine`（`name: "default"`），回傳結構與多線格式完全相同。
  舊格式使用者**零修改**即相容。
- **tag → 線的歸屬**：`assignTagsToLines`（`src/core/lines.ts`）依 `lines` **宣告順序**
  找第一條 `compilePattern(line.pattern).extract(tag) !== null` 的線；多線 pattern 重疊
  時先宣告者勝（tie-break）。不符任何線的 tag 進 `orphans`。
- **選線**：CLI 各指令以 `selectLine(config, flags.tag)` 取得目標線；省略 `--tag` 時
  取 `config.default`；線名不存在時錯誤訊息列出可用名單。
- **workspace scope**：`TagLine.workspace` 是選填、repo 相對且不可跳脫 repo 的路徑。
  `next` / `create --require-changes` 透過 git adapter 比對最新該線 tag 後的已提交變更；
  `--from-commits` 也只能讀取該 workspace 的 commit 歷史。workspace 未設定時必須明確報錯，
  不能退化成全 repo 檢查。

## 合併政策（merge policy）

- **與 tag 邏輯解耦**：獨立放在 `src/core/merge-policy/`，共用既有 `src/git/git.ts`。
  改動不應影響任何 tag 相關命令；`mergePolicy` 為 `.tagsmith.json` 選配區塊，缺省即關閉。
- **模組單一職責**：`schema.ts`（zod 驗證 + allow/deny 二選一 refine）→ `match.ts`
  （glob→regex，純函式）→ `validate.ts`（套政策，純函式不碰 git）→ `resolve.ts`
  （查 git 解析來源分支）；CLI 的 `merge-check.ts` 組合上述三者並負責副作用（回滾 / exit code）。
- **glob 語意刻意非 POSIX**：`*` 比對含 `/`（跨多層），見 `match.ts` 註解，勿改回 `[^/]*`。
- **緊急略過**：`HUSKY=0` 或 `TAGSMITH_SKIP=1` 跳過 `merge-check`（沿用原 sh 腳本語意）。
- **hooks 寫入帶標記**：`# tagsmith-merge-policy (managed)`；install 具原子性（pre-flight
  檢查全部 hook 才寫），uninstall 只移除帶標記者。hook 內以 `npx --no -- tagsmith ...` 呼叫
  （勿用已失效的 `--no-install`）。

## 已知陷阱（過往修正，勿回退）

- **CalVer 相鄰數字 token**：matcher 用固定寬度（`TOKEN_REGEX`），不可改回貪婪 `\d+`，
  否則 `YYYYMM` 會切錯邊界。
- **非正規化版本**：`calver.parse` 末端有 round-trip 檢查（`format(value) === raw`），
  拒絕未補零 / 前導零字串，避免假重複。勿移除。
- **build number 精度**：`build.parse` 限 15 位數，避免超過 `MAX_SAFE_INTEGER`。

## 專案資訊

- **npm 套件**：[`@carllee1983/tagsmith`](https://www.npmjs.com/package/@carllee1983/tagsmith)
- **CLI 指令名稱**：`tagsmith`（全域或專案 devDependency 安裝後）
- **Zero-config**：無 `.tagsmith.json` 時，`next` / `create` / `list` / `check` 以 semver
  預設 + pattern 推斷運作；`init` 可選

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
- `--from-commits` 的 Conventional Commit 判斷維持在 `core/conventional.ts`（純函式）；
  讀取 commit 歷史只可放在 `git/git.ts` adapter。此模式只支援 semver，且不得與
  `--level` 或 `--set-version` 混用。
