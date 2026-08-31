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

1. Complete the version, `CHANGELOG.md`, and `ROADMAP.zh-TW.md` updates in a
   release-preparation commit.
2. Confirm that exact commit is merged into `main` and the relevant CI checks
   have passed.
3. Create and push an annotated Git tag for that exact commit.
4. From a clean checkout of the tag, create the GitHub Release with notes from
   the matching `CHANGELOG.md` entry and prepare the npm package.
5. Publish the same version to npm with `npm publish`. This step is
   irreversible — a published version cannot be replaced, and unpublishing is
   restricted — so ask the user for explicit confirmation immediately before
   running it, and never run it as an inferred part of another task.
6. Verify and report the Git tag commit, GitHub Release URL, npm version,
   package `gitHead`, and provenance. The tag commit and npm `gitHead` must
   match the release-preparation commit.

Create only a Git tag when the user explicitly requests 「只打 tag」 (tag only).
