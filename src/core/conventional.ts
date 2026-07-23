import type { BumpLevel } from "../types.js";

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
): BumpRecommendation {
  const reasons = commits.flatMap((commit) => {
    const level = classifyCommit(commit.message);
    if (level === null) return [];
    return [{ id: commit.id, level, summary: firstLine(commit.message) }];
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
): Exclude<BumpLevel, "auto" | "prerelease"> | null {
  const header = firstLine(message);
  const match = /^([a-z][a-z0-9-]*)(?:\([^\r\n)]*\))?(!)?:\s+/.exec(header);
  if (match === null) return null;

  if (match[2] === "!" || /(?:^|\r?\n)BREAKING[ -]CHANGE:\s+\S/m.test(message)) {
    return "major";
  }
  if (match[1] === "feat") return "minor";
  if (match[1] === "fix" || match[1] === "perf") return "patch";
  return null;
}

function firstLine(message: string): string {
  return message.split(/\r?\n/, 1)[0] ?? "";
}
