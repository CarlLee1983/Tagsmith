# 1.0 穩定介面契約實作計畫

設計依據：[1.0 設計文件](../designs/2026-07-24-stable-interface-contract-design.md)。

每一步可獨立驗證、獨立提交；步驟 1–3 不改變任何輸出，步驟 4–5 才引入本版僅有的
兩項 breaking change。

1. **診斷碼登記表**：新增 `src/core/diagnostics.ts` 匯出 `DIAGNOSTIC_CODES` 與
   `DiagnosticCode`（19 碼）；將 `JsonDiagnostic.code` 與 `ReleasePlanBlocker.code`
   由 `string` 收斂為 `DiagnosticCode`，並以型別層斷言驗證
   `TagAnomaly ⊆ DiagnosticCode`。收斂後移除 `next.ts` 中永遠不會執行的
   `?? "tag-anomaly"` fallback。驗證：`npm run typecheck` 通過、既有測試零變更。
2. **JSON 契約 schema**：擴充 `json-output.schema.json`，以 `command` 分派描述五個
   命令的 `data`（`list` 用 `oneOf` 表達 `--all` 與單線兩種形狀），`code` 由
   `type: string` 改為登記表 enum；`data` 層允許額外屬性，envelope 外層維持
   `additionalProperties: false`。加入 `ajv` devDependency，新增
   `tests/json-contract.test.ts`：五命令 × 成功/失敗/無設定/`--all`/單線分支的真實
   輸出全部通過驗證，並反向斷言 schema enum 與 `DIAGNOSTIC_CODES` 逐字相等。
3. **exit code 契約**：不新增 exit code；新增 `tests/exit-codes.test.ts`，依設計文件
   的表格對每個命令各釘一個成功與一個失敗情境（含 `merge-check` 的
   `HUSKY=0` / `TAGSMITH_SKIP=1` 略過路徑與未知命令的 exit 1）。
4. **套件表面**（breaking）：`package.json` 加入 `exports`，只開放
   `package.json`、`schema.json`、`json-output.schema.json`，不提供 `.` 進入點；
   測試斷言 `dist/` 不可由外部匯入、兩個 schema 檔可被解析。確認 `bin` 與 CLI 內部
   以相對路徑讀取 `package.json` 取版本號的行為不受影響。
5. **支援平台與 CI**（breaking）：`engines.node` 改為 `>=22`，同步更新
   `.docsentry.json` 的 Node 版本 assertion 與 README / `docs/README.zh-TW.md` 兩版
   的安裝需求敘述；新增 `.github/workflows/ci.yml`，於 `pull_request` 與
   `push: main` 以 Node 22 + 24 matrix 執行 `npm ci` → `typecheck` → `build` →
   `coverage`（`build` 需排在測試前，供 built-CLI E2E 使用）。
6. **文件與發版**：README 與 `docs/README.zh-TW.md` 新增「穩定性契約」章節，內含
   受 SemVer 保護 / 不保護的表面、完整診斷碼表與 exit code 表，並寫明「未知 `code`
   應以 `severity` 決策」；CHANGELOG 中英雙版新增 `1.0.0`（Breaking 區塊逐條列出
   `engines` 與 `exports`）；ROADMAP 的 1.0 標記為已發佈；`package.json` 版本升至
   `1.0.0`。`schemaVersion` 維持 `1`。
7. **驗收**：`npm test`、`npm run typecheck`、`npm run build`、`npm run coverage`
   （門檻 80%）全過；Docsentry 通過；以 built CLI 對五個命令實跑 `--json` 並以
   schema 驗證輸出；確認 `audit`、`plan`、`create` 等命令輸出與 0.9 逐字相同。
