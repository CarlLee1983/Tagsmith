# Changelog

[English version](../CHANGELOG.md)

本專案遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 格式，
版本號採用 [SemVer](https://semver.org/lang/zh-TW/)。

## [Unreleased]

## [1.0.0] - 2026-07-24

指令輸出、結束代碼與設定檔皆與 `0.9.0` 相同，JSON 的 `schemaVersion` 維持 `1`。
本版定義的是「哪些介面算契約」，並讓契約可由測試檢查。

### 破壞性變更

- `engines.node` 提升為 `>=22`。Tagsmith 只承諾支援仍在 LTS 支援期的 Node；
  Node 18 與 20 皆已 EOL。
- 套件宣告 `exports`，僅開放 `schema.json`、`json-output.schema.json` 與
  `package.json`。Tagsmith 發佈的是 CLI 而非 library，`dist/` 內的模組不再可被匯入；
  `tagsmith` 執行檔不受影響。

### 新增

- 明文的穩定性契約：列出受 SemVer 保護的表面（指令、旗標、結束代碼、JSON envelope、
  診斷碼、設定檔、Action 的 inputs/outputs、支援平台）與不受保護的部分（人類可讀
  輸出、診斷的 `message` 字串、內部模組結構）。
- `src/core/diagnostics.ts` 的封閉診斷碼登記表，並以 enum 發佈於
  `json-output.schema.json`，中英文 README 同步列出。
- `json-output.schema.json` 補上每個指令的 `data` 描述，包含 `list` 在有無 `--all`
  時的兩種形狀；由 `tests/json-contract.test.ts` 以真實輸出驗證。
- `tests/exit-codes.test.ts`：每個指令各釘一個成功與一個失敗情境。
- CI workflow：在 Node 22 與 24 上執行 typecheck、build、測試與覆蓋率門檻。

### 變更

- `JsonDiagnostic.code` 與 `ReleasePlanBlocker.code` 由 `string` 收斂為登記表聯集，
  未登記的碼會直接是編譯錯誤。

### 移除

- `next --json` 中永遠不會執行的 `tag-anomaly` fallback；所有異常本來就帶有已登記的碼。

## [0.9.0] - 2026-07-24

### 新增

- `audit` 會在任何衝突 tag 出現之前，靜態證明兩條線的 pattern 是否可能接受同一個
  tag 名稱。結果以 `data.overlaps` 呈現，附上一個經雙方 pattern 驗證過的 witness tag，
  並產生 `pattern-overlap-certain` 與 `pattern-overlap-possible` 兩個診斷碼。
- `audit --strict-overlap` 可把上述兩碼由 warning 提升為 error，讓 CI 直接拒絕有歧義
  的設定。

### 變更

- `CompiledPattern` 對外提供字面量 `prefix` 與 `suffix`，pattern 語意仍由單一模組擁有。
- 重疊屬於設定層問題，因此 `list` 輸出完全不變；已經發生碰撞的 tag 仍由既有的
  `ambiguous-assignment` error 負責。

## [0.8.0] - 2026-07-23

### 新增

- 每條 tag line 可選配 `artifact: { "type": "package-json" }`。`audit` 會讀取每個
  合規歷史 tag 當時提交的 manifest；`releasePolicy.requireArtifactVersion` 可讓
  `create --enforce-policy` 要求 candidate 的 artifact version 與 tag version 一致。
- 可設定、依宣告順序比對的 `commitPolicy.rules`，支援團隊自訂 Conventional Commit
  type、scope、breaking change 與 ignore 規則；每個 recommendation 都會列出命中的規則。

### 變更

- artifact 讀取維持內部、以 Git ref 為準；Tagsmith 不會修改 package manifest、lockfile、
  tag 或已發布產物。

## [0.7.0] - 2026-07-23

### 新增

- `tagsmith plan --all`：唯讀、依設定宣告順序的 monorepo 發版計畫；每條線明確標示
  `ready`、`skipped` 或個別 `blocked`。
- workspace 範圍的已提交變更與 Conventional Commit 依據、候選 tag、穩定 blocker，及
  versioned plan JSON 的 `hasReleases`。
- GitHub Action 的完整 plan JSON、是否有可發版 line，以及指定線 next tag outputs。

### 變更

- JSON envelope 新增 `plan` command，仍維持 schema version 1 與既有 diagnostics 合約。

## [0.6.0] - 2026-07-23

### 新增

- 選配 `releasePolicy`：可限制可發版分支、乾淨 worktree、annotated tag、`HEAD` target
  與由 Git 管理的 tag 簽章。
- `audit --fetch [--remote <name>]`、PASS / WARN / FAIL release-readiness
  結果，以及 JSON envelope 內穩定的 `release-*` diagnostics。
- `create --enforce-policy`、`--target <ref>`、`--sign`，提供明確且可在本機驗證的
  發版 preflight。

### 變更

- `create` 在變更 Git state 前重用 audit 的 pure release-readiness evaluator；policy
  維持 opt-in，既有 create 流程不受影響。

## [0.5.0] - 2026-07-23

### 新增

- `tagsmith audit`：唯讀稽核完整 tag 歷史，回報版本異常、無主 tag 與 tag-line 歸屬歧義。
- `list`、`check`、`next`、`audit` 的 `--json` 共同採用可版本化的 envelope，並發布
  `json-output.schema.json` 作為合約。
- `ambiguous-assignment` 診斷與 check 結果的 `matches` 欄位；同一 tag 符合多條線時不再
  默默採用第一條。

### 變更

- `next` 與 `create` 遇到會影響指定線的歧義歷史時停止，不再以不確定的版本序列推導 tag。
- 可重用 GitHub Action 在同步 tags 後執行 `audit --json`。

## [0.4.0] - 2026-07-23

### 新增

- **遠端 release preflight**：`next --fetch` 與 `create --push` 在計算版本前同步 tags；
  可用 `--remote` 選擇其他 remote。
- `check --strict`：指定候選 tag 時比對本地歷史版本，JSON 也會標示是否啟用嚴格模式。
- **可重用 GitHub Action**：自行建置 Tagsmith、同步 tags，並在 CI 執行嚴格驗證。
- **Monorepo workspace**：tag 線可設定 `workspace`；`--require-changes` 確保套件有自己的
  已提交變更才可 release，Conventional Commit 建議也只讀取該 workspace 的歷史。
- `next --from-commits` / `create --from-commits`：僅限 SemVer，依 Conventional Commits
  建議遞增等級。
- JSON Schema 現同時支援多線與舊扁平設定，並包含 workspace-scoped line。

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

[Unreleased]: https://github.com/CarlLee1983/Tagsmith/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/CarlLee1983/Tagsmith/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/CarlLee1983/Tagsmith/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/CarlLee1983/Tagsmith/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CarlLee1983/Tagsmith/releases/tag/v0.1.0
