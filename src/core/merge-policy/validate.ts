// src/core/merge-policy/validate.ts
import type { MergePolicy } from "./schema.js";
import { matchSource } from "./match.js";

export type Decision = { ok: true } | { ok: false; reason: string };

/**
 * Decide whether merging `source` into `current` is permitted.
 * `source === null` means the source branch could not be resolved.
 */
export function validateMerge(
  policy: MergePolicy,
  current: string,
  source: string | null,
): Decision {
  const rule = policy.protectedBranches[current];
  if (!rule) return { ok: true };

  if (source === null) {
    return policy.onUnknownSource === "allow"
      ? { ok: true }
      : { ok: false, reason: "could not resolve merge source" };
  }

  if (rule.allow) {
    const ok = rule.allow.some((p) => matchSource(p, source));
    return ok
      ? { ok: true }
      : { ok: false, reason: `${current} may only merge: ${rule.allow.join(", ")}` };
  }

  const denied = rule.deny!.some((p) => matchSource(p, source));
  return denied
    ? { ok: false, reason: `${current} must not merge ${source}` }
    : { ok: true };
}
