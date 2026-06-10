# Tagsmith

定義專案的 git tag 規格、檢視現有 tag，並安全地產生下一個 git tag——避免順序錯亂或格式不一致。

支援 **SemVer**、**CalVer** 與 **build number** 三種版本模型，tag 樣式可自訂（例如 `v{version}`、`release/{version}`）。

## 安裝

```bash
npm install -g tagsmith
# 或免安裝直接執行
npx tagsmith <command>
```

## 快速開始

```bash
# 1. 在 repo 內定義 tag 規格（互動式）
tagsmith init

# 2. 檢視現有 tag（依語義排序、標示異常）
tagsmith list

# 3. 預覽下一個 tag（不建立）
tagsmith next --level minor

# 4. 建立 tag（自動驗證格式與順序）
tagsmith create --level minor -m "Release 1.2.0" --push
```

## 設定檔 `.tagsmith.json`

`tagsmith init` 會在 repo 根目錄產生設定檔：

```jsonc
{
  "pattern": "v{version}",        // 必含 {version} 佔位符
  "model": {
    "type": "semver",             // "semver" | "calver" | "build"
    "allowPrerelease": true
  },
  "initialVersion": "0.1.0",      // 無既有 tag 時的起點
  "push": false                   // create 是否預設 push
}
```

### 版本模型

| 模型 | 範例 | 設定 | 遞增規則 |
|------|------|------|----------|
| `semver` | `1.2.3`、`1.2.3-rc.1` | `allowPrerelease` | `--level major/minor/patch/prerelease` |
| `calver` | `2026.06.0` | `format`（`YYYY YY MM DD MICRO`） | 滾動到當天；同日遞增 `MICRO` |
| `build` | `0042` | `padding`（補零位數） | 單調 +1 |

## 指令

### `tagsmith init`
互動式產生 `.tagsmith.json`。
旗標：`--pattern`、`--model`、`--initial-version`、`--push`、`--force`、`-y/--yes`（非互動）。

### `tagsmith list` (`ls`)
列出所有 git tag，對規格解析後依版本由新到舊排序，並標示**不符格式**、**版本無法解析**、**重複版本**的異常 tag。
旗標：`--json`、`--all`。

### `tagsmith next`
計算並印出下一個 tag，不實際建立。保證結果嚴格大於目前最大合規版本。
旗標：`--level <major|minor|patch|prerelease|auto>`（預設 `patch`）、`--json`。

### `tagsmith create`
建立下一個（或以 `--set-version` 指定的）tag。建立前驗證：格式符合 pattern、版本可解析、嚴格遞增、tag 不重複。
旗標：`--level`、`--set-version <version>`、`-m/--message`（annotated tag）、`--push`、`--dry-run`、`--allow-out-of-order`。

## 設計

三層架構，各自可獨立測試：

- `core/` — 純函式（pattern、版本模型、analyze、plan、config 驗證），不碰 IO。
- `git/` — `git` 指令薄封裝。
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

## License

MIT
