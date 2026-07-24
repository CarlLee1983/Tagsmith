# 設計：1.0 穩定介面契約

## 狀態與目標

- 狀態：Draft
- 對應路線圖：[1.0 穩定介面契約](../../../ROADMAP.zh-TW.md)
- 目標：把 0.5–0.9 累積下來、事實上已被自動化依賴的介面，明確定義為受 SemVer
  保護的公開表面，並讓「有沒有違約」由測試判定，而不是靠人記得。

本階段**不新增任何產品功能**。1.0 的交付物是承諾本身，以及讓承諾可被機器檢查
的機制。

## 問題

路線圖長期原則 4 寫著「自動化介面是產品介面」，但目前這件事只做了一半：

- **診斷碼沒有登記表。** `JsonDiagnostic.code` 與 `ReleasePlanBlocker.code` 的型別
  都是 `string`。實際會出現的碼有 19 個，散落在 5 個 CLI 模組、`TagAnomaly` 聯集與
  release-plan blockers 之間。沒有任何地方能回答「Tagsmith 會吐出哪些碼」，新增一個
  碼也不會有任何測試察覺。`json-output.schema.json` 對 `code` 只寫 `type: string`。
- **`data` 完全沒有 schema。** envelope 外層（`schemaVersion` / `command` / `ok` /
  `diagnostics`）有 schema 與測試，但 `data` 的說明是「Command-specific result
  data」——也就是呼叫端真正要讀的那一層，是唯一沒被規範的一層。GitHub Action 內嵌的
  Node 腳本已經在讀 `plan.data.defaultLine`、`plan.data.lines[].candidate.tag`、
  `plan.data.hasReleases`，這些欄位今天沒有任何契約測試保護。
- **exit code 只存在於實作裡。** 每個 `run*` 回傳 0 或 1，語意分散在各檔案，沒有
  文件、沒有集中定義，也沒有針對「哪些情境必須非零」的專門測試。
- **套件表面沒有邊界。** `package.json` 沒有 `exports`，因此
  `@carllee1983/tagsmith/dist/core/plan.js` 這種深層匯入在技術上是可行的。任何人
  這樣做之後，內部重構就會變成別人的 breaking change。
- **CI 不跑測試。** `.github/workflows/` 只有 Docsentry 與 Pages。`npm test`、
  `npm run typecheck`、`npm run build`、覆蓋率門檻全部只在本機執行。一個宣稱介面
  穩定的版本，卻沒有任何自動化在 PR 上證明它沒壞。
- **`engines` 承諾一個 EOL runtime。** `>=18`，而 Node 18 已於 2025-04 EOL、
  Node 20 於 2026-04 EOL。

以上每一項單獨看都不急，但它們共同構成同一個缺口：**Tagsmith 已經被當成契約在用，
卻還沒有把契約寫下來。** 1.0 是修正這件事的正確時機，因為其中兩項修正
（`engines` 下限、`exports` 邊界）在語意上就是 breaking change，只能在 major 做。

## 公開表面的定義

1.0 起，下列項目受 SemVer 保護。破壞它們需要 major 版本：

| 表面 | 內容 |
| --- | --- |
| CLI 命令與旗標 | 既有命令名、別名（`ls`）、旗標名與其語意 |
| exit code | 每個命令的 0 / 非 0 判定條件 |
| JSON envelope | `schemaVersion` / `command` / `ok` / `data` / `diagnostics` 的形狀 |
| 診斷碼 | 登記表中每個碼的字面值與觸發條件 |
| 設定檔 | `.tagsmith.json` 的既有欄位語意與 `schema.json` |
| GitHub Action | `action.yml` 的 inputs 與 outputs 名稱與語意 |
| 支援平台 | `engines.node` 宣告的範圍 |

下列項目**不受**保護，明文寫進文件避免誤解：

- **人類可讀輸出的文字內容。** 訊息措辭、顏色、排版隨時可調整。需要穩定結果的
  呼叫端必須用 `--json`；這正是 envelope 存在的理由。
- **診斷訊息的 `message` 字串。** 只有 `code` 是契約。
- **`dist/` 的內部模組結構。** 見下方 `exports` 決議。
- **`plan --json` 之外的實驗性輸出**：目前沒有這類輸出；此列保留為未來新增
  實驗性欄位時的宣告位置。

新增欄位、新增診斷碼、新增旗標一律視為 minor：呼叫端讀取未知欄位不會壞，
遇到未知 `code` 時應以 `severity` 決策——這是 envelope 自始的設計意圖，1.0 把它
寫成明文要求。

## 決議一：診斷碼登記表

新增 `src/core/diagnostics.ts`（純模組，不 import CLI、不做 IO），作為所有碼的
單一事實來源：

登記表分五組共 23 碼，來源分別是 `TagAnomaly`、設定層級檢查、`ArtifactDiagnosticCode`、
`ReleaseReadinessDiagnostic["code"]` 與 `command-error`：

```ts
export const TAG_ANOMALY_CODES = [
  "pattern-mismatch", "unparseable-version",
  "duplicate-version", "ambiguous-assignment",
] as const;

export const CONFIG_DIAGNOSTIC_CODES = [
  "orphan-tag", "pattern-overlap-certain", "pattern-overlap-possible",
  "workspace-required", "from-commits-unsupported",
] as const;

export const ARTIFACT_DIAGNOSTIC_CODES = [ /* artifact-* 共 5 碼 */ ] as const;
export const RELEASE_DIAGNOSTIC_CODES = [ /* release-*-* 共 8 碼 */ ] as const;
export const COMMAND_DIAGNOSTIC_CODES = ["command-error"] as const;

export const DIAGNOSTIC_CODES = [...] as const;   // 五組攤平
export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];
```

放在 `core/` 而非 `cli/` 的理由：`ReleasePlanBlocker.code` 與 `TagAnomaly` 都在
core 產生，若登記表放 CLI，core 就得反向依賴 CLI 或繼續用 `string`。

**注意 `releasePolicy` 有兩組長得很像的碼**，不可混淆：`ReleaseReadinessCheck.code`
（`release-branch`、`release-worktree` 等 7 個）出現在 `data.releaseReadiness.checks`，
屬於 `data` 契約；診斷碼則是帶失敗原因的長版（`release-branch-not-allowed`、
`release-worktree-dirty` 等 8 個）。登記表只收後者。

型別收斂：`JsonDiagnostic.code` 與 `ReleasePlanBlocker.code` 由 `string` 改為
`DiagnosticCode`。各模組保留自己的窄聯集（`AuditDiagnosticCode`、
`ArtifactDiagnosticCode`、`ReleaseReadinessDiagnosticCode`）以維持可讀性，但改以
`AssertRegistered<...>` 包裹，讓「未登記的碼」在編譯期就是型別錯誤。`TagAnomaly`
留在 `types.ts` 不動，由 `RegisteredTagAnomaly` 斷言其為子集。依賴方向維持
`diagnostics.ts` 為 leaf：它只以 type-only import 反向參照 `types.ts`，不產生循環。

順帶清掉一個死路徑：`next.ts` 的 `tag.anomaly ?? "tag-anomaly"` 中，`anomalies`
依定義每個元素都有非 null 的 `anomaly`，fallback 永遠不會執行。收斂型別後它會直接
變成型別錯誤，正好移除，而不是把一個從未出現的碼登記進契約。

## 決議二：per-command 的 `data` schema

`json-output.schema.json` 擴充為以 `command` 分派的 `allOf` / `if`-`then` 結構，
為五個命令各自描述 `data` 的必要欄位與型別。

三個刻意的取捨：

1. **`data` 層允許額外屬性。** 新增欄位在本專案是 minor，schema 若用
   `additionalProperties: false` 會讓合法的 minor 變更看起來像違約。envelope 外層
   維持 `false`（那是真正凍結的五個鍵）。
2. **只規範呼叫端會讀的深度。** 例如 `plan` 必須描述到
   `data.lines[].status` 與 `data.lines[].candidate.tag`，因為 `action.yml` 讀到
   那一層；但 `data.lines[].commits[]` 只描述元素形狀，不逐欄凍結。規範深度以
   「已有呼叫端依賴」為界，而不是能寫多細就寫多細。
3. **`list` 的 `data` 是兩種形狀的聯集。** `--all` 輸出
   `{ config, lines, orphans, ambiguous }`，單線輸出
   `{ config, line, conforming, anomalies, latest, ambiguous, orphans? }`。schema 以
   `oneOf` 表達，並在文件寫明這是旗標決定的分支，不是可省略欄位。

`code` 的 `type: string` 改為登記表的 `enum`。這是收緊而非變更：它描述的一直都是
現況，只是先前沒寫出來。

驗證方式：加入 `ajv` 作為 **devDependency**（不進 runtime 依賴），新增
`tests/json-contract.test.ts`，對每個命令的真實輸出（含成功、失敗、`--all`、
單線、無設定等分支）跑 schema 驗證。同時反向斷言：`json-output.schema.json` 的
`code` enum 與 `DIAGNOSTIC_CODES` 逐字相等，任一邊漏改即測試失敗。

## 決議三：exit code 契約

**不新增 exit code。** 現況是 `0 = 成功 / 1 = 失敗`；若 1.0 改成
`2 = 設定錯誤`、`3 = policy 失敗` 之類的細分，所有寫 `if [ $? -eq 1 ]` 的既有腳本
都會靜默失效——那是在一個以「不要靜默失效」為賣點的工具上引入靜默失效。分類資訊
已經由 `--json` 的 `code` 提供，不需要在 exit code 再表達一次。

1.0 做的是把現況變成契約：

| 命令 | exit 0 | exit 1 |
| --- | --- | --- |
| `list` | 一律（讀取成功時） | 無法讀取設定或 Git |
| `check` | 所有受檢 tag 皆通過 | 任一 tag 不通過 |
| `next` | 成功算出候選 | 無法算出（歧義、無 workspace、模式不支援…） |
| `audit` | 無 error 診斷 | 有 error 診斷（含 `--strict-overlap` 提升者） |
| `plan --all` | 沒有阻擋 | 任一線被阻擋 |
| `create` | 建立（或 `--dry-run` 預覽）成功 | 驗證失敗或 Git 失敗 |
| `merge-check` | 政策通過、或被 `HUSKY=0` / `TAGSMITH_SKIP=1` 略過 | 政策拒絕 |
| `hooks install` / `uninstall` | 完成 | 前置檢查失敗 |
| 未知命令 | — | 1 |

新增 `tests/exit-codes.test.ts`，對表中每一列各釘一個成功與一個失敗情境。既有測試
已零散覆蓋部分情境，但沒有一處以「這是契約」的角度窮舉；集中一個檔案讓未來改動時
違約立刻可見。

## 決議四：套件表面

`package.json` 加入 `exports`：

```json
"exports": {
  "./package.json": "./package.json",
  "./schema.json": "./schema.json",
  "./json-output.schema.json": "./json-output.schema.json"
}
```

語意：**Tagsmith 是 CLI，不是 library。** 沒有 `.` 進入點，`dist/` 的任何模組都不可
被外部匯入；兩個 schema 檔案明確開放，讓下游工具能以
`require("@carllee1983/tagsmith/schema.json")` 取得設定與輸出的 schema，而不必猜路徑。

`bin` 不受 `exports` 影響，CLI 照常運作；`src/cli/index.ts` 內以相對路徑
`createRequire` 讀 `package.json` 取版本號也不受影響（`exports` 只約束外部解析
`@carllee1983/tagsmith/*`，不約束套件內的相對路徑）。

這是 1.0 的第二個 breaking change，但實務影響接近零：套件從未文件化過任何 JS API。

## 決議五：支援平台與 CI

- `engines.node` 由 `>=18` 改為 `>=22`：只承諾仍在 LTS 支援期的 Node。`action.yml`
  已經在用 Node 22，此改動讓宣告與實際驗證環境一致。這是 1.0 的第一個 breaking
  change。
- **同步點**：`.docsentry.json` 有一條 assertion 綁定 README 的 Node 版本字串與
  `/engines/node`；README 與 `docs/README.zh-TW.md` 兩版都要改，否則文件治理 CI 會擋。
- 新增 `.github/workflows/ci.yml`：在 `pull_request` 與 `push: main` 上，以
  Node 22 與 24 的 matrix 跑 `npm ci` → `npm run typecheck` → `npm run build` →
  `npm run coverage`（覆蓋率門檻 80% 已設定在 vitest config，失敗即失敗）。
  `build` 排在測試前，因為既有的 built-CLI E2E 測試需要 `dist/`。

## 相容性與非目標

- **輸出不變。** 除了型別收斂與死路徑移除，沒有任何命令的 stdout / stderr /
  exit code 行為改變。`schemaVersion` 維持 `1`：schema 檔案變精確，但它描述的輸出
  與 0.9 完全相同。
- **設定檔不變。** `.tagsmith.json` 形狀與 `schema.json` 不動。
- **1.0 的 breaking change 只有兩項**，且都不影響輸出：`engines.node >=22`、
  `exports` 邊界。兩者都會在 CHANGELOG 的 Breaking 區塊逐條列出。
- **不做**：新增命令、新增旗標、新增診斷碼、細分 exit code、開放 JS API、
  自動產生 schema（手寫 + 雙向測試比 codegen 更容易審閱，且不引入 build step）。
- **不做**：`schemaVersion 2`。沒有任何不相容變更，升版號會誤導呼叫端以為要遷移。

## 驗證

| 層級 | 驗證 |
| --- | --- |
| 型別 | `DiagnosticCode` 收斂後 `npm run typecheck` 通過；`TagAnomaly ⊆ DiagnosticCode` 由型別層斷言 |
| 契約 | `tests/json-contract.test.ts`：五命令、成功與失敗分支的真實輸出皆通過 ajv 驗證 |
| 契約 | schema 的 `code` enum 與 `DIAGNOSTIC_CODES` 逐字相等 |
| 契約 | 程式碼中出現的每個 `code` 字面值都在登記表內（型別保證，非 grep） |
| exit code | `tests/exit-codes.test.ts` 逐列釘住成功與失敗 |
| 套件 | 測試斷言 `exports` 不暴露 `dist/`，且兩個 schema 檔可解析 |
| 回歸 | `npm test`、`npm run typecheck`、`npm run build`、`npm run coverage`（80%）全過 |
| 文件 | README 與 `docs/README.zh-TW.md` 新增「穩定性契約」章節（含診斷碼表與 exit code 表）；CHANGELOG 中英雙版；Docsentry 通過 |
| CI | 新 workflow 在 PR 上實際跑綠 |
