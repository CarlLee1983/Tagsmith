# Tagsmith 指令引導(上手體驗)設計

- 日期:2026-06-10
- 主題:完善指令引導,讓使用者快速上手
- 範圍:CLI 層引導體驗,不更動 `core/` 純函式與安全保證

## 目標

降低新使用者上手門檻,涵蓋四個面向:

1. **首次使用引導** — 無參數或無設定檔時,主動指向第一步。
2. **下一步建議** — 每個指令成功後,在輸出結尾提示合理的下一步。
3. **更好的 help 與範例** — 全域與各指令 help 附真實範例區塊。
4. **`tagsmith guide` 指令** — 互動式逐步導覽 init→list→next→create 一輪。

## 架構鐵則與輸出紀律

- 引導全屬 `cli/` 層;`core/` 維持零 IO、零副作用。
- 新增 `src/cli/guidance.ts`:集中所有引導文案與輸出函式。
  - 提示性輸出走 **stdout**;錯誤情境的引導走 **stderr**(沿用 `ui.ts`)。
  - **`--json` 模式完全靜默**,保住「JSON 只印 JSON」鐵則。
- 文案使用 Traditional Chinese(台灣用語),配色沿用 `ui.ts` 的 picocolors。
- 不更動現有四個指令的核心邏輯,只在成功結尾「呼叫」引導函式。

## 元件

### `src/cli/guidance.ts`(新增,純輸出函式)

匯出函式(皆接受 `{ json?: boolean }`,JSON 為真時 no-op):

- `printFirstRunHint()` — 無設定檔時的友善兩行提示(說明 + `tagsmith init`)。
- `printNextStepsAfterInit(opts)` — 建議 `tagsmith list`、`tagsmith next`。
- `printNextStepsAfterNext(opts)` — 建議 `tagsmith create -l <level>`(沿用使用者剛用的 level)。
- `printNextStepsAfterCreate(opts)` — 未 `--push` 則建議補 `--push`;已 push 則建議 `tagsmith list`。

文案以常數集中,確保一致並易於測試。

### `src/cli/guide.ts`(新增,互動指令)

- 使用 `@clack/prompts` 逐步**解說** init→list→next→create 一輪。
- 互動行為:
  - 可選擇「實際執行 init」→ 委派既有 `runInit`(不重寫設定邏輯)。
  - `next`、`list` 步驟以**唯讀預覽**呈現(計算/檢視,不寫入)。
  - 示範 `create` 一律以 **dry-run 文案**呈現;**絕不**在未明確確認下建立真實 tag。
- 取消(Ctrl-C / clack cancel)時乾淨退出,exit code 0。

### `src/cli/index.ts`(修改)

- `program.addHelpText('beforeAll', …)`:歡迎橫幅 + 「第一步:`tagsmith init`」。
- 全域與各指令 `addHelpText('after', …)`:取自 README 快速開始的真實範例區塊。
- 註冊 `guide` 指令。
- 各 `.action` 在對應 `runX` 之後呼叫 guidance 函式(傳入 `opts.json`)。

### 既有指令 handler(微調)

- `runInit` / `runNext` / `runCreate` 成功路徑結尾呼叫對應 `printNextStepsAfter*`。
- 無設定檔的錯誤情境改用更友善文案(說明 + 確切下一步),**exit code 與既有行為不變**。

## 資料流

```
使用者執行指令
  → commander 解析(beforeAll/afterHelp 提供靜態引導)
  → runX 執行核心邏輯(core 純函式)
  → 成功:printNextStepsAfterX({ json })  // json 為真時靜默
  → 失敗:printError + 友善引導(stderr)
```

`guide` 指令獨立:clack 互動 → 委派 runInit / 唯讀預覽 → 結尾總結。

## 錯誤處理

- 沿用 `printError`;無設定檔的 `ConfigError` 文案升級為兩行友善提示。
- `--json` 模式下,錯誤仍走既有路徑,不額外印引導。
- `guide` 取消乾淨退出;任何子步驟錯誤冒泡到既有 `parseAsync().catch`。

## 測試(維持 80% 門檻)

- **guidance.ts**:單元測試——JSON 模式靜默、各 context 文案正確、level 正確帶入。
- **既有指令**:補測「成功後輸出含下一步提示」與「`--json` 不含提示」。
- **guide**:以可注入/可模擬 `@clack/prompts` 的方式測關鍵分支(實際執行 init vs 跳過、create 僅 dry-run、取消路徑)。
- **help**:E2E(`dist/` 已建)驗證 `--help` 含範例區塊、無參數含歡迎橫幅。

## 非目標(YAGNI)

- 不做多語系切換、不做設定遷移、不新增版本模型。
- `guide` 不取代 `init`;不在 guide 內建立真實 tag。
- 不更動 `core/`、`git/` 介面與安全不變式。
