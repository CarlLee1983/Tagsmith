# 設計：0.9 靜態 Pattern 重疊證明

## 狀態與目標

- 狀態：Draft
- 對應路線圖：[0.9 靜態 pattern 重疊證明](../../../ROADMAP.zh-TW.md)
- 目標：在任何衝突 tag 出現之前，就以精確、可自我驗證的判定告訴 maintainer
  「這兩條 tag line 的 pattern 會不會撞在一起」，並附上一個真實可重現的例子。

## 問題

`assignTagsToLines` 只能對**已存在的 tag** 判斷歧義。設定裡兩條 pattern 是否可能
接受同一個字串，目前完全不檢查：`parseConfig` 只驗證每個 pattern 含且僅含一個
`{version}`。

代價落在最糟的時間點。以 `v{version}` 與 `v{version}-rc` 為例，設定當下沒有任何
警告；直到某天建立 `v1.2.0-rc`，該 tag 同時符合兩條線，於是被歸入 `ambiguous`、
不屬於任何 `byLine` bucket，`assertUnambiguousLineHistory` 會在 `next` / `create`
時擋下發版。也就是說：**設定錯誤在寫設定時沉默，在發版時爆炸**，而且此時歷史已經
存在、Tagsmith 又不會自動改寫歷史，使用者只剩「改設定」或「手動刪 tag」兩條路。

路線圖把本項目的採用門檻訂為「實際 repository tag 掃描不足以滿足使用者需求時」。
上述情境正是門檻成立的形式：掃描永遠慢一步。加上下節的判定是**封閉、精確、
多項式時間**的演算法，而非近似啟發式，不會帶來難以解釋的誤報，因此值得排入。

## 判定演算法

### Pattern 的語言

`compilePattern` 把 `template` 切成 `prefix`、`suffix`，並以
`^prefix(.+)suffix$` 比對。因此一條線在 assignment 眼中接受的字串集合是：

```
L(line) = { s : s 以 prefix 開頭、以 suffix 結尾、|s| ≥ |prefix| + |suffix| + 1 }
```

注意這是 **pattern-only** 語意：`matchingLines` 只看 `extract(raw) !== null`，
不要求抽出的版本能被 model 解析。本設計刻意沿用同一個語意，否則 audit 的重疊
判定會和實際 assignment 行為分歧。

### 交集判定

設兩條線為 `(p₁, s₁)`、`(p₂, s₂)`。則 `L₁ ∩ L₂ ≠ ∅` 的充要條件是：

1. `p₁` 與 `p₂` 前綴相容（較短者是較長者的 prefix），且
2. `s₁` 與 `s₂` 後綴相容（較短者是較長者的 suffix）。

**必要性**：任何 `s ∈ L₁ ∩ L₂` 同時以 `p₁`、`p₂` 開頭，兩者必在較短長度內逐字
相同，故前綴相容；後綴同理。

**充分性**：令 `P` 為較長的 prefix、`S` 為較長的 suffix，取 `s = P + "0" + S`。
`s` 以 `P`（因而以 `p₁`、`p₂`）開頭、以 `S`（因而以 `s₁`、`s₂`）結尾，且
`|s| = |P| + 1 + |S| ≥ |pᵢ| + 1 + |sᵢ|`，故 `s ∈ L₁ ∩ L₂`。

判定與建構皆為 O(pattern 長度)，不需要 DFA、不需要正則交集引擎，也**沒有
undecidable 分支**：每一對線都會得到明確的 `disjoint` 或 `overlapping`。

### 由建構得到 witness

充分性的建構直接產出反例。這是本設計的核心取捨：**重疊判定一律附帶 witness，
並在回傳前用兩條線的 `compilePattern.extract` 實際驗證該 witness 都非 null**。
證明因此不依賴推理正確，而依賴一個可貼到終端機重現的字串；`overlapping` 而無法
產出通過驗證的 witness，視為實作錯誤而非可接受狀態。

## 核心 Module：pattern 分解

`prefix` / `suffix` 目前封在 `compilePattern` 的 closure 內。重疊分析需要它們，
但**不得**自己重新切一次 template —— 那會複製 pattern 語意，日後 pattern 語法
擴充時兩處必然分歧。

因此 `CompiledPattern` 增加兩個 readonly 欄位：

```ts
export interface CompiledPattern {
  readonly template: string;
  readonly prefix: string;
  readonly suffix: string;
  extract(tag: string): string | null;
  render(version: string): string;
}
```

這是純增補，既有 caller 不受影響，`pattern.ts` 仍是 pattern 語意的唯一 owner。

## 核心 Module：pattern-overlap

新增純函式 module `src/core/pattern-overlap.ts`，不讀 Git、不碰時鐘、不輸出文字：

```ts
export type OverlapVerdict = "disjoint" | "overlapping";

export interface OverlapPair {
  a: string;                    // 線名，設定宣告順序在前者
  b: string;
  verdict: OverlapVerdict;
  /** overlapping 時必定存在，且已通過雙方 extract 驗證。 */
  witness?: string;
  /** witness 的來源，決定嚴重度。 */
  witnessSource?: "line-version" | "constructed";
  /** witnessSource 為 line-version 時，產生它的線與版本。 */
  witnessOrigin?: { line: string; version: string };
}

export interface PatternOverlapReport {
  pairs: OverlapPair[];
}

export function analyzePatternOverlap(
  lines: readonly TagLine[],
): PatternOverlapReport;
```

對所有 `i < j` 的線組合求值，輸出順序固定為設定宣告順序，讓 JSON 與快照測試穩定。
線數為個位數量級，O(n²) 不需要最佳化。

### witness 的選擇順序

先找**真實可產生**的 witness，找不到才退回建構式 witness：

1. 對每條線 `X`，計算 `tag = X.render(X.initialVersion)`；若另一條線 `Y` 的
   `extract(tag) !== null`，即得 `witnessSource: "line-version"`，
   `witnessOrigin: { line: X, version: X.initialVersion }`。
2. 都沒有時，用上節建構式產生 `P + "0" + S`，`witnessSource: "constructed"`。

樣本只取 `initialVersion`，這是實作階段收斂的結果，兩個原本看似可用的來源都不成立：

- **歷史 tag 版本無用**。一條線的 conforming tag 依定義就是「沒有被其他線命中」
  的 tag，而 `extract` 取的是最長中段，`render(extract(t)) === t`；把它再 render
  一次只會得到同一個已知不碰撞的 tag。從 audit 傳入 `knownVersions` 永遠不可能
  把 `constructed` 升級為 `line-version`，因此該參數被移除，不留無效 seam。
- **`bump` 結果不取**。CalVer 的 bump 需要注入「今天」，讓分析依賴時鐘會破壞
  core 的可重現性。

代價僅止於**嚴重度**可能偏保守（某些組合報 `constructed` 而非 `line-version`），
不是漏報 —— 交集判定本身完整，該對線一定會被報出來。

## 嚴重度與 diagnostics

`AuditDiagnosticCode` 新增兩碼，語意由 `witnessSource` 直接決定：

| code | 條件 | severity |
| --- | --- | --- |
| `pattern-overlap-certain` | `witnessSource: "line-version"` —— 有一條線實際會產生的 tag 落進另一條線 | `warning` |
| `pattern-overlap-possible` | `witnessSource: "constructed"` —— 語言相交，但目前找不到任一線會產生的碰撞字串 | `warning` |

兩者都是 `warning` 而非 `error`。理由是相容性：既有團隊可能長期以
`v{version}` + `v{version}-rc` 運作，若升級後 `audit` 直接 exit 1，會讓現存 CI
在沒有任何 tag 真的出問題時中斷。真正已經發生的碰撞，仍由既有的
`ambiguous-assignment`（error）負責 —— 靜態分析補的是「還沒發生」那一段。

`AuditDiagnostic` 的既有欄位剛好夠用，不需要改 envelope：`tag` 放 witness、
`lines` 放這對線名、`message` 說明是實際可產生或僅理論可構造。呼叫端只靠 code 與
`lines` 就能判斷，不必解析文字。

想把重疊當成硬性錯誤的團隊，用 `audit --strict-overlap` 將這兩碼提升為 error。
旗標只改 severity 對映，不改判定，維持 core 與 CLI 的單一事實來源。

## CLI 與 JSON Interface

- `AuditReport` 增加 `overlaps: OverlapPair[]`；`schemaVersion` 維持 `1`（純增補
  欄位，不移除也不改變既有欄位語意）。
- `audit` 人類輸出沿用既有 diagnostics 區塊，不另開區段；診斷訊息本身已含 witness
  與其來源，另印一次只會讓同一事實出現兩遍。
- **不做 `init` 整合**。`init`（互動與 `--yes` 兩條路徑）只會寫出單線設定，單線永遠
  沒有線組合，該警告在任何輸入下都無法觸發。多線設定一律由使用者手動編輯
  `.tagsmith.json` 產生，因此 `audit` 是唯一有意義的接觸點。
- `list` 明確過濾掉重疊診斷：重疊是設定層缺陷，與 tag 歷史無關，且 `list` 的既有
  JSON 呼叫端不應因升級而看到新診斷。`check` / `next` / `create` / `plan` 不受影響。
- GitHub Action 沿用 `audit --json`，新欄位對既有 workflow 是可忽略的增補。

## 指令行為

| 指令 | 0.9 行為 |
| --- | --- |
| `audit` | 額外輸出 `overlaps` 與兩個新診斷碼；預設 warning，exit code 不變。 |
| `audit --strict-overlap` | 將重疊診斷提升為 error，`ok: false` 且 exit 1。 |
| `list` | 過濾重疊診斷，人類與 JSON 輸出皆與升級前相同。 |
| 其他指令 | 無行為變更。 |

## 相容性與非目標

- 不改 `.tagsmith.json` 形狀，`schema.json` 不動；`parseConfig` **不**拒絕重疊
  pattern —— 設定驗證的職責是形狀，不是策略。
- 單線設定沒有任何線組合，`overlaps` 為空陣列、無新診斷，輸出等同今日。
- 不自動修改 pattern、不建議重新命名歷史 tag、不刪除任何 tag。
- 不做 model 層級的版本語言交集（例如「semver 與 build 是否可能產生同一字串」）。
  assignment 是 pattern-only 的，加上 model 判定會讓 audit 與實際歸屬不一致。
- 不新增 `releasePolicy.requireDisjointPatterns`。等到有團隊實際要求「重疊即不得
  發版」再設計；本版先讓事實可見。
- 不支援 `{version}` 以外的 placeholder 語法；若未來擴充 pattern 語法，交集判定
  需連同 `pattern.ts` 一起重新設計，屆時本文的充要條件不再成立。

## 驗證

core 測試（`tests/core/pattern-overlap.test.ts`）至少涵蓋：

| 案例 | 期望 |
| --- | --- |
| `v{version}` vs `release/{version}` | `disjoint`（前綴不相容） |
| `app/v{version}` vs `web/v{version}` | `disjoint` |
| `v{version}` vs `v{version}-rc` | `overlapping` / `line-version`，witness 來自 rc 線 |
| `{version}` vs `v{version}` | `overlapping` / `line-version`，bare pattern 吞掉一切 |
| 兩條完全相同的 pattern | `overlapping` / `line-version` |
| `v{version}` vs `{version}v` | `overlapping` / `constructed`，witness `v0v` |
| `{version}-rc` vs `rc-{version}` | `overlapping` / `constructed`，witness `rc-0-rc` |
| `v{version}-rc` vs `v{version}-stable` | `disjoint`（後綴不相容） |
| CalVer 線 vs SemVer 線 | 版本模型不影響判定，僅 pattern 形狀決定 |
| 單線 / 空設定 | `pairs` 為空；三條線輸出恰好三對且順序固定 |

不變式測試：對上述所有 `overlapping` 結果，斷言 `witness` 存在且雙方
`compilePattern(...).extract(witness) !== null`。

`disjoint` 以窮舉短字串交叉驗證，但只施加於**字面量夠短**的組合。任何候選字串至少
要有 `|prefix| + |suffix| + 1` 個字元才可能被某條 pattern 命中，因此對
`release/{version}` 這類長前綴組合，可行長度內的窮舉是空轉而非證據。測試因此加上
兩道防呆：搜尋長度上限必須不小於雙方的最短可命中長度，且搜尋過程中必須真的出現
「至少命中其中一條」的字串，否則測試自己失敗。長前綴的 disjoint 組合只保留判定
斷言。

其他層級：

- audit 測試：新診斷碼、severity、`--strict-overlap` 的 exit code、單線設定無新輸出；
- command 測試：`audit --json` 的 `overlaps` 形狀與排序穩定；`init` 的重疊警告；
- built CLI 測試：`audit --json` 實際可執行且欄位存在；
- 文件：README、`docs/README.zh-TW.md`、CHANGELOG 中英雙版同步；
- `npm test`、`npm run typecheck`、`npm run build`、`npm run coverage`（門檻 80%）全過。
