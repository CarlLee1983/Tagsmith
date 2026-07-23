# 0.5 Tag Audit 與 JSON Contract 實作計畫

設計依據：[0.5 設計文件](../designs/2026-07-23-audit-json-contract-design.md)。

1. **核心 assignment**：把多命中 tag 從 `byLine` 移至 `ambiguous`，新增歧義查詢和
   單元測試。
2. **核心 audit**：以 assignment 與 `analyzeTags` 建立純 `AuditReport`；測試 error /
   warning、latest、orphan 和 duplicate。
3. **CLI contract**：建立 JSON envelope helper 和 output schema；遷移 `list`、`check`、
   `next`，新增 `audit` 指令；阻擋受歧義影響的 `next`/`create`。
4. **整合交付**：更新 GitHub Action、README 中英文文件、changelog、package version；
   執行完整測試、typecheck、build 和 built-binary smoke test。
