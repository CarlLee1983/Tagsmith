# 0.6 Release Readiness 實作計畫

設計依據：[0.6 設計文件](../designs/2026-07-23-release-readiness-design.md)。

1. **Policy contract**：新增 `releasePolicy` 的 Zod parser、public JSON Schema 與 pure
   readiness evaluator；涵蓋 branch glob、乾淨 worktree、annotated / signed 與 target
   policy 的穩定 diagnostic codes。
2. **Git facts 與 audit**：在 Git adapter 加入 branch、status、ref SHA probes；擴充
   `audit` 的 `--fetch` / `--remote`、human summary 與 JSON `releaseReadiness`。
3. **Create preflight**：新增 opt-in `--enforce-policy`，在建立前將 candidate 輸入同一個
   evaluator；新增 `--target` 與 `--sign`，維持無旗標時的既有 create 行為。
4. **交付與驗證**：補 unit / command / Git integration tests，更新中英文文件、schema、
   changelog 與版本；執行 test、typecheck、build、built CLI smoke test。
