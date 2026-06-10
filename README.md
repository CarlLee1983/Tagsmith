# Tagsmith

定義專案的 git tag 規格、檢視現有 tag，並安全地產生下一個 git tag——避免順序錯亂或格式不一致。

支援 **SemVer**、**CalVer** 與 **build number** 三種版本模型，tag 樣式可自訂（例如 `v{version}`、`release/{version}`）。

- 🏷️ **規格化** — 用一個 `.tagsmith.json` 定義全專案的 tag 樣式與版本模型
- 🔍 **可檢視** — 依語義排序列出 tag，標示格式 / 順序 / 重複異常
- 🛡️ **防呆** — 建立前驗證格式、版本可解析、嚴格遞增、tag 不重複
- 🧩 **可擴充** — 版本模型走介面抽象，新增不動核心邏輯

## 安裝

```bash
npm install -g tagsmith
# 或免安裝直接執行
npx tagsmith <command>
```

需求：Node.js ≥ 18、git。

## 快速開始

```bash
# 1. 在 repo 內定義 tag 規格（互動式）
tagsmith init

# 不熟指令？走一次互動式導覽
tagsmith guide

# 2. 檢視現有 tag（依語義排序、標示異常）
tagsmith list

# 3. 預覽下一個 tag（不建立）
tagsmith next --level minor

# 4. 建立 tag（自動驗證格式與順序）
tagsmith create --level minor -m "Release 1.2.0" --push
```

## 設定檔 `.tagsmith.json`

`tagsmith init` 會在 repo 根目錄產生設定檔。欄位：

| 欄位 | 必填 | 說明 |
|------|:---:|------|
| `pattern` | ✓ | tag 樣式，**必含** `{version}` 佔位符。例：`v{version}`、`release/{version}`、`{version}-stable` |
| `model` | ✓ | 版本模型物件（見下） |
| `initialVersion` | ✓ | 無既有合規 tag 時的起點 |
| `push` | | `create` 是否預設 push（預設 `false`） |

可在檔案加上 `"$schema": "./node_modules/tagsmith/schema.json"` 取得編輯器補全與驗證。

### 三種版本模型

| 模型 | 範例 | 專屬設定 | 遞增規則 |
|------|------|----------|----------|
| `semver` | `1.2.3`、`1.2.3-rc.1` | `allowPrerelease`（預設 `true`） | `--level major/minor/patch/prerelease` |
| `calver` | `2026.06.0` | `format`（token：`YYYY YY MM DD MICRO`） | 滾動到當天；同日遞增 `MICRO` |
| `build` | `0042` | `padding`（補零位數，預設 `0`） | 單調 +1 |

<details>
<summary>各模型設定範例</summary>

**SemVer**（`v1.2.3`）

```json
{
  "pattern": "v{version}",
  "model": { "type": "semver", "allowPrerelease": true },
  "initialVersion": "0.1.0",
  "push": false
}
```

**CalVer**（`release/2026.06.0`，token 之間需有分隔字元或固定寬度）

```json
{
  "pattern": "release/{version}",
  "model": { "type": "calver", "format": "YYYY.MM.MICRO" },
  "initialVersion": "2026.06.0",
  "push": false
}
```

**Build number**（`build-0042`）

```json
{
  "pattern": "build-{version}",
  "model": { "type": "build", "padding": 4 },
  "initialVersion": "1",
  "push": false
}
```

</details>

> **CalVer `format` 注意**：可解析的數字寬度固定——`YYYY`=4 碼、`YY`/`MM`/`DD`=2 碼、
> `MICRO` 不限。未補零（如 `2026.6.0`）或含前導零的 `MICRO`（如 `...007`）會被視為
> **非合規**，以避免假冒或重複正規 tag。

## 指令

### `tagsmith init`
互動式產生 `.tagsmith.json`。

| 旗標 | 說明 |
|------|------|
| `--pattern <pattern>` | tag 樣式 |
| `--model <type>` | `semver` \| `calver` \| `build` |
| `--initial-version <version>` | 初始版本 |
| `--push` | 預設 push |
| `--force` | 覆寫既有設定檔 |
| `-y, --yes` | 非互動，使用旗標 / 預設值 |

### `tagsmith list` (`ls`)
列出所有 git tag，依規格解析後由新到舊排序，並標示異常 tag：
**不符樣式**（`pattern-mismatch`）、**版本無法解析**（`unparseable-version`）、
**重複版本**（`duplicate-version`）。

| 旗標 | 說明 |
|------|------|
| `--json` | 輸出結構化 JSON |

```jsonc
// tagsmith list --json
{
  "conforming": [
    { "tag": "v1.2.0", "version": "1.2.0" },
    { "tag": "v1.1.0", "version": "1.1.0" }
  ],
  "anomalies": [
    { "tag": "nightly", "reason": "pattern-mismatch" }
  ],
  "latest": "v1.2.0"
}
```

### `tagsmith next`
計算並印出下一個 tag，**不**實際建立。保證結果嚴格大於目前最大合規版本；
無既有合規 tag 時改用 `initialVersion`。

| 旗標 | 說明 |
|------|------|
| `-l, --level <level>` | `major` \| `minor` \| `patch` \| `prerelease` \| `auto`（預設 `patch`） |
| `--json` | 輸出 JSON |

```jsonc
// tagsmith next --level minor --json
{ "tag": "v1.3.0", "version": "1.3.0", "fromVersion": "1.2.0", "fresh": false }
```

### `tagsmith create`
建立下一個（或以 `--set-version` 指定的）tag。建立前驗證：格式符合 pattern、
版本可解析、嚴格遞增、tag 不重複。

| 旗標 | 說明 |
|------|------|
| `-l, --level <level>` | 遞增等級（同 `next`） |
| `--set-version <version>` | 改用指定版本，而非自動遞增 |
| `-m, --message <message>` | 建立 annotated tag |
| `--push` | 建立後推送（覆寫設定檔 `push`） |
| `--dry-run` | 只預覽，不建立 |
| `--allow-out-of-order` | 允許版本不大於現有最大值 |

## 常見情境

```bash
# 發佈 patch 並推送
tagsmith create --push

# 發佈帶 annotation 的 minor release
tagsmith create -l minor -m "新增登入 API"

# CI 中取得下一個 tag 字串
NEXT=$(tagsmith next --json | jq -r .tag)

# 補一個歷史版本（明知順序在後）
tagsmith create --set-version 1.0.5 --allow-out-of-order

# 先看會發生什麼，不動 repo
tagsmith create -l major --dry-run
```

## 結束代碼

| 代碼 | 意義 |
|:---:|------|
| `0` | 成功（含 `--dry-run`） |
| `1` | 失敗：缺設定檔、非 git repo、驗證未通過、git 指令錯誤等（訊息走 stderr） |

## 設計

三層架構，各自可獨立測試：

- `core/` — 純函式（pattern、版本模型、analyze、plan、config 驗證），不碰 IO，時鐘由外部注入。
- `git/` — `git` 指令薄封裝（`execFile`，陣列參數、無 shell）。
- `cli/` — commander 指令組裝與輸出。

詳見 [設計文件](docs/superpowers/specs/2026-06-10-tagsmith-design.md)。

## 開發

```bash
npm install
npm test          # 跑全部測試（vitest）
npm run coverage  # 覆蓋率（門檻 80%）
npm run build     # 編譯到 dist/
npm run dev -- <command>   # 以 tsx 直接執行原始碼
```

貢獻流程、新增版本模型的步驟見 [CONTRIBUTING.md](CONTRIBUTING.md)；
版本紀錄見 [CHANGELOG.md](CHANGELOG.md)。

## License

[MIT](LICENSE) © 2026 carl
