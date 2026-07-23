# 0.8 Artifact 與 commit-policy 一致性實作計畫

設計依據：[0.8 設計文件](../designs/2026-07-23-artifact-commit-policy-design.md)。

1. **Configuration contract**：新增 line-level `artifact: { type: "package-json" }`、
   top-level `commitPolicy` 與 `releasePolicy.requireArtifactVersion` 的 TypeScript / Zod / JSON
   Schema 支援，保留 legacy config 與未設定時的既有行為。
2. **Pure decisions**：實作 package JSON artifact evidence parser / model-aware evaluator；擴充
   release readiness 以消費 candidate artifact evidence。將 Conventional Commit parser 升級為
   ordered custom rules，並在每一個 recommendation reason 記錄命中的 rule。
3. **Git and CLI integration**：新增 Git ref file reader；讓 `audit` 驗證每個 historical
   conforming tag 的 artifact，讓 `create --enforce-policy` 驗證 candidate target，並讓
   `next`、`create`、`plan` 共用新的 `commitPolicy` recommendation。
4. **Delivery and verification**：補 pure、config/schema、command、Git integration 及 built CLI
   coverage；更新中英文 README、changelog、roadmap 與套件版本；執行 test、coverage、typecheck、
   build 與 documentation governance。
