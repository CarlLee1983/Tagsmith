# 設計:Tagsmith 多 tag 線支援

- **日期**:2026-06-10
- **狀態**:已核准,待寫實作計畫
- **目標**:讓單一專案在一份 `.tagsmith.json` 中定義多條獨立的 tag 線,各自有自己的版本模型(semver / calver / build),彼此獨立遞增。預設為單一 semver 主線。

## 1. 背景與動機

目前 `.tagsmith.json` 只能定義**一條** tag 規格(扁平的 `pattern` + `model` + `initialVersion` + `push`)。實務上同一個 repo 常需要多條獨立的 tag 線,例如:

- `v{version}` → semver,給程式發佈
- `release/{version}` → calver,給對外 release

兩條線各自獨立遞增、各自計算 next、各自維持安全不變式。本設計新增「多線」能力,同時完全相容既有的單線設定檔。

### 需求釐清結論

| 議題 | 決定 |
|------|------|
| 多線語意 | **A**:多條獨立 tag 線,各自有版本模型(非「多種可接受格式共用一條版本流」) |
| 線的選擇 | 具名(`name`)+ 預設線(`default`) |
| 舊格式 | 相容;載入時正規化為多線結構 |
| `initialVersion` | per-line |
| `push` | per-line(無全域預設) |
| `init` 行為 | 只寫單一 semver 預設線;多線靠手動編輯(互動式加多線為未來範圍) |
| pattern 重疊 tie-break | 宣告順序先者勝(不報錯) |

## 2. 設定檔格式(對外)

### 2.1 新格式

```jsonc
{
  "tags": [
    {
      "name": "app",
      "pattern": "v{version}",
      "model": { "type": "semver", "allowPrerelease": true },
      "initialVersion": "0.1.0",
      "push": false
    },
    {
      "name": "release",
      "pattern": "release/{version}",
      "model": { "type": "calver", "format": "YYYY.MM.MICRO" },
      "initialVersion": "2026.06.0",
      "push": true
    }
  ],
  "default": "app"
}
```

欄位規則:

- **`tags`**:陣列,至少一個元素。每個元素為一條「tag 線」。
  - `name`:必填,非空字串,全陣列唯一。
  - `pattern`:必填,須含且僅含一個 `{version}` placeholder(沿用 `compilePattern` 規則)。
  - `model`:必填,`semver | calver | build` 的 discriminated union(沿用既有 model schema)。
  - `initialVersion`:必填,非空字串(無對應 tag 時的起始版本)。
  - `push`:選填,boolean,省略視為 `false`。
- **`default`**:選填,字串,須對應某條線的 `name`。**省略時取 `tags[0].name`**。

### 2.2 舊格式(相容)

既有扁平格式維持可載入:

```jsonc
{
  "pattern": "v{version}",
  "model": { "type": "semver", "allowPrerelease": true },
  "initialVersion": "0.1.0",
  "push": false
}
```

載入時正規化為:

```jsonc
{
  "tags": [
    { "name": "default", "pattern": "v{version}",
      "model": { "type": "semver", "allowPrerelease": true },
      "initialVersion": "0.1.0", "push": false }
  ],
  "default": "default"
}
```

使用者的舊檔**零修改**即可繼續運作。

### 2.3 `init` 產出

`init`(互動式與 `-y` 非互動式)維持只詢問/寫出**單一條 semver 線**,但採用新陣列格式:

```jsonc
{
  "tags": [
    { "name": "default", "pattern": "v{version}",
      "model": { "type": "semver", "allowPrerelease": true },
      "initialVersion": "0.1.0", "push": false }
  ],
  "default": "default"
}
```

多線目前靠手動編輯設定檔新增。互動式加多線列為未來增強,不在本次範圍。

## 3. 內部型別(正規化後)

核心邏輯一律操作正規化後的結構,不直接碰新/舊原始格式:

```ts
interface TagLine {
  name: string;
  pattern: string;
  model: ModelConfig;
  initialVersion: string;
  push: boolean;          // 正規化後一定有值(省略補 false)
}

interface TagsmithConfig {  // 內部正規化形狀
  lines: TagLine[];
  default: string;          // 正規化後一定指向有效 name
}
```

> 註:`TagsmithConfig` 介面語意由「單線」改為「多線」。這是內部型別變更,所有 consumer 一併調整。

## 4. Config 層改動(`src/core/config.ts` / `src/types.ts`)

1. zod schema 用 `z.union` 區分:
   - **新 schema**:`{ tags: [...], default?: string }`
   - **舊 schema**:既有扁平 `{ pattern, model, initialVersion, push }`
2. 新增 `normalizeConfig(raw)`:解析後收斂成內部 `TagsmithConfig`:
   - 舊格式 → 包成單線(`name: "default"`)。
   - 新格式 → `push` 省略補 `false`;`default` 省略補 `tags[0].name`。
3. 驗證(`parseConfig` / `normalizeConfig` 內):
   - `tags` 至少一條。
   - `name` 唯一、非空。
   - `default`(若指定)須對應存在的 `name`。
   - 每條 `pattern` 含且僅含一個 `{version}`(交給 `compilePattern` 或 schema refine)。
   - 失敗時沿用既有 `ConfigError` 風格,逐項列出 `issues`。
4. `loadConfig` 回傳型別改為正規化後的 `TagsmithConfig`;`MissingConfigError` 行為不變。
5. `writeConfig` 寫出新陣列格式。

## 5. Core 層改動(每條線獨立)

### 5.1 函式簽章:由「整個 config」改為「單一 TagLine」

- `planNext(line: TagLine, model, lineTags, level)` — 只在該線桶內計算 next。
- `validateExplicit(line: TagLine, model, explicitVersion, lineTags, opts)` — 只在該線桶內驗證。
- `analyzeTags(lineTags, pattern, model)` — 維持簽章,但輸入只給該線桶內的 tag。

三層分離與「core 零 IO / 零時鐘」鐵則不變;`now` 仍由 `createModel` 工廠注入。

### 5.2 跨線歸屬:`assignTagsToLines`

新增純函式(放 `src/core/lines.ts` 或 `analyze.ts`):

```ts
interface LineAssignment {
  byLine: Map<string, string[]>;   // name → 屬於該線的原始 tag 名
  orphans: string[];               // 無任何線命中的 tag
}

function assignTagsToLines(tags: readonly string[], lines: readonly TagLine[]): LineAssignment;
```

規則:

- 對每個 git tag,依 `lines` **宣告順序**找第一條 `compilePattern(line.pattern).extract(tag) !== null` 的線,歸入該線桶。
- 多線 pattern 重疊時:**先宣告者勝**(tie-break),不報錯。
- 不命中任何線 → 進 `orphans`。

### 5.3 anomaly 語意修正(重要回歸點)

目前 `analyzeTags` 對「pattern 不符」的 tag 標 `pattern-mismatch` anomaly。多線下:

- 分析線 L 時,**只看 L 桶內的 tag**。屬於別條線的 tag 不會進到 L 的輸入,因此**不再被誤報為 L 的 anomaly**。
- 真正的 anomaly 來源:
  - 線桶內「matched pattern 但版本無法解析」→ `unparseable-version`(不變)。
  - 線桶內「版本重複」→ `duplicate-version`(不變,per-line 判定)。
  - `orphans`(無任何線命中)→ 在 `list --all` / `check` 以「無主 tag」呈現(取代舊的全域 pattern-mismatch 概念)。

### 5.4 安全不變式(維持,per-line)

`plan.ts` 的核心保證**完全保留**,只是判定範圍縮到單線桶內:

- 格式符合該線 pattern。
- 版本可由該線 model 解析。
- 嚴格遞增(`PlanError` 邏輯不變)。
- 不與該線既有 tag 重複。

CalVer 相鄰 token、round-trip 檢查、build number 精度等既知陷阱不受影響(屬 model 層,未改動)。

## 6. CLI 層改動

### 6.1 選線語法

統一以 `-t, --tag <name>` 選線(不用位置參數,避免與 `check [tags...]` 衝突):

| 指令 | 行為 |
|------|------|
| `tagsmith next` | 操作 `default` 線;`--tag <name>` 指定線 |
| `tagsmith create` | 同上;`push` 預設取**該線**的 per-line 設定(`--push` 仍可覆寫) |
| `tagsmith list` | 預設只印 `default` 線;`--all` 印全部(分線分組)+ 無主 tag 區;`--tag <name>` 指定單線 |
| `tagsmith check [tags...]` | 對**所有線**驗證,回報每個 tag 命中哪條線(或無主);`--tag <name>` 限定單線 |

### 6.2 共同行為

- `--tag <name>` 指定不存在的線 → 報錯並列出可用線名,exit 1。
- 各指令載入 config → 取得正規化 `lines` → 用 `assignTagsToLines` 取得該線桶 → 對單線跑 core 函式。
- `--json` 輸出新增 `line` 欄位標示來源線名(`next`/`create`/`list`/`check` 一致)。
- guidance / hints 文案沿用,必要時補上 `--tag` 用法。

### 6.3 `index.ts` commander 接線

- `next` / `create` / `list` 新增 `-t, --tag <name>` option。
- `check` 新增 `-t, --tag <name>` option(與 `[tags...]` 位置參數並存)。
- help 範例補一條多線用法,如 `$ tagsmith next --tag release`。

## 7. 測試策略

維持覆蓋率 ≥ 80%。

### 新增

- **`normalizeConfig`**:新格式、舊格式、缺 `default`(取 tags[0])、重複 `name`、空 `tags`、`default` 指向不存在 name。
- **`assignTagsToLines`**:單線命中、多線分流、pattern 重疊先者勝、orphans。
- **anomaly 語意**:別條線的 tag 不被誤報為某線 anomaly;orphan 正確歸類。

### 既有改寫(回歸保護)

- core 既有測試改為傳單一 `TagLine`,斷言行為不變。
- 舊格式設定檔載入後行為等同改版前單線。

### CLI / E2E

- 多線 `next` / `create`(per-line push)/ `list --all` / `check` 跨線回報。
- `--tag` 不存在的錯誤路徑。
- 舊格式設定檔走完整 `next` → `create` 流程不變。

## 8. 影響檔案清單(預估)

- `src/types.ts` — `TagsmithConfig` 改多線;新增 `TagLine`。
- `src/core/config.ts` — union schema + `normalizeConfig` + 驗證。
- `src/core/lines.ts`(新)— `assignTagsToLines`。
- `src/core/analyze.ts` — 輸入語意調整(單線桶)。
- `src/core/plan.ts` — `planNext` / `validateExplicit` 改吃 `TagLine`。
- `src/cli/index.ts` — `--tag` options + help。
- `src/cli/next.ts` / `create.ts` / `list.ts` / `check.ts` — 選線 + 桶分流 + `line` 欄位。
- `src/cli/init.ts` — 寫出新陣列格式(單線)。
- 對應 `*.test.ts`。

## 9. 非目標(YAGNI)

- 互動式 `init` 新增多條線(未來增強)。
- `tagsmith migrate` 指令(相容載入已足夠,不需要)。
- 跨線的全域版本協調 / 連動(各線完全獨立)。
- 線的 rename / remove 專用指令(手動編輯設定檔即可)。
