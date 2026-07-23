# 0.7 Monorepo release planning 實作計畫

設計依據：[0.7 設計文件](../designs/2026-07-23-monorepo-release-planning-design.md)。

1. **Planning contract**：建立 pure release-plan module，重用 `planNext` / Conventional
   Commit evaluator，輸出 stable `ready` / `skipped` / `blocked` status、candidate、commit
   evidence 與 blockers。
2. **Git 與 CLI**：讓 Git adapter 支援 repository-wide 或 workspace-scoped committed
   change facts；新增 `plan --all`、fetch / JSON / human output，並確保 line 依 config
   順序、ambiguous history 不會中斷其他 line 的報告。
3. **Automation contract**：將 `plan` 加入 JSON envelope schema，擴充 reusable Action
   的 plan JSON、has-releases 與 selected next-tag outputs。
4. **交付與驗證**：補 core、command、built CLI 與 Action tests，更新雙語文件、roadmap、
   changelog 與版本；執行 test、coverage、typecheck、build 及 documentation governance。
