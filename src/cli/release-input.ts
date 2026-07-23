import { planNext } from "../core/plan.js";
import type { BumpLevel, CommitPolicy, TagLine, VersionModel } from "../types.js";
import { recommendBumpFromCommits } from "./conventional.js";
import type { BumpRecommendation } from "../core/conventional.js";

const LEVELS: BumpLevel[] = ["major", "minor", "patch", "prerelease", "auto"];

export interface ResolvedReleaseInput {
  level: BumpLevel;
  recommendation?: BumpRecommendation;
}

export interface ResolveReleaseInputOptions {
  cwd: string;
  line: TagLine;
  model: VersionModel;
  lineTags: readonly string[];
  level?: string;
  fromCommits?: boolean;
  commitPolicy?: CommitPolicy;
}

/**
 * Resolve the shared next/create bump inputs. It centralizes level validation
 * and the history baseline so the two release commands cannot drift.
 */
export async function resolveReleaseInput(
  opts: ResolveReleaseInputOptions,
): Promise<ResolvedReleaseInput> {
  if (!opts.fromCommits) {
    return { level: resolveLevel(opts.level) };
  }
  if (opts.level !== undefined) {
    throw new Error("--from-commits cannot be combined with --level.");
  }

  const baseline = planNext(opts.line, opts.model, opts.lineTags);
  const recommendation = await recommendBumpFromCommits(
    opts.cwd,
    opts.line,
    baseline.analysis.latest?.raw ?? null,
    opts.commitPolicy,
  );
  if (recommendation.level === null) {
    throw new Error("No release-worthy Conventional Commits found since the latest tag.");
  }
  return { level: recommendation.level, recommendation };
}

function resolveLevel(raw: string | undefined): BumpLevel {
  if (raw === undefined) return "patch";
  if ((LEVELS as string[]).includes(raw)) return raw as BumpLevel;
  throw new Error(`Invalid level "${raw}". Expected one of: ${LEVELS.join(", ")}`);
}
