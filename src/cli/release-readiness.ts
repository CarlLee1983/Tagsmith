import type { ReleasePolicy } from "../types.js";
import {
  evaluateReleaseReadiness,
  type ReleaseCandidate,
  type ReleaseReadiness,
  type ReleaseReadinessFacts,
} from "../core/release-policy/validate.js";
import { currentBranch, isWorktreeClean, revParse } from "../git/git.js";
import { info } from "./ui.js";

export interface RepositoryReleaseReadiness extends ReleaseReadiness {
  facts: ReleaseReadinessFacts;
}

/** Collect Git facts once, then hand policy interpretation to the pure core. */
export async function inspectReleaseReadiness(
  cwd: string,
  policy: ReleasePolicy | undefined,
  candidate?: ReleaseCandidate,
  remote?: { checked: boolean; name?: string },
): Promise<RepositoryReleaseReadiness> {
  const [branch, worktreeClean, head] = await Promise.all([
    currentBranch({ cwd }),
    isWorktreeClean({ cwd }),
    revParse({ cwd }, "HEAD"),
  ]);
  const facts = {
    branch,
    worktreeClean,
    head,
    ...(candidate ? { candidate } : {}),
    ...(remote ? { remote } : {}),
  };
  return { ...evaluateReleaseReadiness(policy, facts), facts };
}

/** Render policy checks consistently for audit and create preflight. */
export function printReleaseReadiness(readiness: ReleaseReadiness): void {
  if (!readiness.enabled) {
    info("Release policy: not configured.");
    return;
  }
  info("Release readiness:");
  for (const check of readiness.checks) {
    info(`  ${statusLabel(check.status)} ${check.message}`);
  }
}

function statusLabel(status: ReleaseReadiness["checks"][number]["status"]): string {
  switch (status) {
    case "pass":
      return "PASS";
    case "warn":
      return "WARN";
    case "fail":
      return "FAIL";
    case "not-applicable":
      return "N/A ";
  }
}
