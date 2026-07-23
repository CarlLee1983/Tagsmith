import { recommendConventionalBump, type BumpRecommendation, type CommitMessage } from "./conventional.js";
import { planNext, type NextPlan } from "./plan.js";
import type { BumpLevel, TagAnomaly, TagLine, VersionModel } from "../types.js";

export type ReleasePlanStatus = "ready" | "skipped" | "blocked";

/** A stable, machine-readable reason why a line cannot be planned safely. */
export interface ReleasePlanBlocker {
  code: string;
  message: string;
}

export interface ReleasePlanCommit {
  id: string;
  summary: string;
}

export interface ReleasePlanCandidate {
  tag: string;
  version: string;
  fromVersion: string | null;
  fresh: boolean;
}

export interface ReleasePlanAnomaly {
  tag: string;
  reason: TagAnomaly;
}

/** The complete, pure decision for one configured tag line. */
export interface ReleasePlanLine {
  line: string;
  workspace: string | null;
  status: ReleasePlanStatus;
  /** Null only when a preflight blocker made Git evidence unsafe or irrelevant. */
  changed: boolean | null;
  latestTag: string | null;
  bump: BumpLevel | null;
  candidate: ReleasePlanCandidate | null;
  recommendation: BumpRecommendation | null;
  commits: ReleasePlanCommit[];
  blockers: ReleasePlanBlocker[];
  anomalies: ReleasePlanAnomaly[];
}

export interface PlanReleaseLineInput {
  line: TagLine;
  model: VersionModel;
  existingTags: readonly string[];
  changed: boolean | null;
  commits: readonly CommitMessage[];
  fromCommits: boolean;
  requireChanges?: boolean;
  /** Safety facts supplied by tag-line assignment before Git evidence is read. */
  blockers?: readonly ReleasePlanBlocker[];
}

/**
 * Return option/configuration blockers before callers inspect Git history.
 * Assignment-specific blockers (for example ambiguous tags) are supplied by
 * the caller because this pure module intentionally does not assign tags.
 */
export function releasePlanBlockers(
  line: TagLine,
  opts: Pick<PlanReleaseLineInput, "fromCommits" | "requireChanges">,
  assignmentBlockers: readonly ReleasePlanBlocker[] = [],
): ReleasePlanBlocker[] {
  const blockers = [...assignmentBlockers];
  if (opts.requireChanges && line.workspace === undefined) {
    blockers.push({
      code: "workspace-required",
      message: `Tag line "${line.name}" has no workspace. Add a repository-relative workspace path before using --require-changes.`,
    });
  }
  if (opts.fromCommits && line.model.type !== "semver") {
    blockers.push({
      code: "from-commits-unsupported",
      message: "--from-commits is supported only for semver tag lines.",
    });
  }
  return blockers;
}

/**
 * Build a release decision from already-observed Git facts. Version planning
 * remains delegated to planNext, so ready candidates match the next command.
 */
export function planReleaseLine(input: PlanReleaseLineInput): ReleasePlanLine {
  const blockers = releasePlanBlockers(input.line, input, input.blockers);
  if (blockers.length > 0) {
    return {
      line: input.line.name,
      workspace: input.line.workspace ?? null,
      status: "blocked",
      changed: null,
      latestTag: null,
      bump: null,
      candidate: null,
      recommendation: null,
      commits: [],
      blockers,
      anomalies: [],
    };
  }

  const baseline = planNext(input.line, input.model, input.existingTags);
  const common = lineFacts(input.line, baseline, input.commits);
  if (input.changed !== true) {
    return {
      ...common,
      status: "skipped",
      changed: false,
      bump: null,
      candidate: null,
      recommendation: null,
      blockers: [],
    };
  }

  if (!input.fromCommits) {
    return readyLine(common, baseline, "patch", null);
  }

  const recommendation = recommendConventionalBump(input.commits);
  if (recommendation.level === null) {
    return {
      ...common,
      status: "skipped",
      changed: true,
      bump: null,
      candidate: null,
      recommendation,
      blockers: [],
    };
  }

  const next = planNext(
    input.line,
    input.model,
    input.existingTags,
    recommendation.level,
  );
  return readyLine(common, next, recommendation.level, recommendation);
}

function lineFacts(
  line: TagLine,
  baseline: NextPlan,
  commits: readonly CommitMessage[],
): Pick<ReleasePlanLine, "line" | "workspace" | "latestTag" | "commits" | "anomalies"> {
  return {
    line: line.name,
    workspace: line.workspace ?? null,
    latestTag: baseline.analysis.latest?.raw ?? null,
    commits: commits.map((commit) => ({
      id: commit.id,
      summary: firstLine(commit.message),
    })),
    anomalies: baseline.analysis.anomalies.map((tag) => ({
      tag: tag.raw,
      reason: tag.anomaly!,
    })),
  };
}

function readyLine(
  common: Pick<ReleasePlanLine, "line" | "workspace" | "latestTag" | "commits" | "anomalies">,
  next: NextPlan,
  bump: BumpLevel,
  recommendation: BumpRecommendation | null,
): ReleasePlanLine {
  return {
    ...common,
    status: "ready",
    changed: true,
    bump,
    candidate: {
      tag: next.tag,
      version: next.version,
      fromVersion: next.fromVersion,
      fresh: next.fresh,
    },
    recommendation,
    blockers: [],
  };
}

function firstLine(message: string): string {
  return message.split(/\r?\n/, 1)[0] ?? "";
}
