// src/core/merge-policy/schema.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export class MergePolicyError extends Error {}

export interface BranchRule {
  allow?: string[];
  deny?: string[];
}

export interface MergePolicy {
  protectedBranches: Record<string, BranchRule>;
  onUnknownSource: "block" | "allow";
}

const branchRuleSchema = z
  .object({
    allow: z.array(z.string().min(1)).optional(),
    deny: z.array(z.string().min(1)).optional(),
  })
  .refine((r) => (r.allow === undefined) !== (r.deny === undefined), {
    message: "set exactly one of allow / deny",
  });

const mergePolicySchema = z.object({
  protectedBranches: z.record(z.string().min(1), branchRuleSchema),
  onUnknownSource: z.enum(["block", "allow"]).default("block"),
});

/** Extract & validate the optional `mergePolicy` key from a raw config object. */
export function parseMergePolicy(raw: unknown): MergePolicy | null {
  if (typeof raw !== "object" || raw === null) return null;
  const block = (raw as Record<string, unknown>)["mergePolicy"];
  if (block === undefined) return null;
  const result = mergePolicySchema.safeParse(block);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new MergePolicyError(`Invalid mergePolicy:\n${issues}`);
  }
  return result.data;
}

/** Read `.tagsmith.json` from cwd and return its mergePolicy, or null. */
export async function loadMergePolicy(cwd: string): Promise<MergePolicy | null> {
  let text: string;
  try {
    text = await readFile(path.join(cwd, ".tagsmith.json"), "utf8");
  } catch {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new MergePolicyError(
      `.tagsmith.json is not valid JSON: ${(err as Error).message}`,
    );
  }
  return parseMergePolicy(json);
}
