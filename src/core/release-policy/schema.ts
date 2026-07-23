import { z } from "zod";
import type { ReleasePolicy } from "../../types.js";

const branchPatternSchema = z.string().min(1);

/** Shared Zod contract used by config parsing and direct policy tests. */
export const releasePolicySchema = z.object({
  allowedBranches: z.array(branchPatternSchema).min(1).optional(),
  requireCleanWorktree: z.boolean().default(false),
  requireAnnotatedTag: z.boolean().default(false),
  requireHeadTag: z.boolean().default(false),
  signature: z.enum(["optional", "required"]).default("optional"),
});

export class ReleasePolicyError extends Error {}

/** Extract and validate the optional releasePolicy object from a raw config. */
export function parseReleasePolicy(raw: unknown): ReleasePolicy | null {
  if (typeof raw !== "object" || raw === null) return null;
  const block = (raw as Record<string, unknown>)["releasePolicy"];
  if (block === undefined) return null;
  const result = releasePolicySchema.safeParse(block);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new ReleasePolicyError(`Invalid releasePolicy:\n${issues}`);
  }
  return result.data;
}
