# 搭配 husky 守 git tag

用 [husky](https://typicode.github.io/husky/) 的 `pre-push` hook，在推送含 tag 時
自動以 `tagsmith check` 驗證，擋下不符規格的 tag。

## 前置

專案已用 `tagsmith init` 建立 `.tagsmith.json`，且已安裝 tagsmith（本機或專案相依）。

## 安裝步驟（husky v9+）

```bash
npm i -D husky
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
