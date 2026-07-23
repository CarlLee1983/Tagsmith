# 多 tag 線支援 Implementation Plan

**Goal:** 讓單一專案在一份 `.tagsmith.json` 中定義多條獨立 tag 線(各自版本模型),預設為單一 semver 主線,並完全相容既有單線設定檔。

**Architecture:** 維持三層分離(core 純函式 → git → cli)。Config 層用 zod union 解析新陣列格式與舊扁平格式,正規化成內部 `{ lines, default }`。Core 函式改吃單一 `TagLine`;新增純函式 `assignTagsToLines` 把 git tag 依宣告順序歸屬到各線桶,核心安全不變式(格式符合、可解析、嚴格遞增、不重複)維持 per-line 判定。CLI 用 `-t, --tag <name>` 選線。

**Tech Stack:** Node.js + TypeScript(ESM)、zod、commander、vitest。

**Design record:** `docs/history/designs/2026-06-10-multi-tag-lines-design.md`

---

## 檔案結構

| 檔案 | 責任 | 動作 |
|------|------|------|
| `src/types.ts` | 型別:`TagLine`(新)、`TagsmithConfig`(改為 `{lines, default}`) | Modify |
| `src/core/lines.ts` | 純函式:`assignTagsToLines`、`selectLine` | Create |
| `src/core/config.ts` | zod union schema + `normalizeConfig` + 載入/寫出 | Modify |
| `src/core/plan.ts` | `planNext` / `validateExplicit` 改吃 `TagLine` | Modify |
| `src/core/analyze.ts` | 不改邏輯(輸入語意改為單線桶) | — |
| `src/cli/index.ts` | 各指令加 `-t, --tag` option + help | Modify |
| `src/cli/next.ts` | 選線 + 桶分流 + json `line` 欄位 | Modify |
| `src/cli/create.ts` | 選線 + per-line push + 桶分流 | Modify |
| `src/cli/list.ts` | default 線 / `--all` / `--tag` + orphans | Modify |
| `src/cli/check.ts` | 跨線回報 + `--tag` | Modify |
| `src/cli/init.ts` | 寫出新陣列格式(單線) | Modify |
| `tests/*.test.ts` | 對應測試 | Modify/Create |

> 每個 Task 結束後 `npm test` 與 `npm run typecheck` 應為綠燈再 commit。

---

## Task 1: `TagLine` 型別 + core `plan.ts` 改吃單線

把 core 計算函式由「整個 config」改成「單一 `TagLine`」,為多線鋪路。此時 `TagsmithConfig` 仍是舊單線形狀,測試直接建構 `TagLine`。

**Files:**
- Modify: `src/types.ts`
- Modify: `src/core/plan.ts`
- Test: `tests/plan.test.ts`

- [ ] **Step 1: 在 `src/types.ts` 新增 `TagLine` 介面**

在 `ModelConfig` 型別定義之後、`TagsmithConfig` 之前,加入:

```ts
/** 一條獨立的 tag 線:有自己的 pattern、版本模型、起始版本與 push 設定。 */
export interface TagLine {
  /** 線名,唯一,用於 CLI 選線。 */
  name: string;
  /** Tag 模板;MUST 含且僅含一個 `{version}`。 */
  pattern: string;
  model: ModelConfig;
  /** 無對應 tag 時的起始版本。 */
  initialVersion: string;
  /** 建立時是否預設 push。 */
  push: boolean;
}
```

- [ ] **Step 2: 改寫 `tests/plan.test.ts` 的 fixture 為 `TagLine`**

把檔頭 `TagsmithConfig` 匯入與 fixture 換成 `TagLine`,並更新 `planNext` / `validateExplicit` 呼叫第一參數。完整替換檔案上半段:

```ts
import { describe, it, expect } from "vitest";
import { planNext, validateExplicit } from "../src/core/plan.js";
import { createSemverModel, createBuildModel } from "../src/core/models/index.js";
import type { TagLine } from "../src/types.js";

const semverLine: TagLine = {
  name: "app",
  pattern: "v{version}",
  model: { type: "semver" },
  initialVersion: "0.1.0",
  push: false,
};
const model = createSemverModel();

describe("planNext", () => {
  it("bumps from the latest conforming tag", () => {
    const plan = planNext(semverLine, model, ["v1.0.0", "v1.2.0"], "patch");
    expect(plan.tag).toBe("v1.2.1");
    expect(plan.fromVersion).toBe("1.2.0");
    expect(plan.fresh).toBe(false);
  });

  it("uses initialVersion when no conforming tag exists", () => {
    const plan = planNext(semverLine, model, [], "patch");
    expect(plan.tag).toBe("v0.1.0");
    expect(plan.fresh).toBe(true);
    expect(plan.fromVersion).toBeNull();
  });

  it("ignores non-conforming tags when computing latest", () => {
    const plan = planNext(semverLine, model, ["garbage", "v2.0.0"], "minor");
    expect(plan.tag).toBe("v2.1.0");
  });

  it("guarantees strict increase via build model", () => {
    const buildLine: TagLine = {
      name: "build",
      pattern: "build-{version}",
      model: { type: "build" },
      initialVersion: "1",
      push: false,
    };
    const bm = createBuildModel();
    const plan = planNext(buildLine, bm, ["build-7"], "auto");
    expect(plan.tag).toBe("build-8");
  });
});
```

> 同檔 `describe("validateExplicit")` 區塊內所有 `semverConfig` 引用一併改為 `semverLine`(逐處字串替換,斷言不變)。

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm test -- plan`
Expected: FAIL(`planNext` 仍要求 `TagsmithConfig`,型別/引用不符)

- [ ] **Step 4: 改寫 `src/core/plan.ts` 簽章為 `TagLine`**

匯入改為:

```ts
import type { BumpLevel, TagLine, VersionModel } from "../types.js";
```

`planNext` 簽章與內部第一參數改名:

```ts
export function planNext(
  line: TagLine,
  model: VersionModel,
  existingTags: readonly string[],
  level: BumpLevel = "patch",
): NextPlan {
  const pattern = compilePattern(line.pattern);
  const analysis = analyzeTags(existingTags, pattern, model);

  if (analysis.latest === null) {
    const initial = model.initial(line.initialVersion);
    // ...(其餘不變)
```

`validateExplicit` 同樣把參數 `config: TagsmithConfig` 改為 `line: TagLine`,並把內部 `config.pattern` 改為 `line.pattern`:

```ts
export function validateExplicit(
  line: TagLine,
  model: VersionModel,
  explicitVersion: string,
  existingTags: readonly string[],
  opts: ValidateOptions = {},
): ValidationResult {
  const pattern = compilePattern(line.pattern);
  // ...(其餘不變)
```

- [ ] **Step 5: 執行測試與型別檢查**

Run: `npm test -- plan && npm run typecheck`
Expected: plan 測試 PASS;typecheck 此時會在 CLI 呼叫端報錯(尚未改),**這是預期**,先確認 plan 測試綠燈即可,CLI 端於 Task 4 修正前先不 commit typecheck。

> ⚠️ 因為 `plan.ts` 被 CLI 直接引用,單獨改它會讓全專案 typecheck 紅燈。為維持每個 commit 綠燈,**Task 1 與 Task 4 合併 commit**:先做完 Task 1,暫不 commit,接著做 Task 2、Task 3,最後在能整體編譯時於各 Task 末尾 commit。實作者請依「Commit 時機」小節操作。

### Commit 時機

`TagsmithConfig` 是橫切型別,改動會同時牽動 config 與 4 個 CLI 指令。為避免半完成的紅燈 commit,**Task 1–4 視為一個原子變更**:Task 1/2/3 只寫程式與測試、不 commit;到 Task 4 完成、`npm test && npm run typecheck` 全綠後,一次 commit(訊息見 Task 4 Step 末)。Task 5 起恢復每 Task 一次 commit。

---

## Task 2: `assignTagsToLines` 與 `selectLine` 純函式

**Files:**
- Create: `src/core/lines.ts`
- Test: `tests/lines.test.ts`

- [ ] **Step 1: 寫失敗測試 `tests/lines.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { assignTagsToLines, selectLine } from "../src/core/lines.js";
import type { TagLine, TagsmithConfig } from "../src/types.js";

const app: TagLine = {
  name: "app", pattern: "v{version}",
  model: { type: "semver" }, initialVersion: "0.1.0", push: false,
};
const release: TagLine = {
  name: "release", pattern: "release/{version}",
  model: { type: "calver", format: "YYYY.MM.MICRO" },
  initialVersion: "2026.06.0", push: true,
};

describe("assignTagsToLines", () => {
  it("buckets tags by their matching line", () => {
    const r = assignTagsToLines(
      ["v1.0.0", "release/2026.06.0", "v1.1.0"],
      [app, release],
    );
    expect(r.byLine.get("app")).toEqual(["v1.0.0", "v1.1.0"]);
    expect(r.byLine.get("release")).toEqual(["release/2026.06.0"]);
    expect(r.orphans).toEqual([]);
  });

  it("collects tags matching no line as orphans", () => {
    const r = assignTagsToLines(["weird-tag", "v1.0.0"], [app, release]);
    expect(r.byLine.get("app")).toEqual(["v1.0.0"]);
    expect(r.orphans).toEqual(["weird-tag"]);
  });

  it("first declared line wins when patterns overlap", () => {
    const bare: TagLine = { ...app, name: "bare", pattern: "{version}" };
    // "v1.0.0" 同時被 app(v{version}) 與 bare({version}) 命中 → app 先宣告者勝
    const r = assignTagsToLines(["v1.0.0"], [app, bare]);
    expect(r.byLine.get("app")).toEqual(["v1.0.0"]);
    expect(r.byLine.get("bare")).toEqual([]);
  });

  it("always returns an entry (possibly empty) for every line", () => {
    const r = assignTagsToLines([], [app, release]);
    expect(r.byLine.get("app")).toEqual([]);
    expect(r.byLine.get("release")).toEqual([]);
  });
});

describe("selectLine", () => {
  const config: TagsmithConfig = { lines: [app, release], default: "app" };

  it("returns the default line when no name given", () => {
    expect(selectLine(config).name).toBe("app");
  });

  it("returns the named line", () => {
    expect(selectLine(config, "release").name).toBe("release");
  });

  it("throws listing available names for an unknown line", () => {
    expect(() => selectLine(config, "nope")).toThrow(/app, release/);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- lines`
Expected: FAIL(`src/core/lines.ts` 不存在)

- [ ] **Step 3: 實作 `src/core/lines.ts`**

```ts
import type { TagLine, TagsmithConfig } from "../types.js";
import { compilePattern } from "./pattern.js";

export interface LineAssignment {
  /** 線名 → 屬於該線的原始 git tag 名(宣告順序、首條命中者勝)。 */
  byLine: Map<string, string[]>;
  /** 不被任何線命中的 tag。 */
  orphans: string[];
}

/** 把 git tag 依「宣告順序第一條命中的 pattern」歸屬到各線桶。 */
export function assignTagsToLines(
  tags: readonly string[],
  lines: readonly TagLine[],
): LineAssignment {
  const compiled = lines.map((l) => ({ name: l.name, p: compilePattern(l.pattern) }));
  const byLine = new Map<string, string[]>(lines.map((l) => [l.name, []]));
  const orphans: string[] = [];

  for (const tag of tags) {
    const hit = compiled.find((c) => c.p.extract(tag) !== null);
    if (hit) byLine.get(hit.name)!.push(tag);
    else orphans.push(tag);
  }
  return { byLine, orphans };
}

export class LineNotFoundError extends Error {}

/** 取得指定線(省略則取 default);不存在時丟出列有可用線名的錯誤。 */
export function selectLine(config: TagsmithConfig, name?: string): TagLine {
  const target = name ?? config.default;
  const line = config.lines.find((l) => l.name === target);
  if (!line) {
    const names = config.lines.map((l) => l.name).join(", ");
    throw new LineNotFoundError(
      `No tag line named "${target}". Available: ${names}`,
    );
  }
  return line;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm test -- lines`
Expected: PASS(`selectLine` 測試依賴新的 `TagsmithConfig` 形狀,於 Task 3 完成型別後才會全綠;若此時 typecheck 報 `TagsmithConfig` 形狀不符,屬預期,Task 3 修正。)

---

## Task 3: Config 層 — union schema + `normalizeConfig` + 多線型別

**Files:**
- Modify: `src/types.ts`
- Modify: `src/core/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: 改 `src/types.ts` 的 `TagsmithConfig`**

把舊的單線 `TagsmithConfig` 介面整段替換為內部多線形狀:

```ts
/** 內部正規化後的設定:一律為多線結構。 */
export interface TagsmithConfig {
  lines: TagLine[];
  /** 預設線名,正規化後一定指向有效的 line.name。 */
  default: string;
}
```

(`TagLine` 已於 Task 1 新增。)

- [ ] **Step 2: 寫失敗測試,擴充 `tests/config.test.ts`**

在檔案既有 `describe("parseConfig")` 內,把斷言改成讀正規化結果,並新增多線/正規化案例。替換既有「accepts a valid semver config」與「defaults push to false」,並新增區塊:

```ts
describe("parseConfig (legacy flat)", () => {
  it("normalises a legacy flat config into a single default line", () => {
    const cfg = parseConfig({
      pattern: "v{version}",
      model: { type: "semver", allowPrerelease: true },
      initialVersion: "0.1.0",
      push: false,
    });
    expect(cfg.lines).toHaveLength(1);
    expect(cfg.lines[0].name).toBe("default");
    expect(cfg.lines[0].pattern).toBe("v{version}");
    expect(cfg.default).toBe("default");
  });

  it("defaults legacy push to false", () => {
    const cfg = parseConfig({
      pattern: "v{version}",
      model: { type: "semver" },
      initialVersion: "0.1.0",
    });
    expect(cfg.lines[0].push).toBe(false);
  });
});

describe("parseConfig (multi-line)", () => {
  const base = {
    tags: [
      { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
      { name: "release", pattern: "release/{version}",
        model: { type: "calver", format: "YYYY.MM.MICRO" },
        initialVersion: "2026.06.0", push: true },
    ],
    default: "app",
  };

  it("parses a multi-line config", () => {
    const cfg = parseConfig(base);
    expect(cfg.lines.map((l) => l.name)).toEqual(["app", "release"]);
    expect(cfg.default).toBe("app");
    expect(cfg.lines[1].push).toBe(true);
  });

  it("defaults push to false per line", () => {
    const cfg = parseConfig(base);
    expect(cfg.lines[0].push).toBe(false);
  });

  it("defaults `default` to the first line when omitted", () => {
    const cfg = parseConfig({ tags: base.tags });
    expect(cfg.default).toBe("app");
  });

  it("rejects duplicate line names", () => {
    expect(() =>
      parseConfig({
        tags: [
          { name: "dup", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          { name: "dup", pattern: "r/{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
        ],
      }),
    ).toThrow(ConfigError);
  });

  it("rejects an empty tags array", () => {
    expect(() => parseConfig({ tags: [] })).toThrow(ConfigError);
  });

  it("rejects a default that names no line", () => {
    expect(() => parseConfig({ tags: base.tags, default: "ghost" })).toThrow(ConfigError);
  });

  it("rejects a line pattern without placeholder", () => {
    expect(() =>
      parseConfig({
        tags: [{ name: "x", pattern: "v", model: { type: "semver" }, initialVersion: "0.1.0" }],
      }),
    ).toThrow(ConfigError);
  });
});
```

> 既有「rejects a pattern without placeholder」「rejects an unknown model type」「requires calver format」等舊扁平案例**保留**(走 legacy 分支,仍應 throw)。

- [ ] **Step 3: 執行確認失敗**

Run: `npm test -- config`
Expected: FAIL(`parseConfig` 尚未回傳 `lines`/`default`)

- [ ] **Step 4: 改寫 `src/core/config.ts`**

匯入加上 `TagLine`,並重寫 schema 與 `parseConfig`:

```ts
import type { TagLine, TagsmithConfig, ModelConfig } from "../types.js";

const modelSchema = z.discriminatedUnion("type", [
  semverModelSchema,
  calverModelSchema,
  buildModelSchema,
]);

const patternSchema = z
  .string()
  .refine((p) => p.includes("{version}"), {
    message: "pattern must contain the {version} placeholder",
  });

const lineSchema = z.object({
  name: z.string().min(1),
  pattern: patternSchema,
  model: modelSchema,
  initialVersion: z.string().min(1),
  push: z.boolean().default(false),
});

const multiConfigSchema = z.object({
  tags: z.array(lineSchema).min(1),
  default: z.string().optional(),
});

const legacyConfigSchema = z.object({
  pattern: patternSchema,
  model: modelSchema,
  initialVersion: z.string().min(1),
  push: z.boolean().default(false),
});
```

把 `parseConfig` 改為:先判斷新/舊格式,解析後正規化、再做跨欄位驗證:

```ts
/** Parse, normalise and validate a raw config. Throws ConfigError on failure. */
export function parseConfig(raw: unknown): TagsmithConfig {
  const isMulti =
    typeof raw === "object" && raw !== null && "tags" in (raw as object);

  if (isMulti) {
    const result = multiConfigSchema.safeParse(raw);
    if (!result.success) throw configError(result.error);
    return finalizeMulti(result.data.tags as TagLine[], result.data.default);
  }

  const result = legacyConfigSchema.safeParse(raw);
  if (!result.success) throw configError(result.error);
  const line: TagLine = {
    name: "default",
    pattern: result.data.pattern,
    model: result.data.model as ModelConfig,
    initialVersion: result.data.initialVersion,
    push: result.data.push,
  };
  return { lines: [line], default: "default" };
}

function finalizeMulti(lines: TagLine[], def: string | undefined): TagsmithConfig {
  const names = lines.map((l) => l.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) {
    throw new ConfigError(
      `Invalid ${CONFIG_FILENAME}:\n  - tags: duplicate line name(s): ${[...new Set(dupes)].join(", ")}`,
    );
  }
  const resolvedDefault = def ?? names[0];
  if (!names.includes(resolvedDefault)) {
    throw new ConfigError(
      `Invalid ${CONFIG_FILENAME}:\n  - default: "${resolvedDefault}" does not match any line name (${names.join(", ")})`,
    );
  }
  return { lines, default: resolvedDefault };
}

function configError(error: z.ZodError): ConfigError {
  const issues = error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  return new ConfigError(`Invalid ${CONFIG_FILENAME}:\n${issues}`);
}
```

把 `writeConfig` 改為寫出檔案格式(`tags` 陣列):

```ts
export async function writeConfig(
  cwd: string,
  config: TagsmithConfig,
): Promise<void> {
  const file = configPath(cwd);
  const fileShape = {
    tags: config.lines.map((l) => ({
      name: l.name,
      pattern: l.pattern,
      model: l.model,
      initialVersion: l.initialVersion,
      push: l.push,
    })),
    default: config.default,
  };
  const body = JSON.stringify(fileShape, null, 2);
  await writeFile(file, `${body}\n`, "utf8");
}
```

> 移除舊的 `configSchema` 常數(已被上述取代)。

- [ ] **Step 5: 執行 config 測試確認通過**

Run: `npm test -- config`
Expected: PASS

---

## Task 4: 接上 CLI 各指令到多線(預設線行為)+ 整體綠燈 commit

讓 4 個指令與 init 編譯通過並走「預設線」行為(尚未加 `--tag`)。完成後 Task 1–4 一次 commit。

**Files:**
- Modify: `src/cli/next.ts`, `src/cli/create.ts`, `src/cli/list.ts`, `src/cli/check.ts`, `src/cli/init.ts`
- Test: `tests/commands.test.ts`, `tests/cli.test.ts`(視既有 fixture 調整)

- [ ] **Step 1: 改 `src/cli/next.ts`**

把載入與計算段改為選預設線 + 桶分流:

```ts
import { loadConfig, MissingConfigError } from "../core/config.js";
import { createModel } from "../core/models/index.js";
import { planNext } from "../core/plan.js";
import { assignTagsToLines, selectLine } from "../core/lines.js";
// ...
    const config = await loadConfig(cwd);
    await ensureRepo({ cwd });
    const line = selectLine(config, flags.tag);
    const model = createModel(line.model);
    const allTags = await listTags({ cwd });
    const lineTags = assignTagsToLines(allTags, config.lines).byLine.get(line.name) ?? [];
    const plan = planNext(line, model, lineTags, level);
```

`NextFlags` 介面加 `tag?: string;`。json 輸出物件加 `line: line.name`。

- [ ] **Step 2: 改 `src/cli/create.ts`**

```ts
import { assignTagsToLines, selectLine } from "../core/lines.js";
// ...
    const config = await loadConfig(cwd);
    await ensureRepo({ cwd });
    const line = selectLine(config, flags.tag);
    const model = createModel(line.model);
    const pattern = compilePattern(line.pattern);
    const allTags = await listTags({ cwd });
    const lineTags = assignTagsToLines(allTags, config.lines).byLine.get(line.name) ?? [];
```

把後續 `validateExplicit(config, ...)` 改為 `validateExplicit(line, model, flags.setVersion, lineTags, {...})`;`planNext(config, ...)` 改為 `planNext(line, model, lineTags, level)`;重複檢查改用 `lineTags.includes(tagName)`;push 預設改為 `flags.push ?? line.push`。`CreateFlags` 介面加 `tag?: string;`。

- [ ] **Step 3: 改 `src/cli/list.ts`(先維持單線:印 default 線)**

把 `createModel(config.model)` 改為:

```ts
import { assignTagsToLines, selectLine } from "../core/lines.js";
// ...
    const config = await loadConfig(cwd);
    const line = selectLine(config, flags.tag);
    const model = createModel(line.model);
    const pattern = compilePattern(line.pattern);
    const allTags = await listTags({ cwd });
    const lineTags = assignTagsToLines(allTags, config.lines).byLine.get(line.name) ?? [];
    const analysis = analyzeTags(lineTags, pattern, model);
```

`ListFlags` 介面加 `tag?: string; all?: boolean;`(`all` 於 Task 6 使用)。

- [ ] **Step 4: 改 `src/cli/check.ts`(先維持:對 default 線驗證)**

把建立 model/pattern 段改為 `selectLine(config, flags.tag)` 取得 line,再 `compilePattern(line.pattern)` 與 `createModel(line.model)`。`CheckFlags` 介面加 `tag?: string;`。跨線回報於 Task 7 補強。

- [ ] **Step 5: 改 `src/cli/init.ts` 寫出新陣列格式**

`buildFromFlags` 與 `promptForConfig` 結尾回傳改為多線形狀(單一 `default` 線):

```ts
function buildFromFlags(flags: InitFlags): TagsmithConfig {
  const modelType = (flags.model ?? "semver") as ModelConfig["type"];
  return {
    lines: [
      {
        name: "default",
        pattern: flags.pattern ?? "v{version}",
        model: defaultModel(modelType),
        initialVersion: flags.initialVersion ?? defaultInitial(modelType),
        push: flags.push ?? false,
      },
    ],
    default: "default",
  };
}
```

`promptForConfig` 的 `return { pattern, model, initialVersion, push };` 改為:

```ts
  return {
    lines: [{ name: "default", pattern, model, initialVersion, push }],
    default: "default",
  };
```

- [ ] **Step 6: 調整 CLI 測試 fixture**

`tests/commands.test.ts` / `tests/cli.test.ts` 若以舊扁平格式寫入 `.tagsmith.json`,因 legacy 相容仍可運作,**多數不需改**。若有直接斷言 `config.pattern` 等內部欄位處,改讀 `config.lines[0].pattern`。json 輸出新增 `line` 欄位的斷言可於 Task 5 補。

- [ ] **Step 7: 全測試 + 型別檢查確認綠燈**

Run: `npm test && npm run typecheck`
Expected: 全 PASS、無型別錯誤。

- [ ] **Step 8: Commit(Task 1–4 原子變更)**

```bash
git add src/types.ts src/core/plan.ts src/core/lines.ts src/core/config.ts \
        src/cli/next.ts src/cli/create.ts src/cli/list.ts src/cli/check.ts src/cli/init.ts \
        tests/plan.test.ts tests/lines.test.ts tests/config.test.ts \
        tests/commands.test.ts tests/cli.test.ts
git commit -m "feat: [core] 多 tag 線資料模型與 per-line 計算（相容舊格式）"
```

---

## Task 5: `next` / `create` 加 `-t, --tag` 選線 + json `line` 欄位

**Files:**
- Modify: `src/cli/index.ts`
- Test: `tests/commands.test.ts`

- [ ] **Step 1: 寫失敗測試(多線 next 指定線)**

在 `tests/commands.test.ts` 新增(沿用該檔既有的 temp repo / 寫 config helper 慣例;若 helper 名稱不同請對應)。以多線設定寫入 `.tagsmith.json` 後:

```ts
it("next --tag release computes on the release line", async () => {
  // 寫入多線 config:app(semver, v{version})、release(build, release/{version})
  await writeConfigFile({
    tags: [
      { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
      { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
    ],
    default: "app",
  });
  await tag("v1.0.0");
  await tag("release/7");

  const out = await runCli(["next", "--tag", "release", "--json"]);
  const json = JSON.parse(out.stdout);
  expect(json.line).toBe("release");
  expect(json.tag).toBe("release/8");
});

it("next on an unknown line errors with available names", async () => {
  await writeDefaultConfig();
  const out = await runCli(["next", "--tag", "ghost"]);
  expect(out.code).toBe(1);
  expect(out.stderr).toMatch(/Available:/);
});
```

> `writeConfigFile` / `runCli` / `tag` 請對應該測試檔既有工具函式;若無 `--json` 取 stdout 的 helper,沿用既有 `next --json` 測試的取法。

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- commands`
Expected: FAIL(`--tag` option 未註冊,commander 視為未知選項)

- [ ] **Step 3: 在 `src/cli/index.ts` 為 `next` 與 `create` 註冊 `--tag`**

`next` command 鏈加上:

```ts
  .option("-t, --tag <name>", "operate on the named tag line (default: the config's default line)")
```

`create` command 鏈同樣加上同一行 option。

- [ ] **Step 4: 執行確認通過**

Run: `npm test -- commands`
Expected: PASS(`next.ts` 已於 Task 4 讀 `flags.tag` 並輸出 `line`)

- [ ] **Step 5: Commit**

```bash
git add src/cli/index.ts tests/commands.test.ts
git commit -m "feat: [cli] next/create 支援 --tag 選線"
```

---

## Task 6: `list` 多線(`--all` / `--tag` / orphans)

**Files:**
- Modify: `src/cli/list.ts`, `src/cli/index.ts`
- Test: `tests/commands.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
it("list --all groups tags per line and surfaces orphans", async () => {
  await writeConfigFile({
    tags: [
      { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
      { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
    ],
    default: "app",
  });
  await tag("v1.0.0");
  await tag("release/3");
  await tag("legacy-tag");

  const out = await runCli(["list", "--all"]);
  expect(out.stdout).toMatch(/app/);
  expect(out.stdout).toMatch(/release/);
  expect(out.stdout).toMatch(/v1\.0\.0/);
  expect(out.stdout).toMatch(/release\/3/);
  // orphan 區
  expect(out.stdout).toMatch(/legacy-tag/);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- commands`
Expected: FAIL(`--all` 未實作)

- [ ] **Step 3: 在 `src/cli/index.ts` 為 `list` 註冊 options**

`list` command 鏈加:

```ts
  .option("-t, --tag <name>", "list only the named tag line")
  .option("--all", "list every tag line plus unassigned tags")
```

- [ ] **Step 4: 實作 `src/cli/list.ts` 的 `--all` 分支**

在 `runList` 內,於載入 config 後分流。`--all` 時迭代每條線各自 `analyzeTags`,再印 orphans;否則維持 Task 4 的單線(default 或 `--tag`)行為。骨架:

```ts
    const config = await loadConfig(cwd);
    const allTags = await listTags({ cwd });
    const assignment = assignTagsToLines(allTags, config.lines);

    if (flags.all) {
      for (const line of config.lines) {
        const model = createModel(line.model);
        const pattern = compilePattern(line.pattern);
        const lineTags = assignment.byLine.get(line.name) ?? [];
        const analysis = analyzeTags(lineTags, pattern, model);
        printLineSection(line.name, analysis, flags.json);  // 既有印 analysis 的邏輯抽成此 helper
      }
      if (assignment.orphans.length > 0) {
        printOrphans(assignment.orphans, flags.json);
      }
      return 0;
    }

    const line = selectLine(config, flags.tag);
    const model = createModel(line.model);
    const pattern = compilePattern(line.pattern);
    const lineTags = assignment.byLine.get(line.name) ?? [];
    const analysis = analyzeTags(lineTags, pattern, model);
    // ...（既有單線輸出，加上線名標頭）
```

> `printLineSection` / `printOrphans` 由現有 `runList` 印 analysis 的程式碼重構而來,維持既有色彩/`--json` 行為;`--json --all` 輸出改為 `{ lines: [{ line, conforming, anomalies }...], orphans }`。

- [ ] **Step 5: 執行確認通過**

Run: `npm test -- commands && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/list.ts src/cli/index.ts tests/commands.test.ts
git commit -m "feat: [cli] list 支援 --all 多線檢視與 orphan tag"
```

---

## Task 7: `check` 跨線回報 + `--tag`

**Files:**
- Modify: `src/cli/check.ts`, `src/cli/index.ts`
- Test: `tests/check.test.ts`

- [ ] **Step 1: 寫失敗測試 `tests/check.test.ts`**

```ts
it("check reports which line each tag belongs to", async () => {
  await writeConfigFile({
    tags: [
      { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
      { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
    ],
    default: "app",
  });
  const out = await runCli(["check", "v1.2.3", "release/9", "junk", "--json"]);
  const json = JSON.parse(out.stdout);
  // 每個受檢 tag 標示命中線或 orphan
  const byRaw = Object.fromEntries(json.results.map((r) => [r.raw, r.line]));
  expect(byRaw["v1.2.3"]).toBe("app");
  expect(byRaw["release/9"]).toBe("release");
  expect(byRaw["junk"]).toBeNull();
});

it("check --tag restricts validation to one line", async () => {
  await writeConfigFile({
    tags: [
      { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
      { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
    ],
    default: "app",
  });
  const out = await runCli(["check", "release/9", "--tag", "app", "--json"]);
  const json = JSON.parse(out.stdout);
  // 對 app 線驗證 → release/9 不符 app pattern
  expect(json.results[0].ok).toBe(false);
});
```

> 既有 `tests/check.test.ts` 的單線案例(用 legacy 設定檔)仍應通過;若其斷言形狀與新 `results` 結構不同,對應更新。

- [ ] **Step 2: 執行確認失敗**

Run: `npm test -- check`
Expected: FAIL

- [ ] **Step 3: 在 `src/cli/index.ts` 為 `check` 註冊 `--tag`**

`check` command 鏈加:

```ts
  .option("-t, --tag <name>", "validate only against the named tag line")
```

- [ ] **Step 4: 改 `src/cli/check.ts` 跨線驗證**

預設:用 `assignTagsToLines` 把受檢 tag(或全 repo tag)分流,各 tag 標示命中線(或 null = orphan),並對其所屬線的 model 做版本可解析驗證。`--tag <name>`:只對該線 `classify`/`validateExplicit`,不符即 `ok:false`。

骨架:

```ts
    const config = await loadConfig(cwd);
    const targets = tags.length > 0 ? tags : await listTags({ cwd });

    if (flags.tag) {
      const line = selectLine(config, flags.tag);
      const pattern = compilePattern(line.pattern);
      const model = createModel(line.model);
      const results = targets.map((raw) => {
        const classified = classify(raw, pattern, model);
        return { raw, line: classified.conforming ? line.name : null,
                 ok: classified.conforming, anomaly: classified.anomaly };
      });
      return emitCheck(results, flags.json);  // 既有輸出邏輯抽成 helper
    }

    const assignment = assignTagsToLines(targets, config.lines);
    const lineByName = new Map(config.lines.map((l) => [l.name, l]));
    const results = targets.map((raw) => {
      const owner = config.lines.find(
        (l) => compilePattern(l.pattern).extract(raw) !== null,
      );
      if (!owner) return { raw, line: null, ok: false, anomaly: "pattern-mismatch" };
      const model = createModel(owner.model);
      const c = classify(raw, compilePattern(owner.pattern), model);
      return { raw, line: owner.name, ok: c.conforming, anomaly: c.anomaly };
    });
    return emitCheck(results, flags.json);
```

> `classify` 由 `src/core/analyze.ts` 匯出(已是 export)。`emitCheck` 由現有 check 輸出邏輯重構,維持 `--json` 與人類可讀輸出;`--json` 形狀為 `{ results: [{ raw, line, ok, anomaly }] }`,exit code:任一 `ok:false` → 1。

- [ ] **Step 5: 執行確認通過**

Run: `npm test -- check && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/check.ts src/cli/index.ts tests/check.test.ts
git commit -m "feat: [cli] check 跨線回報與 --tag 限定"
```

---

## Task 8: help 文案、整合測試與覆蓋率

**Files:**
- Modify: `src/cli/index.ts`(help 範例)
- Test: `tests/integration.test.ts`
- Test: `tests/cli.test.ts`

- [ ] **Step 1: 補 help 範例**

在 `program.addHelpText("after", ...)` 的 Examples 區塊加一行:

```
  $ tagsmith next --tag release            Compute next on a named tag line
```

`create` 的 `addHelpText` 也加一行 `--tag` 範例。

- [ ] **Step 2: 寫整合測試(舊格式回歸 + 多線端到端)**

在 `tests/integration.test.ts` 新增:

```ts
it("legacy flat config still drives next → create unchanged", async () => {
  await writeRawConfig({
    pattern: "v{version}",
    model: { type: "semver" },
    initialVersion: "0.1.0",
    push: false,
  });
  await tag("v1.0.0");
  const next = await runCli(["next", "--json"]);
  expect(JSON.parse(next.stdout).tag).toBe("v1.0.1");
  await runCli(["create"]);
  expect(await listRepoTags()).toContain("v1.0.1");
});

it("two lines bump independently end-to-end", async () => {
  await writeConfigFile({
    tags: [
      { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
      { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
    ],
    default: "app",
  });
  await tag("v1.0.0");
  await tag("release/5");

  await runCli(["create", "--tag", "release"]);   // build line → release/6
  await runCli(["create"]);                        // default app → v1.0.1

  const repoTags = await listRepoTags();
  expect(repoTags).toContain("release/6");
  expect(repoTags).toContain("v1.0.1");
});
```

> `writeRawConfig` / `writeConfigFile` / `runCli` / `tag` / `listRepoTags` 對應該檔既有 helper;若 `integration.test.ts` 需先 `npm run build`(E2E 跑 dist),沿用該檔既有前置步驟。

- [ ] **Step 3: 執行全部測試**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 4: 覆蓋率確認 ≥ 80%**

Run: `npm run coverage`
Expected: 全域覆蓋率門檻通過(≥80%);若 `lines.ts` / `config.ts` 新分支未覆蓋到,補對應單元測試。

- [ ] **Step 5: 型別檢查 + 建置**

Run: `npm run typecheck && npm run build`
Expected: 無錯誤(E2E 前置)

- [ ] **Step 6: Commit**

```bash
git add src/cli/index.ts tests/integration.test.ts tests/cli.test.ts
git commit -m "feat: [cli] 多 tag 線 help 範例與整合測試"
```

---

## Task 9: 文件更新

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`(專案指引,如有設定檔格式說明)
- Modify: `CONTRIBUTING.md`(如有「新增模型/設定」說明)

- [ ] **Step 1: README 補多線設定範例與 `--tag` 用法**

加入新陣列格式範例、`--tag` / `--all` 說明,並註明舊扁平格式仍相容。

- [ ] **Step 2: 更新 `CLAUDE.md` 已知事項**

於設定檔說明處註明:內部一律正規化為 `{ lines, default }`;舊扁平格式自動視為單一 `default` 線;跨線歸屬為「宣告順序先者勝」。

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md CONTRIBUTING.md
git commit -m "docs: 多 tag 線設定格式與 CLI 用法"
```

---

## Self-Review 註記

- **Spec 覆蓋**:設定格式(Task 3)、正規化/相容(Task 3)、`TagLine` 與 core per-line(Task 1)、`assignTagsToLines` 與 tie-break(Task 2)、anomaly 語意(Task 2 orphans + Task 6/7 呈現)、CLI `--tag`/`--all`/跨線 check(Task 5–7)、init 新格式(Task 4)、測試與覆蓋率(Task 8)、文件(Task 9)。皆有對應 Task。
- **型別一致**:`TagLine` / `TagsmithConfig{lines,default}` / `assignTagsToLines→{byLine,orphans}` / `selectLine` 跨 Task 命名一致。
- **綠燈策略**:Task 1–4 為原子變更(中途不 commit),其後每 Task 綠燈即 commit。
- **YAGNI**:不做互動式加多線、不做 `migrate` 指令、不做跨線版本連動(spec 非目標)。
