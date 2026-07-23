# Repository agent guidance

## Releases

When the user asks to **formally release** (for example, 「正式發佈」) a
version, treat the release as incomplete until all of the following are done:

1. Confirm the intended version is merged into `main` and the relevant CI checks
   have passed.
2. Create and push an annotated Git tag for that version.
3. Create a published GitHub Release for the same tag, with notes derived from
   the matching `CHANGELOG.md` entry.
4. Verify and report both the tag and GitHub Release URLs.

Create only a Git tag when the user explicitly requests 「只打 tag」 (tag only).
