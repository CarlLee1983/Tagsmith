import {
  recommendConventionalBump,
  type BumpRecommendation,
} from "../core/conventional.js";
import { listCommitMessages } from "../git/git.js";
import type { CommitPolicy, TagLine } from "../types.js";
import { info } from "./ui.js";

/**
 * Resolve a SemVer bump from commits since a tag. The CLI layer owns Git IO;
 * the Conventional Commit interpretation remains pure in core.
 */
export async function recommendBumpFromCommits(
  cwd: string,
  line: TagLine,
  latestTag: string | null,
  policy?: CommitPolicy,
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
    policy,
  );
  if (recommendation.level === null) {
    throw new Error(
      "No release-worthy Conventional Commits found since the latest tag.",
    );
  }
  return recommendation;
}

/** Show recommendation evidence without making callers decode commit rules themselves. */
export function printBumpRecommendation(recommendation: BumpRecommendation): void {
  info(
    `Conventional Commits recommend a ${recommendation.level} release (${recommendation.reasons.length} matching commit(s)).`,
  );
  for (const reason of recommendation.reasons) {
    info(`  ${reason.id.slice(0, 12)} [${reason.rule}] ${reason.level}: ${reason.summary}`);
  }
}
