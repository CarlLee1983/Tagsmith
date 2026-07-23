# 設計：0.5 Tag Audit 與 JSON Contract

## 狀態與目標

- 狀態：Accepted
- 對應路線圖：[0.5 可稽核的 tag 規格與自動化合約](../../../ROADMAP.zh-TW.md)
- 目標：讓每個既有 tag 的 tag-line 歸屬可被明確稽核，並為讀取型 CLI 指令提供
  可版本化、純 JSON 的自動化 Interface。

## 問題

目前 `assignTagsToLines` 在 tag 同時符合多條 pattern 時，會以設定宣告順序選擇第一條。
這個決定沒有被 `list`、`check` 或 `next` 明確呈現，可能導致 maintainer 在錯誤的
版本序列上建立下一個 tag。

同時，各 `--json` 指令各自輸出不同的頂層形狀；呼叫端必須知道個別指令的細節，且
無法以一致方式判斷輸出是否包含資料完整性錯誤。

## 核心 Module：tag assignment

`src/core/lines.ts` 的 `assignTagsToLines(tags, lines)` 是歸屬判斷的唯一 Interface。
它回傳：

- `byLine`：只包含**恰好符合一條** line 的 tag；
- `orphans`：不符合任何 line 的 tag；
- `ambiguous`：符合兩條以上 line 的 tag 和全部候選 line 名稱。

歧義 tag 不會放進任何 `byLine` bucket，故沒有 caller 能在不知情下依宣告順序使用它。
`next` 和 `create` 若選取的 line 出現在歧義項目中，會停止並要求使用者先處理設定或
歷史；`list` 與 `audit` 則照實列出。`check` 對此回傳 `ambiguous-assignment`，並提供
`matches`，而非假稱某一條 line 是 owner。

這個 Module 隱藏 pattern 編譯與多線比對的實作細節；所有 core 與 CLI caller 透過這個
Interface 取得同一份事實，產生 Leverage 與 Locality。

## 核心 Module：audit

新增純函式 `auditTags(tags, lines)`，不讀取 Git、不輸出文字。它將 assignment、每條
line 的 `analyzeTags` 和診斷彙整到一份 `AuditReport`：

- 每條 line 的 conforming tag、latest tag 與 anomaly；
- orphan 與 ambiguous tag；
- diagnostics：`code`、`severity`、人類可讀 `message` 及相關 tag / line；
- `ok`：沒有 `error` severity 時為真。

Severity 規則：`unparseable-version`、`duplicate-version` 和
`ambiguous-assignment` 是 error；`orphan-tag` 是 warning，因為多 tag line repository
可能刻意保留不由 Tagsmith 管理的 tag。

## CLI 與 JSON Interface

`src/cli/json.ts` 是所有讀取型 JSON 輸出的唯一 Interface。成功與可預期失敗皆輸出：

```json
{
  "schemaVersion": 1,
  "command": "audit",
  "ok": false,
  "data": {},
  "diagnostics": []
}
```

- `schemaVersion` 只在不相容時遞增；
- `command` 是 `list`、`check`、`next` 或 `audit`；
- `ok` 反映 diagnostics 是否有 error，而非單純「CLI 能否完成輸出」；
- `data` 是各指令原本的領域資料；
- `diagnostics` 提供穩定 code，呼叫端不需要解析 message；
- 若指令本身無法完成，仍輸出上述 envelope，`data: null` 且診斷碼為
  `command-error`，並回傳非零 exit code。

`json-output.schema.json` 描述這個 envelope 的共同結構；個別 command 的 `data` 不在
此版過度限制，避免 schema 對快速演進的領域資料造成淺層重複。

## 指令行為

| 指令 | 0.5 行為 |
| --- | --- |
| `audit` | 唯讀掃描完整 tag 歷史；human output 顯示摘要與 diagnostics；`--json` 輸出 envelope；有 error 時 exit 1。 |
| `list` | 透過 audit 的 assignment 顯示 line、orphan 與 ambiguous tag；仍可作為檢視指令成功結束，但 JSON 的 `ok` 反映發現的 error。 |
| `check` | 歧義候選 tag 為 `ambiguous-assignment`；JSON 結果附 `matches`。 |
| `next` / `create` | 選取的 line 受歧義歷史影響時拒絕繼續，避免以不確定的歷史推導版本。 |
| GitHub Action | 從 strict check 改為 `audit --json`，使 CI 採用相同的完整 repository 稽核。 |

## 相容性與非目標

- 既有 `.tagsmith.json` 形狀與內建版本模型不變。
- JSON 頂層資料移入 `data` 是 0.5 明確的自動化介面升版；README 提供 migration
  example。
- 不修正既有 tag、不自動選擇一條歧義 line、不對所有可能 pattern 做靜態交集證明。
- 不新增 remote policy、release policy 或 artifact version 檢查；它們屬於後續版本。

## 驗證

- core tests：assignment 的 orphan/unique/ambiguous 情境及 audit 的 severity、summary；
- command tests：human 與 JSON audit、JSON error envelope、list/check/next 的歧義處理；
- built CLI test：`audit --json` 真的可執行；
- action/schema tests：Action 使用 audit，輸出 schema 存在且描述版本化 envelope；
- `npm test`、`npm run typecheck`、`npm run build` 全數通過。
