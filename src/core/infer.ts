import type { VersionModel } from "../types.js";
import { compilePattern } from "./pattern.js";

export const INFER_CANDIDATE_PATTERNS = [
  "v{version}",
  "{version}",
  "release/{version}",
  "release-{version}",
  "release/v{version}",
] as const;

function scorePattern(
  tags: readonly string[],
  pattern: string,
  model: VersionModel,
): number {
  const compiled = compilePattern(pattern);
  let score = 0;
  for (const tag of tags) {
    const ver = compiled.extract(tag);
    if (ver !== null && model.parse(ver) !== null) score++;
  }
  return score;
}

/** Pick the candidate pattern that matches the most semver-parseable tags. */
export function inferPattern(
  tags: readonly string[],
  model: VersionModel,
): string {
  let best: string = INFER_CANDIDATE_PATTERNS[0]!;
  let bestScore = 0;
  for (const p of INFER_CANDIDATE_PATTERNS) {
    const s = scorePattern(tags, p, model);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return best;
}

/** True when at least one tag conforms to the pattern + model. */
export function hasConformingTag(
  tags: readonly string[],
  pattern: string,
  model: VersionModel,
): boolean {
  return scorePattern(tags, pattern, model) > 0;
}
