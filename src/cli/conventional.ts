import {
  recommendConventionalBump,
  type BumpRecommendation,
} from "../core/conventional.js";
import { listCommitMessages } from "../git/git.js";
import type { TagLine } from "../types.js";

/**
 * Resolve a SemVer bump from commits since a tag. The CLI layer owns Git IO;
 * the Conventional Commit interpretation remains pure in core.
 */
export async function recommendBumpFromCommits(
  cwd: string,
  line: TagLine,
  latestTag: string | null,
): Promise<BumpRecommendation> {
  if (line.model.type !== "semver") {
    throw new Error("--from-commits is supported only for semver tag lines.");
  }
  const recommendation = recommendConventionalBump(
    await listCommitMessages({
      cwd,
      from: latestTag ?? undefined,
      workspace: line.workspace,
    }),
  );
  if (recommendation.level === null) {
    throw new Error(
      "No release-worthy Conventional Commits found since the latest tag.",
    );
  }
  return recommendation;
}
