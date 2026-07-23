import type { BumpLevel, CommitPolicy } from "../types.js";

export interface CommitMessage {
  /** Stable Git object id, supplied by the Git adapter. */
  id: string;
  /** Complete commit message, including body and footers. */
  message: string;
}

export interface BumpReason {
  id: string;
  level: Exclude<BumpLevel, "auto" | "prerelease">;
  summary: string;
  /** Default or configured rule that classified this commit. */
  rule: string;
}

export interface BumpRecommendation {
  /** Null when no commit represents a releasable change. */
  level: Exclude<BumpLevel, "auto" | "prerelease"> | null;
  reasons: BumpReason[];
}

const RANK: Record<Exclude<BumpLevel, "auto" | "prerelease">, number> = {
  patch: 1,
  minor: 2,
  major: 3,
};

/**
 * Recommend a SemVer bump from Conventional Commit messages. The caller gets
 * one small result regardless of how headers, scopes, breaking footers, and
 * release precedence are parsed internally.
 */
export function recommendConventionalBump(
  commits: readonly CommitMessage[],
  policy?: CommitPolicy,
): BumpRecommendation {
  const reasons = commits.flatMap((commit) => {
    const classification = classifyCommit(commit.message, policy);
    if (classification === null) return [];
    return [{
      id: commit.id,
      level: classification.level,
      summary: firstLine(commit.message),
      rule: classification.rule,
    }];
  });

  const level = reasons.reduce<Exclude<BumpLevel, "auto" | "prerelease"> | null>(
    (highest, reason) => highest === null || RANK[reason.level] > RANK[highest]
      ? reason.level
      : highest,
    null,
  );
  return { level, reasons };
}

function classifyCommit(
  message: string,
  policy?: CommitPolicy,
): { level: Exclude<BumpLevel, "auto" | "prerelease">; rule: string } | null {
  const header = firstLine(message);
  const match = /^([a-z][a-z0-9-]*)(?:\(([^\r\n)]*)\))?(!)?:\s+/.exec(header);
  if (match === null) return null;

  const parsed = {
    type: match[1]!,
    scope: match[2] ?? null,
    breaking: match[3] === "!" || /(?:^|\r?\n)BREAKING[ -]CHANGE:\s+\S/m.test(message),
  };

  if (policy !== undefined) return classifyWithPolicy(parsed, policy);

  if (parsed.breaking) {
    return { level: "major", rule: "default.breaking" };
  }
  if (parsed.type === "feat") return { level: "minor", rule: "default.feat" };
  if (parsed.type === "fix" || parsed.type === "perf") {
    return { level: "patch", rule: `default.${parsed.type}` };
  }
  return null;
}

function classifyWithPolicy(
  commit: { type: string; scope: string | null; breaking: boolean },
  policy: CommitPolicy,
): { level: Exclude<BumpLevel, "auto" | "prerelease">; rule: string } | null {
  const index = policy.rules.findIndex((rule) =>
    (rule.type === undefined || rule.type === commit.type)
    && (rule.scope === undefined || rule.scope === commit.scope)
    && (rule.breaking === undefined || rule.breaking === commit.breaking));
  if (index === -1) return null;
  const rule = policy.rules[index]!;
  if (rule.ignore === true) return null;
  return {
    level: rule.release!,
    rule: rule.name ?? `commitPolicy.rules[${index}]`,
  };
}

function firstLine(message: string): string {
  return message.split(/\r?\n/, 1)[0] ?? "";
}
