# Tagsmith 路線圖

> 狀態：Active
>
> 建立日期：2026-07-23
> 維護方式：後續功能開發、設計與實作計畫均以本文件的順序與產品邊界為準；完成的版本應保留在 Changelog 與 `docs/history/`。

## 產品方向

Tagsmith 的核心是讓 repository maintainer 對 git tag 規則與下一個 tag
做出**安全、可預測、可由自動化取用的本地決策**。

下一階段把能力由「產生安全的單一 tag」深化為「判斷目前是否具備發版條件」。
它不會變成 release automation platform：不替團隊發布套件、建立 GitHub
Release、推送多個 tag，或修正既有 tag 歷史。

## 長期原則

1. **先檢查，再變更。** `audit`、`plan`、`next` 皆為唯讀；`create` 與 push
   仍須明確呼叫。
2. **規則可被團隊提交與檢視。** 發版條件應在 `.tagsmith.json` 中明示，並由
   schema、CLI 與 GitHub Action 使用同一套判斷。
3. **保持本地決策的定位。** 遠端資料可以被 fetch 後納入檢查，但 Tagsmith 不
   取代分支保護、PR 流程或發布系統。
4. **自動化介面是產品介面。** `--json` 的結構、exit code 與診斷碼須可版本化、
   可測試，不能只視為 CLI 的附帶輸出。
5. **不以泛用外掛機制預支需求。** 只有在出現至少兩種已驗證的外部版本模型或
   artifact source 需求時，才設計公開 extension seam。
6. **維持相容。** 既有單線設定、三種內建版本模型與既有 create 流程不得因新
   功能而失效；新護欄預設為 opt-in。

## 路線總覽

| 順序 | 版本目標 | 主題 | 對使用者的結果 |
| --- | --- | --- | --- |
| 1 | `0.5` | 可稽核的 tag 規格與自動化合約 | 已完成（待發布）：可可靠地發現設定歧義，並將結果交給 CI 或腳本。 |
| 2 | `0.6` | Release Readiness | 團隊可宣告、稽核並選擇性強制執行「現在可否發版」。 |
| 3 | `0.7` | Monorepo release planning | 多 workspace 可先得到完整發版計畫，再由既有流程逐一建立 tag。 |
| 4 | `0.8` | Artifact 與 commit-policy 一致性 | tag、發行產物版本與 commit 規則可在建立前交叉驗證。 |
| 未排程 | 擴充機制與進階信任 | 只在真實使用需求成立後處理。 |

版本號代表開發順序，不代表承諾的發布日期；每階段開始前仍應以實際 issue 或設計
文件確認範圍。

## 0.5 — 可稽核的 tag 規格與自動化合約

> 實作狀態：完成，待發行 `0.5.0`。設計與實作紀錄見
> [`2026-07-23-audit-json-contract-design.md`](docs/history/designs/2026-07-23-audit-json-contract-design.md)
> 與 [`2026-07-23-audit-json-contract.md`](docs/history/plans/2026-07-23-audit-json-contract.md)。

### 目標

消除多 tag line 設定中會「靜默依宣告順序取第一條」的歧義，並將 JSON 輸出提升為
可穩定串接的 Interface。

### 功能範圍

- 新增唯讀的 `tagsmith audit`，至少報告：
  - 不符合 pattern、不可解析版本、重複版本與 orphan tag；
  - 一個既有 tag 同時符合多條 tag line 的 `ambiguous-assignment`；
  - 每條線的 latest tag、設定來源與可讀的嚴重度摘要。
- 讓 `list --all`、`check` 與後續 `audit` 都以同一個 tag assignment 判斷，避免
  CLI 顯示與實際發版決策不一致。
- 定義 versioned JSON envelope，例如 `schemaVersion`、`command`、`ok`、
  `data`、`diagnostics`；為既有 JSON 呼叫端提供清楚的 migration note，且將格式
  當成測試契約。
- `audit --json` 成為 GitHub Action 與外部自動化的基本輸入，而不是要求解析人類
  可讀文字。

### 完成條件

- 對任何已存在的重疊 tag 都會明確報錯或警告，絕不只因設定順序而悄悄歸屬。
- 所有 JSON 路徑都有固定 schema version、成功/失敗狀態與機器可判斷的診斷碼。
- 單線設定與目前的 `list`、`check`、`next`、`create` 工作流保持可用。
- 核心判斷由 pure module 提供；CLI、Action 與測試共用同一個 Interface。

### 不納入

- 自動修正或重新命名歷史 tag。
- 對理論上所有可能字串做 pattern 重疊證明；先針對 repository 中可觀察到的 tag
  提供準確診斷，必要時再擴充靜態分析。

## 0.6 — Release Readiness

### 目標

讓 maintainer 能把「可建立 tag」以外的發版前置條件寫成可審核的本地規則。

### 功能範圍

- 在設定加入可選 `releasePolicy`，初始考慮：
  - 可發版分支（例如 `main`、`release/*`）；
  - worktree 是否必須乾淨；
  - tag 是否必須是 annotated tag；
  - tag 是否必須指向 `HEAD`；
  - 簽章為 `optional` 或 `required` 的政策設計與可驗證性。
- 擴充 `tagsmith audit`，以 `pass` / `warn` / `fail` 顯示規格、Git 狀態與 remote
  狀態；遠端檢查必須以明確 `--fetch` / `--remote` 觸發。
- `tagsmith create --enforce-policy` 在建立前重用同一份 audit 結果；沒有此旗標時
  既有 create 行為不改變。
- 文件清楚區分：Tagsmith 只能作本地 guardrail，遠端競態與 server-side branch
  protection 仍由團隊平台處理。

### 完成條件

- policy 未設定時，所有現有設定與指令行為不變。
- 每項失敗都回傳穩定的診斷碼、修正建議及非零 exit code。
- create 不複製 policy 邏輯；它只透過 audit 的 Interface 取得決策，確保 Locality。
- dirty worktree、錯誤分支、非預期 tag target 等情境有 Git integration tests。

### 不納入

- 自動推送、GitHub Release、套件發布或 remote branch protection 設定。
- 以設定檔存放 GPG 金鑰或任何祕密。

## 0.7 — Monorepo release planning

### 目標

將現有的 workspace tag line 與 `--require-changes`、`--from-commits` 串成一次
可檢視的多線發版計畫，但保留每個 tag 建立動作的明確性。

### 功能範圍

- 新增 `tagsmith plan --all`：對每一條 tag line 輸出是否有變更、建議 bump、候選
  tag、阻擋原因與依據 commits。
- 支援 workspace 篩選、`--from-commits`、`--require-changes` 與 JSON 輸出；沒有
  發版必要的線要可被清楚區分為 `skipped`，而非錯誤。
- GitHub Action 可輸出 plan 的 JSON、是否有應發版的 line，以及單線的 next tag，讓
  現有 workflow 做後續決定。
- 若需描述跨 workspace 相依，先採明確的設定宣告與唯讀影響分析；不從 package
  manager 行為猜測複雜的發布順序。

### 完成條件

- 計畫與逐一執行 `tagsmith next --tag <name>` 的結果一致。
- 未變更的 workspace 不會被建議發版，也不會因而使整份計畫失敗。
- `plan` 不建立、推送或修改任何 tag。
- 多條線的輸出順序、狀態與原因在 JSON 中穩定且可測試。

### 不納入

- 一個指令自動建立或推送多個 tag。
- 取代 Changesets、semantic-release、npm publish 或其他發布編排工具。

## 0.8 — Artifact 與 commit-policy 一致性

### 目標

避免「Git tag、套件/產物版本、變更類型」彼此不同步，並讓團隊能採用自身的
Conventional Commit 約定。

### 功能範圍

- 為 tag line 加入可選 artifact version 檢查；第一個具體支援對象為 workspace
  `package.json` 的 `version`。
- 在 audit 與可選 create policy 中驗證 tag 版本與 artifact 版本的一致性。
- 將目前硬編碼的 Conventional Commit 分類提升為可設定 release rules，例如 type、
  scope、breaking change 與 ignore 規則。
- 推薦結果維持可解釋：每個建議 bump 都列出關聯 commit 與命中的規則。

### 完成條件

- `package.json` 不存在、格式錯誤、版本不一致與一致的情境都有明確結果。
- 規則未設定時維持目前 `feat` / `fix` / `perf` / breaking change 的預設語意。
- artifact 讀取實作留在內部；在有第二個已驗證的 artifact source 前，不建立公開
  plugin Interface。

### 不納入

- 自動修改 `package.json`、lockfile 或 changelog。
- 支援任意 shell command 作為 version source。

## 未排程候選項目

| 候選 | 採用門檻 |
| --- | --- |
| 外部 VersionModel / artifact source plugins | 至少兩個真實、無法以內建設定涵蓋的需求，且能定義安全的驗證與載入模型。 |
| 簽名與 provenance 的進階驗證 | 已確認目標 Git/GPG 或 Sigstore 工作流，並能在本地與 CI 做可重現驗證。 |
| 靜態 pattern 重疊證明 | 實際 repository tag 掃描不足以滿足使用者需求時。 |
| 發版平台整合 | 僅提供乾淨的 JSON / Action outputs；不取得發布流程主導權。 |

## 每個階段的共同交付要求

- 先產出設計文件，再分解成可獨立驗證的實作計畫。
- 核心規則保持 pure，Git 操作放在 adapter，CLI 僅負責輸入輸出與流程編排。
- 新增或調整 `.tagsmith.json` 時，同步更新 Zod validation、`schema.json`、文件與
  legacy 設定的相容性測試。
- CLI 人類輸出、`--json`、exit code、GitHub Action 與中英文文件要一起驗證。
- 對會建立、推送或改變 Git 狀態的行為，需提供 dry-run 或先行稽核路徑。
