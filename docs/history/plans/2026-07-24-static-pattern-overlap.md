# 0.9 靜態 Pattern 重疊證明實作計畫

設計依據：[0.9 設計文件](../designs/2026-07-24-static-pattern-overlap-design.md)。

1. **Pattern 分解**：為 `CompiledPattern` 增補 readonly `prefix` / `suffix`，讓
   `pattern.ts` 維持 pattern 語意的唯一 owner；補測試確認既有 `extract` / `render`
   行為與所有現有 caller 不受影響。
2. **Pure 判定**：新增 `src/core/pattern-overlap.ts`，以前綴 / 後綴相容性回傳每一對
   線的 `disjoint` / `overlapping`，並依「線由 `initialVersion` 實際產生的 tag →
   建構式」順序產生 witness。所有 `overlapping` 結果在回傳前以雙方 `extract`
   自我驗證；測試涵蓋設計文件的案例表與 `disjoint` 的窮舉交叉驗證。
3. **Audit 整合**：`AuditReport` 增補 `overlaps`，新增 `pattern-overlap-certain` /
   `pattern-overlap-possible` 兩個診斷碼（預設 `warning`）；驗證單線設定輸出不變、
   `ok` 與 exit code 不因新診斷改變。
4. **CLI 呈現**：新增 `--strict-overlap`，僅提升 severity 而不改判定；重疊沿用既有
   diagnostics 區塊呈現。`list` 明確過濾重疊診斷以維持既有輸出；不做 `init` 整合
   （`init` 只產生單線設定，警告無法觸發）。確認 `check`、`next`、`create`、`plan`
   與 GitHub Action 行為零變更。
5. **交付與驗證**：更新中英文 README、changelog、roadmap 與套件版本；`schemaVersion`
   維持 `1` 並確認 `json-output.schema.json` 對增補欄位仍相容；執行 test、coverage
   （門檻 80%）、typecheck、build 與 built CLI 的 `audit --json` smoke test。
