# Repository agent guidance

## Graft usage

For repository orientation, feature discovery, cross-file changes,
dependency analysis, and refactoring:

- Use `graft_repo_map` before exploring an unfamiliar area.
- Use `graft_find_code` before broad manual file searches.
- Use `graft_file_api` before reading an entire large file.
- Use `graft_trace_calls` before changing public symbols or contracts.
- Use `graft_find_all` when exhaustive matching is required.
- Run `graft_check_freshness` after code changes.
- Fall back to native file search when Graft results are incomplete.

## Releases

When the user asks to **formally release** (for example, 「正式發佈」) a
version, treat the release as incomplete until all of the following are done:

1. Confirm the intended version is merged into `main` and the relevant CI checks
   have passed.
2. Create and push an annotated Git tag for that version.
3. Create a published GitHub Release for the same tag, with notes derived from
   the matching `CHANGELOG.md` entry.
4. Publish the same version to npm with `npm publish`. This step is
   irreversible — a published version cannot be replaced, and unpublishing is
   restricted — so ask the user for explicit confirmation immediately before
   running it, and never run it as an inferred part of another task.
5. Mark the version as released in `ROADMAP.zh-TW.md`.
6. Verify and report the tag URL, the GitHub Release URL, and the published npm
   version.

Create only a Git tag when the user explicitly requests 「只打 tag」 (tag only).
