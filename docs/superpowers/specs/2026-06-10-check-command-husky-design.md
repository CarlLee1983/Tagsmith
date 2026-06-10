# 設計：`tagsmith check` 指令 + husky pre-push 範本

- 日期：2026-06-10
- 狀態：已核可，待實作

## 目的

提供一個可在 git hook（husky）或 CI 中使用的驗證指令，確認 git tag 符合
Tagsmith 規格，避免不符 pattern、不可解析或重複版本的 tag 進入遠端。並提供一份
可直接複製的 husky `pre-push` 範本與教學。

Tagsmith 的 `create` 已在建立前保證安全（格式、可解析、嚴格遞增、不重複），
但無法防止使用者繞過工具直接 `git tag`。`check` 與 pre-push 範本即作為此情境的安全網。

## 範圍

- 新增 `tagsmith check [tags...]` 指令（雙模式）。
- 新增 `docs/husky-pre-push.md`：pre-push 範本 + 教學。
- README 新增「搭配 husky 守 tag」章節。
- **不**做：CLI 自動安裝 hook（`hooks install`）、本 repo 自身導入 husky、嚴格遞增檢查。

## 架構（遵循三層分離鐵則）

```
src/core/check.ts       新增：純函式 checkTags()，零 IO
src/cli/check.ts        新增：runCheck()，負責讀 config / git、輸出與 exit code
src/cli/index.ts        註冊 check 子指令
docs/husky-pre-push.md  新增：pre-push 範本 + 教學
README.md               新增章節
```

複用既有：`compilePattern`（pattern.ts）、`createModel`（models/index.ts）、
`analyzeTags`（analyze.ts）、`loadConfig` / `MissingConfigError`（config.ts）、
`ensureRepo` / `listTags`（git.ts）、`ui.ts` 輸出工具、`guidance.ts`（缺 config 提示）。

## `check` 行為（雙模式）

指令：`tagsmith check [tags...]`，旗標 `--json`。

### 模式一：給定 tag（`tagsmith check v1.2.3 v1.3.0`）

對每個 tag 依序驗證：

1. 符合 pattern，否則 anomaly = `pattern-mismatch`。
2. 版本可解析（`model.parse`），否則 anomaly = `unparseable-version`。
3. 重複檢查（盡力而為）：
   - 在 git repo 內時，讀既有 tags，比對候選 tag 的版本是否與「既有 tag」或
     「本批其他候選 tag」重複，重複者 anomaly = `duplicate-version`。
   - 不在 repo 內時，略過與既有 tag 的比對，仍偵測本批候選之間的重複，並仍做
     格式檢查。

需要 `.tagsmith.json`（pattern / model 來源）。**不**硬性要求 git repo。

### 模式二：未給 tag（`tagsmith check`）

對整個 repo 既有 tags 跑 `analyzeTags`，有任何 anomaly 即失敗（等同「`list`
但會回非零 exit code」）。需要 git repo + config。

### 不納入

嚴格遞增檢查——屬 `create` 職責；pre-push 時被推的 tag 通常本來就是最新版本。
未來如有需要，可加 `--require-increasing` 旗標再開（非本次範圍）。

## 輸出與 exit code（遵循 ui.ts 慣例）

- 全部通過 → stdout 友善訊息，`exit 0`。
- 任一不通過 / 缺 config / 模式二不在 repo → stderr 印原因，`exit 1`。
- 缺 config 時額外印 first-run 提示（沿用 `printFirstRunHint`）。
- `--json` → 只印 JSON，不印裝飾訊息：
  - 模式一：`{ "ok": boolean, "checks": [{ "tag": string, "ok": boolean, "anomaly": string | null }] }`
  - 模式二：`{ "ok": boolean, "anomalies": [{ "tag": string, "reason": string }] }`

## core 函式介面

```ts
// src/core/check.ts — 純函式，無 IO
import type { CompiledPattern } from "./pattern.js";
import type { TagAnomaly, VersionModel } from "../types.js";

export interface TagCheck {
  tag: string;
  ok: boolean;
  anomaly: TagAnomaly | null;
}

export interface CheckResult {
  ok: boolean;
  checks: TagCheck[];
}

/**
 * 驗證候選 tag 是否符合 pattern + model，並偵測與 existing（及候選之間）的
 * 版本重複。純函式：呼叫端負責提供 existing tag 清單。
 */
export function checkTags(
  pattern: CompiledPattern,
  model: VersionModel,
  candidates: readonly string[],
  existing: readonly string[],
): CheckResult;
```

實作要點：

- 格式檢查邏輯與 `analyze.ts` 的 `classify` 等價（pattern.extract → model.parse）。
  為避免重複，將 `classify`（或等價的單一 tag 分類函式）自 `analyze.ts` 匯出供
  `check.ts` 重用，或在 `check.ts` 內以相同兩步驟實作。實作時擇一並保持 DRY。
- 重複偵測：以 `model.format(version)` 為鍵建立既有版本集合；候選逐一比對既有集合，
  並在候選彼此之間偵測重複（第二個以後出現者標記 `duplicate-version`）。

## CLI runner 介面

```ts
// src/cli/check.ts
export interface CheckFlags { json?: boolean }
export async function runCheck(
  cwd: string,
  tags: string[],
  flags: CheckFlags,
): Promise<number>;
```

- 模式判定：`tags.length > 0` → 模式一；否則模式二。
- 模式一：`loadConfig` → 嘗試 `ensureRepo` + `listTags`（失敗則 existing = []）→
  `checkTags` → 輸出 → exit。
- 模式二：`loadConfig` → `ensureRepo`（硬性）→ `listTags` → `analyzeTags` → 輸出 → exit。
- `index.ts` 以 `.command("check [tags...]").option("--json", ...)` 註冊，action 內
  `process.exitCode = await runCheck(process.cwd(), tags, opts)`。

## husky pre-push 範本（husky v9+）

`docs/husky-pre-push.md` 提供：

```sh
# .husky/pre-push — 擋掉不符 Tagsmith 規格的 tag
tags=""
while read -r local_ref local_oid remote_ref remote_oid; do
  case "$local_ref" in
    refs/tags/*) tags="$tags ${local_ref#refs/tags/}" ;;
  esac
done
[ -z "$tags" ] && exit 0
# shellcheck disable=SC2086
npx tagsmith check $tags
```

教學涵蓋：`npm i -D husky` → `npx husky init` → 將上述內容寫入 `.husky/pre-push`。
說明此 hook 僅在推送內容含 tag 時觸發（`refs/tags/*`），純 branch 推送與刪除
tag（local_ref 非 `refs/tags/*`）直接放行。

## 測試（TDD，維持 80% 覆蓋率門檻）

- `tests/check.test.ts`（core `checkTags()`）：
  - pattern 不符 → `pattern-mismatch`
  - 符合 pattern 但版本不可解析 → `unparseable-version`
  - 候選與既有 tag 版本重複 → `duplicate-version`
  - 候選彼此重複 → 第二個標記 `duplicate-version`
  - 全部通過 → `ok: true`
  - 空候選 → `ok: true, checks: []`
- 擴充 `tests/commands.test.ts`（`runCheck`）：
  - 模式一：合法 tag → exit 0；非法 tag → exit 1
  - 模式一 `--json`：輸出結構正確、不含裝飾訊息
  - 模式二：repo 全 conforming → exit 0；含 anomaly → exit 1
  - 缺 config → exit 1 並提示
  - 模式二不在 repo → exit 1
```
