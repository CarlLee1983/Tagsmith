# Validate git tags with Husky

Use a Husky `pre-push` hook to run `tagsmith check` whenever a push includes one
or more tags. Invalid tags are rejected before they reach the remote.

> [繁體中文版](husky-pre-push.zh-TW.md)

## Prerequisites

- A `.tagsmith.json` created with `tagsmith init`, or the zero-config SemVer mode.
- [`@carllee1983/tagsmith`](https://www.npmjs.com/package/@carllee1983/tagsmith)
  installed globally or as a project dev dependency.

## Install (Husky v9+)

```bash
npm install -D @carllee1983/tagsmith husky
npx husky init
```

Replace `.husky/pre-push` with:

```sh
# Validate every tag included in this push.
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

If the project does not install Tagsmith as a dev dependency, use
`npx @carllee1983/tagsmith check $tags` instead.

## Behaviour

- The hook runs only when the push includes a `refs/tags/*` ref; branch-only
  pushes continue normally.
- Git represents a deleted tag as `(delete)`, not `refs/tags/*`, so deletion
  does not run this check.
- A tag with a bad pattern, an unparseable version, or a duplicate version makes
  `tagsmith check` exit non-zero and Husky aborts the push.

## Verify

```bash
git tag bad-format
git push origin bad-format   # Husky should reject this push
git tag -d bad-format
```
