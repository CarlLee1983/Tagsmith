// src/core/merge-policy/resolve.ts
import type { GitOptions } from "../../git/git.js";
import {
  branchesPointingAt,
  mergeMsg,
  nameRev,
  revParse,
  revParseVerify,
} from "../../git/git.js";

/** Strip remote prefixes and ^/~ suffixes from a ref name. */
export function normalizeBranch(name: string): string {
  return name
    .replace(/^remotes\/origin\//, "")
    .replace(/^origin\//, "")
    .replace(/[\^~].*$/, "");
}

function parseMergeMsg(msg: string): string | null {
  for (const line of msg.split("\n")) {
    const m = line.match(/^Merge (?:remote-tracking )?branch '([^']+)'/);
    if (m) return normalizeBranch(m[1]!);
  }
  return null;
}

/** Resolve the source branch of an in-progress merge (MERGE_HEAD present). */
export async function resolveFromMergeHead(
  opts: GitOptions,
  current: string,
): Promise<string | null> {
  const msg = await mergeMsg(opts);
  if (msg) {
    const parsed = parseMergeMsg(msg);
    if (parsed) return parsed;
  }

  const tip = await revParseVerify(opts, "MERGE_HEAD");
  if (tip) {
    const named = (await branchesPointingAt(opts, tip))
      .map(normalizeBranch)
      .filter((n) => n !== current);
    if (named.length > 0) return named.sort()[0]!;

    const nr = await nameRev(opts, tip);
    if (nr) return normalizeBranch(nr);
  }

  return null;
}

/** Resolve the source branch of a fast-forward merge (post-merge). */
export async function resolveFfSource(
  opts: GitOptions,
  current: string,
): Promise<string | null> {
  const newHead = await revParse(opts, "HEAD");
  const raw = await branchesPointingAt(opts, newHead);
  const candidates = raw.map(normalizeBranch).filter((n) => n !== current);
  // Prefer well-known integration branches, else first alphabetical.
  for (const preferred of ["main", "develop", "testing"]) {
    if (candidates.includes(preferred)) return preferred;
  }
  if (candidates.length > 0) return candidates.sort()[0]!;
  // No other branch points here. If a remote-tracking ref of the current branch
  // does (e.g. origin/main when HEAD == main), this fast-forward is a pull/sync
  // of the branch into itself — report it as such so the policy allows it.
  // (A genuinely unresolvable source leaves only the local branch ref → null.)
  const selfRemote = raw.some(
    (r) => r !== current && normalizeBranch(r) === current,
  );
  return selfRemote ? current : null;
}
