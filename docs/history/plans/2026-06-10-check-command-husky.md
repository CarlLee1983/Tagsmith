# `tagsmith check` 指令 + husky pre-push 範本 Implementation Plan

**Goal:** 新增 `tagsmith check [tags...]` 指令（雙模式驗證）與一份 husky `pre-push` 範本，讓使用者能在 git hook / CI 中擋下不符規格的 git tag。

**Architecture:** 遵循專案三層分離鐵則——新增純函式 `core/check.ts`（零 IO）負責驗證邏輯，新增 `cli/check.ts`（runCheck）負責讀 config/git 與輸出，於 `cli/index.ts` 註冊子指令。core 複用既有 `compilePattern`/`createModel`/`analyzeTags`。husky 範本以文件交付（不改動本 repo 相依）。

**Tech Stack:** Node.js + TypeScript（ESM）、commander、picocolors、zod、vitest。

---

## File Structure

- **Create** `src/core/check.ts` — 純函式 `checkTags()`：對候選 tag 驗 pattern + 可解析 + 重複偵測。零 IO。
- **Modify** `src/core/analyze.ts` — 匯出單一 tag 分類函式 `classify`（目前為私有），供 `check.ts` 重用，維持 DRY。
- **Create** `src/cli/check.ts` — `runCheck(cwd, tags, flags)`：判定雙模式、讀 config/git、輸出與 exit code。
- **Modify** `src/cli/index.ts` — 註冊 `check [tags...]` 子指令與 `--json` 旗標。
- **Create** `tests/check.test.ts` — core `checkTags()` 單元測試。
- **Modify** `tests/commands.test.ts` — 新增 `runCheck` 整合測試（雙模式、--json、錯誤路徑）。
- **Create** `docs/husky-pre-push.md` — pre-push 範本 + 教學。
- **Modify** `README.md` — 新增「搭配 husky 守 tag」章節。

---

## Task 1: 匯出 `classify` 供重用

**Files:**
- Modify: `src/core/analyze.ts`

`analyze.ts` 內 `classify(raw, pattern, model)` 目前是私有函式（檔尾），回傳
`AnalyzedTag`（含 `anomaly` 與 `conforming`）。`check.ts` 需要相同的「pattern.extract →
model.parse」兩步驟邏輯，為避免重複，將其匯出。

- [ ] **Step 1: 將 `classify` 改為匯出**

在 `src/core/analyze.ts` 找到：

```ts
function classify(
  raw: string,
  pattern: CompiledPattern,
  model: VersionModel,
): AnalyzedTag {
```

改為：

```ts
export function classify(
  raw: string,
  pattern: CompiledPattern,
  model: VersionModel,
): AnalyzedTag {
```

- [ ] **Step 2: 確認既有測試仍通過**

Run: `npm test`
Expected: PASS（僅可見度變更，行為不變）

- [ ] **Step 3: Commit**

```bash
git add src/core/analyze.ts
git commit -m "refactor: [core] 匯出 classify 供 check 重用"
```

---

## Task 2: core `checkTags()` — 格式檢查（pattern + 可解析）

**Files:**
- Create: `src/core/check.ts`
- Test: `tests/check.test.ts`

先實作不含重複偵測的格式檢查，下一個 Task 再加重複偵測。

- [ ] **Step 1: 寫失敗測試**

建立 `tests/check.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { checkTags } from "../src/core/check.js";
import { compilePattern } from "../src/core/pattern.js";
import { createModel } from "../src/core/models/index.js";

const pattern = compilePattern("v{version}");
const model = createModel({ type: "semver" });

describe("checkTags — format", () => {
  it("passes a conforming tag", () => {
    const r = checkTags(pattern, model, ["v1.2.3"], []);
    expect(r.ok).toBe(true);
    expect(r.checks).toEqual([{ tag: "v1.2.3", ok: true, anomaly: null }]);
  });

  it("flags a pattern mismatch", () => {
    const r = checkTags(pattern, model, ["junk"], []);
    expect(r.ok).toBe(false);
    expect(r.checks[0]).toEqual({
      tag: "junk",
      ok: false,
      anomaly: "pattern-mismatch",
    });
  });

  it("flags an unparseable version", () => {
    const r = checkTags(pattern, model, ["vNOPE"], []);
    expect(r.ok).toBe(false);
    expect(r.checks[0].anomaly).toBe("unparseable-version");
  });

  it("returns ok for empty candidates", () => {
    const r = checkTags(pattern, model, [], []);
    expect(r).toEqual({ ok: true, checks: [] });
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/check.test.ts`
Expected: FAIL（`checkTags` 尚未定義 / 模組不存在）

- [ ] **Step 3: 實作最小程式**

建立 `src/core/check.ts`：

```ts
import type { CompiledPattern } from "./pattern.js";
import { classify } from "./analyze.js";
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
 * 驗證候選 tag 是否符合 pattern + model。純函式，無 IO。
 * 重複偵測於後續加入。
 */
export function checkTags(
  pattern: CompiledPattern,
  model: VersionModel,
  candidates: readonly string[],
  _existing: readonly string[],
): CheckResult {
  const checks: TagCheck[] = candidates.map((tag) => {
    const c = classify(tag, pattern, model);
    return { tag, ok: c.conforming, anomaly: c.anomaly };
  });
  return { ok: checks.every((c) => c.ok), checks };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/check.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/check.ts tests/check.test.ts
git commit -m "feat: [core] checkTags 格式驗證"
```

---

## Task 3: core `checkTags()` — 重複版本偵測

**Files:**
- Modify: `src/core/check.ts`
- Test: `tests/check.test.ts`

候選 tag 的版本若與 `existing` 中任一既有版本相同，或與本批前面的候選相同，標記
`duplicate-version`。比對鍵用 `model.format(version)`。

- [ ] **Step 1: 新增失敗測試**

在 `tests/check.test.ts` 末端新增：

```ts
describe("checkTags — duplicates", () => {
  it("flags a candidate duplicating an existing tag", () => {
    const r = checkTags(pattern, model, ["v1.2.3"], ["v1.2.3"]);
    expect(r.ok).toBe(false);
    expect(r.checks[0].anomaly).toBe("duplicate-version");
  });

  it("flags the second of two duplicate candidates", () => {
    const r = checkTags(pattern, model, ["v1.0.0", "v1.0.0"], []);
    expect(r.checks[0].ok).toBe(true);
    expect(r.checks[1].anomaly).toBe("duplicate-version");
  });

  it("ignores existing non-conforming tags when deduping", () => {
    const r = checkTags(pattern, model, ["v1.2.3"], ["junk"]);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/check.test.ts`
Expected: FAIL（目前 `v1.2.3` vs `v1.2.3` 回 ok: true）

- [ ] **Step 3: 實作重複偵測**

將 `src/core/check.ts` 的 `checkTags` 改為：

```ts
export function checkTags(
  pattern: CompiledPattern,
  model: VersionModel,
  candidates: readonly string[],
  existing: readonly string[],
): CheckResult {
  // 既有 conforming 版本的鍵集合。
  const seen = new Set<string>();
  for (const raw of existing) {
    const c = classify(raw, pattern, model);
    if (c.conforming && c.version !== null) {
      seen.add(model.format(c.version));
    }
  }

  const checks: TagCheck[] = candidates.map((tag) => {
    const c = classify(tag, pattern, model);
    if (!c.conforming) {
      return { tag, ok: false, anomaly: c.anomaly };
    }
    const key = model.format(c.version);
    if (seen.has(key)) {
      return { tag, ok: false, anomaly: "duplicate-version" as const };
    }
    seen.add(key);
    return { tag, ok: true, anomaly: null };
  });

  return { ok: checks.every((c) => c.ok), checks };
}
```

注意：移除上一個 Task 中未使用的 `_existing` 參數名，改為實際使用的 `existing`。

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/check.test.ts`
Expected: PASS（全部）

- [ ] **Step 5: Commit**

```bash
git add src/core/check.ts tests/check.test.ts
git commit -m "feat: [core] checkTags 重複版本偵測"
```

---

## Task 4: CLI `runCheck()` — 模式一（給定 tag）

**Files:**
- Create: `src/cli/check.ts`
- Test: `tests/commands.test.ts`

- [ ] **Step 1: 新增失敗測試**

在 `tests/commands.test.ts` 的 `runInit`/`runList` 等 import 之後加上：

```ts
import { runCheck } from "../src/cli/check.js";
```

並在最外層 `describe("command runners (in-process)", ...)` 內、`describe("list", ...)`
之後新增：

```ts
describe("check", () => {
  it("passes a conforming explicit tag (exit 0)", async () => {
    await runInit(dir, { yes: true });
    const r = await capture(() => runCheck(dir, ["v1.2.3"], {}));
    expect(r.code).toBe(0);
  });

  it("fails a non-conforming explicit tag (exit 1)", async () => {
    await runInit(dir, { yes: true });
    const r = await capture(() => runCheck(dir, ["junk"], {}));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/junk/);
  });

  it("detects a duplicate against an existing tag", async () => {
    await runInit(dir, { yes: true });
    tag(dir, "v1.0.0");
    const r = await capture(() => runCheck(dir, ["v1.0.0"], {}));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/duplicate/);
  });

  it("fails without a config", async () => {
    const r = await capture(() => runCheck(dir, ["v1.0.0"], {}));
    expect(r.code).toBe(1);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/commands.test.ts -t check`
Expected: FAIL（`runCheck` 模組不存在）

- [ ] **Step 3: 實作 `runCheck`（含模式二骨架）**

建立 `src/cli/check.ts`：

```ts
import { loadConfig, MissingConfigError } from "../core/config.js";
import { compilePattern } from "../core/pattern.js";
import { createModel } from "../core/models/index.js";
import { checkTags } from "../core/check.js";
import { analyzeTags } from "../core/analyze.js";
import { ensureRepo, listTags, GitError } from "../git/git.js";
import { color, info, printError, success } from "./ui.js";
import { printFirstRunHint } from "./guidance.js";

export interface CheckFlags {
  json?: boolean;
}

export async function runCheck(
  cwd: string,
  tags: string[],
  flags: CheckFlags,
): Promise<number> {
  try {
    const config = await loadConfig(cwd);
    const pattern = compilePattern(config.pattern);
    const model = createModel(config.model);

    if (tags.length > 0) {
      return await runExplicit(cwd, pattern, model, tags, flags);
    }
    return await runLint(cwd, pattern, model, flags);
  } catch (err) {
    printError(err);
    if (err instanceof MissingConfigError) printFirstRunHint({ json: flags.json });
    return 1;
  }
}

async function runExplicit(
  cwd: string,
  pattern: ReturnType<typeof compilePattern>,
  model: ReturnType<typeof createModel>,
  tags: string[],
  flags: CheckFlags,
): Promise<number> {
  // 重複偵測為盡力而為：在 repo 內才讀既有 tags。
  let existing: string[] = [];
  try {
    await ensureRepo({ cwd });
    existing = await listTags({ cwd });
  } catch (err) {
    if (!(err instanceof GitError)) throw err;
  }

  const result = checkTags(pattern, model, tags, existing);

  if (flags.json) {
    info(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  for (const c of result.checks) {
    if (c.ok) {
      success(`${color.cyan(c.tag)} ${color.dim("ok")}`);
    } else {
      printError(`${c.tag} (${c.anomaly})`);
    }
  }
  return result.ok ? 0 : 1;
}

async function runLint(
  cwd: string,
  pattern: ReturnType<typeof compilePattern>,
  model: ReturnType<typeof createModel>,
  flags: CheckFlags,
): Promise<number> {
  await ensureRepo({ cwd });
  const tags = await listTags({ cwd });
  const analysis = analyzeTags(tags, pattern, model);
  const ok = analysis.anomalies.length === 0;

  if (flags.json) {
    info(
      JSON.stringify(
        {
          ok,
          anomalies: analysis.anomalies.map((t) => ({
            tag: t.raw,
            reason: t.anomaly,
          })),
        },
        null,
        2,
      ),
    );
    return ok ? 0 : 1;
  }

  if (ok) {
    success(`All ${analysis.conforming.length} tag(s) conform to the spec.`);
    return 0;
  }
  for (const t of analysis.anomalies) {
    printError(`${t.raw} (${t.anomaly})`);
  }
  return 1;
}
```

注意：`GitError` 需從 `../git/git.js` 匯入——確認 `git.ts` 已 `export class GitError`
（已存在）。

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/commands.test.ts -t check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/check.ts tests/commands.test.ts
git commit -m "feat: [cli] runCheck 模式一（給定 tag）"
```

---

## Task 5: CLI `runCheck()` — 模式二（lint 整個 repo）測試

**Files:**
- Test: `tests/commands.test.ts`

模式二實作已在 Task 4 的 `runLint` 完成，此 Task 補上測試覆蓋。

- [ ] **Step 1: 新增測試**

在 `tests/commands.test.ts` 的 `describe("check", ...)` 內新增：

```ts
it("lints all repo tags — passes when all conform (exit 0)", async () => {
  await runInit(dir, { yes: true });
  tag(dir, "v1.0.0");
  tag(dir, "v1.1.0");
  const r = await capture(() => runCheck(dir, [], {}));
  expect(r.code).toBe(0);
  expect(r.out).toMatch(/conform/);
});

it("lints all repo tags — fails on anomaly (exit 1)", async () => {
  await runInit(dir, { yes: true });
  tag(dir, "v1.0.0");
  tag(dir, "junk");
  const r = await capture(() => runCheck(dir, [], {}));
  expect(r.code).toBe(1);
  expect(r.err).toMatch(/junk/);
});

it("lint mode emits JSON", async () => {
  await runInit(dir, { yes: true });
  tag(dir, "junk");
  const r = await capture(() => runCheck(dir, [], { json: true }));
  const parsed = JSON.parse(r.out);
  expect(parsed.ok).toBe(false);
  expect(parsed.anomalies[0].tag).toBe("junk");
});

it("explicit mode emits JSON", async () => {
  await runInit(dir, { yes: true });
  const r = await capture(() => runCheck(dir, ["v1.2.3"], { json: true }));
  const parsed = JSON.parse(r.out);
  expect(parsed.ok).toBe(true);
  expect(parsed.checks[0]).toEqual({
    tag: "v1.2.3",
    ok: true,
    anomaly: null,
  });
});
```

- [ ] **Step 2: 執行測試確認通過**

Run: `npx vitest run tests/commands.test.ts -t check`
Expected: PASS（模式二邏輯已於 Task 4 實作）

- [ ] **Step 3: Commit**

```bash
git add tests/commands.test.ts
git commit -m "test: [cli] runCheck 模式二 lint 與 JSON 覆蓋"
```

---

## Task 6: 註冊 `check` 子指令

**Files:**
- Modify: `src/cli/index.ts`

- [ ] **Step 1: 匯入 runCheck**

在 `src/cli/index.ts` 既有 import 區（`import { runGuide } from "./guide.js";` 之後）新增：

```ts
import { runCheck } from "./check.js";
```

- [ ] **Step 2: 註冊指令**

在 `next` 指令註冊區塊（`program.command("next")...` 整段）之後、`const createCommand =`
之前，插入：

```ts
program
  .command("check [tags...]")
  .description(
    "Validate tags against the spec; with no args, lint all repo tags",
  )
  .option("--json", "output JSON")
  .action(async (tags: string[], opts) => {
    process.exitCode = await runCheck(process.cwd(), tags, opts);
  });
```

- [ ] **Step 3: 在 after-help 範例補一行**

在 `program.addHelpText("after", ...)` 的 Examples 區塊內、`tagsmith list` 那行之後加入：

```
  $ tagsmith check v1.2.3                  Validate a tag against the spec
```

- [ ] **Step 4: 手動驗證指令可執行**

Run: `npm run dev -- check --help`
Expected: 顯示 check 指令說明，含 `[tags...]` 與 `--json`

- [ ] **Step 5: 端到端驗證（在暫存 repo）**

Run:
```bash
npm run build && cd "$(mktemp -d)" && git init -q && \
  node "$OLDPWD/dist/cli/index.js" init -y && \
  node "$OLDPWD/dist/cli/index.js" check v9.9.9; echo "exit=$?"; cd "$OLDPWD"
```
Expected: 印出 `v9.9.9 ok`，`exit=0`

- [ ] **Step 6: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: [cli] 註冊 check 子指令"
```

---

## Task 7: husky pre-push 範本文件

**Files:**
- Create: `docs/husky-pre-push.md`

- [ ] **Step 1: 撰寫文件**

建立 `docs/husky-pre-push.md`：

````markdown
# 搭配 husky 守 git tag

用 [husky](https://typicode.github.io/husky/) 的 `pre-push` hook，在推送含 tag 時
自動以 `tagsmith check` 驗證，擋下不符規格的 tag。

## 前置

專案已用 `tagsmith init` 建立 `.tagsmith.json`（或使用 zero-config），且已安裝
[`@carllee1983/tagsmith`](https://www.npmjs.com/package/@carllee1983/tagsmith)（本機或專案相依）。

## 安裝步驟（husky v9+）

```bash
npm i -D @carllee1983/tagsmith husky
npx husky init
```

將以下內容寫入 `.husky/pre-push`：

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

## 行為說明

- 僅在推送內容包含 tag（`refs/tags/*`）時觸發；純 branch 推送直接放行。
- 刪除 tag（`local_ref` 非 `refs/tags/*`）不受影響。
- 任一 tag 不符 pattern、版本不可解析、或與既有 tag 重複版本時，`tagsmith check`
  回非零 exit code，husky 即中止 push。

## 驗證

```bash
git tag bad-format
git push origin bad-format   # 應被 hook 擋下
git tag -d bad-format
```
````

- [ ] **Step 2: Commit**

```bash
git add docs/husky-pre-push.md
git commit -m "docs: husky pre-push 範本與教學"
```

---

## Task 8: README 章節 + 全量驗證

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 找到 README 指令說明區段**

Run: `grep -n "tagsmith list\|## \|### \|tagsmith create" README.md | head -40`
Expected: 列出現有標題與指令段落，定位「指令/Commands」區與適合插入新章節之處。

- [ ] **Step 2: 在指令清單補上 check**

在 README 介紹各子指令之處（`list` / `next` / `create` 附近），加入一行說明：

```markdown
- `tagsmith check [tags...]` — 驗證 tag 是否符合規格；不帶參數時檢查整個 repo 既有 tags（CI / git hook 用）。
```

（若 README 用表格列指令，則在表格新增對應列：指令 `tagsmith check [tags...]`，說明同上。實作時依現有格式為準。）

- [ ] **Step 3: 新增 husky 章節**

在 README 末端「相關文件 / 進階」處（或檔尾）新增：

```markdown
## 搭配 husky 守 tag

可用 git `pre-push` hook 在推送時自動驗證 tag，擋下不符規格者。
詳見 [docs/husky-pre-push.md](docs/husky-pre-push.md)。
```

- [ ] **Step 4: 全量測試 + 覆蓋率**

Run: `npm test && npm run coverage`
Expected: 全部 PASS，覆蓋率 ≥ 80%

- [ ] **Step 5: 型別檢查 + 建置**

Run: `npm run typecheck && npm run build`
Expected: 無型別錯誤、`dist/` 產出成功

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: README 新增 check 指令與 husky 章節"
```

---

## Self-Review notes

- **Spec coverage:** 模式一（格式 Task 2 / 重複 Task 3 / CLI Task 4）、模式二（Task 4 runLint + Task 5 測試）、--json（Task 4/5）、exit code（各 Task）、缺 config（Task 4）、不在 repo（模式二硬性要求 → Task 4 runLint 的 ensureRepo 會丟 GitError 經外層 catch 回 1；模式一 best-effort → Task 4 runExplicit）、husky 範本（Task 7）、README（Task 8）、三層分離（core/check.ts 零 IO，git 讀取留在 cli）皆有對應。
- **Placeholder scan:** 無 TBD/TODO；所有 code step 均含完整程式碼。Task 8 Step 2 因 README 格式未知而給「依現有格式為準」的條件式指引，屬合理彈性而非佔位。
- **Type consistency:** `TagCheck`/`CheckResult`/`checkTags` 簽章在 Task 2 定義、Task 3 修改參數名 `_existing`→`existing`（已於 Task 3 Step 3 註明）、Task 4 使用一致；`CheckFlags { json? }` 與 `runCheck(cwd, tags, flags)` 在 Task 4 定義、Task 6 註冊處一致。
