// src/cli/merge-check.ts
import { loadMergePolicy } from "../core/merge-policy/schema.js";
import { validateMerge } from "../core/merge-policy/validate.js";
import {
  resolveFfSource,
  resolveFromMergeHead,
} from "../core/merge-policy/resolve.js";
import {
  currentBranch,
  isAncestor,
  parentCount,
  resetHard,
  revParse,
  revParseVerify,
} from "../git/git.js";
import { color, info, printError } from "./ui.js";

export interface MergeCheckFlags {
  mode?: "merge-head" | "post-merge";
}

function skipRequested(): boolean {
  return process.env.HUSKY === "0" || process.env.TAGSMITH_SKIP === "1";
}

export async function runMergeCheck(
  cwd: string,
  flags: MergeCheckFlags,
): Promise<number> {
  if (skipRequested()) return 0;
  try {
    const policy = await loadMergePolicy(cwd);
    if (!policy) return 0;

    // fallback guards programmatic callers; commander supplies the CLI default
    const mode = flags.mode ?? "merge-head";
    const current = await currentBranch({ cwd });

    if (current === "") {
      printError(
        "merge-policy: detached HEAD — branch name cannot be determined.",
      );
      return 1;
    }
    if (!(current in policy.protectedBranches)) return 0;

    let source: string | null;
    let rollback: string | null = null;

    if (mode === "post-merge") {
      rollback = await revParseVerify({ cwd }, "ORIG_HEAD");
      if ((await parentCount({ cwd }, "HEAD")) > 2) return 0; // octopus
      const newHead = await revParse({ cwd }, "HEAD");
      if (!rollback || rollback === newHead) return 0;
      if (!(await isAncestor({ cwd }, rollback, newHead))) return 0; // not ff
      source = await resolveFfSource({ cwd }, current);
    } else {
      if (!(await revParseVerify({ cwd }, "MERGE_HEAD"))) return 0;
      source = await resolveFromMergeHead({ cwd }, current);
    }

    const decision = validateMerge(policy, current, source);
    if (decision.ok) return 0;

    if (rollback) await resetHard({ cwd }, rollback);

    info("");
    printError(`merge-policy: merge blocked by branch policy.`);
    info(`  target:  ${color.cyan(current)}`);
    info(`  source:  ${color.cyan(source ?? "(unknown)")}`);
    info(`  reason:  ${decision.reason}`);
    info(
      rollback
        ? "  branch reset to pre-merge state."
        : "  run: git merge --abort",
    );
    info("  TAGSMITH_SKIP=1 git merge ...   # skip hook (emergency only)");
    return 1;
  } catch (err) {
    printError(err);
    return 1;
  }
}
