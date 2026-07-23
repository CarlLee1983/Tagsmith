import { hasWorkspaceChanges } from "../git/git.js";
import type { TagLine } from "../types.js";

/** Block a release when its configured monorepo workspace has not changed. */
export async function requireWorkspaceChanges(
  cwd: string,
  line: TagLine,
  latestTag: string | null,
): Promise<void> {
  if (line.workspace === undefined) {
    throw new Error(
      `Tag line "${line.name}" has no workspace. Add a repository-relative workspace path before using --require-changes.`,
    );
  }
  if (await hasWorkspaceChanges({ cwd, workspace: line.workspace, since: latestTag })) {
    return;
  }
  throw new Error(
    `No changes in workspace "${line.workspace}" since ${latestTag ?? "the start of history"}.`,
  );
}
