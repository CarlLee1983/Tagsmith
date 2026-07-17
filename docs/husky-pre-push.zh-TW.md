# 搭配 husky 守 git tag

[English version](husky-pre-push.md)

用 [husky](https://typicode.github.io/husky/) 的 `pre-push` hook，在推送含 tag 時
自動以 `tagsmith check` 驗證，擋下不符規格的 tag。

## 前置

- 專案已用 `tagsmith init` 建立 `.tagsmith.json`（或使用 zero-config semver 模式）
- 已安裝 [`@carllee1983/tagsmith`](https://www.npmjs.com/package/@carllee1983/tagsmith)（本機全域或專案 devDependency）

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

> 若專案未安裝 devDependency，可改為 `npx @carllee1983/tagsmith check $tags`。

## 行為說明

- 僅在推送內容包含 tag（`refs/tags/*`）時觸發；純 branch 推送直接放行。
- 刪除 tag 時 git 傳入的 local ref 為 `(delete)`（非 `refs/tags/*`），因此不會觸發檢查。
- 任一 tag 不符 pattern、版本不可解析、或與既有 tag 重複版本時，`tagsmith check`
  回非零 exit code，husky 即中止 push。

## 驗證

```bash
git tag bad-format
git push origin bad-format   # 應被 hook 擋下
git tag -d bad-format
```
