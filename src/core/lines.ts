import type { TagLine, TagsmithConfig } from "../types.js";
import { compilePattern } from "./pattern.js";

export interface LineAssignment {
  /** 線名 → 恰好命中該線的原始 git tag 名（保留輸入順序）。 */
  byLine: Map<string, string[]>;
  /** 不被任何線命中的 tag。 */
  orphans: string[];
  /** 同時命中兩條以上線的 tag；不會被放進任何 line bucket。 */
  ambiguous: AmbiguousTagAssignment[];
}

export interface AmbiguousTagAssignment {
  tag: string;
  /** 所有匹配的線名，依設定宣告順序排列。 */
  lines: string[];
}

/** Return only ambiguity records that can affect the selected tag line. */
export function ambiguousAssignmentsForLine(
  assignment: LineAssignment,
  lineName: string,
): AmbiguousTagAssignment[] {
  return assignment.ambiguous.filter((item) => item.lines.includes(lineName));
}

export class AmbiguousTagAssignmentError extends Error {}

/** Stop a release decision when its selected line has no safe unique history. */
export function assertUnambiguousLineHistory(
  assignment: LineAssignment,
  lineName: string,
): void {
  const ambiguous = ambiguousAssignmentsForLine(assignment, lineName);
  if (ambiguous.length === 0) return;
  const details = ambiguous
    .map((item) => `${item.tag} (${item.lines.join(", ")})`)
    .join(", ");
  throw new AmbiguousTagAssignmentError(
    `Tag line "${lineName}" has ambiguous tag assignment: ${details}. Run \`tagsmith audit\` to inspect.`,
  );
}

/** 回傳 raw tag 符合的所有 line，依設定宣告順序排列。 */
export function matchingLines(
  raw: string,
  lines: readonly TagLine[],
): TagLine[] {
  return lines.filter((line) => compilePattern(line.pattern).extract(raw) !== null);
}

/**
 * 把 git tag 依完整匹配集合歸屬到各線桶。只有唯一命中的 tag 才有 owner；歧義 tag
 * 保留在 `ambiguous`，避免 caller 在不知情下依設定順序作 release 決策。
 */
export function assignTagsToLines(
  tags: readonly string[],
  lines: readonly TagLine[],
): LineAssignment {
  const byLine = new Map<string, string[]>(lines.map((l) => [l.name, []]));
  const orphans: string[] = [];
  const ambiguous: AmbiguousTagAssignment[] = [];

  for (const tag of tags) {
    const matches = matchingLines(tag, lines);
    if (matches.length === 0) {
      orphans.push(tag);
    } else if (matches.length === 1) {
      byLine.get(matches[0]!.name)!.push(tag);
    } else {
      ambiguous.push({ tag, lines: matches.map((line) => line.name) });
    }
  }
  return { byLine, orphans, ambiguous };
}

export class LineNotFoundError extends Error {}

/** 取得指定線(省略則取 default);不存在時丟出列有可用線名的錯誤。 */
export function selectLine(config: TagsmithConfig, name?: string): TagLine {
  const target = name ?? config.default;
  const line = config.lines.find((l) => l.name === target);
  if (!line) {
    const names = config.lines.map((l) => l.name).join(", ");
    throw new LineNotFoundError(
      `No tag line named "${target}". Available: ${names}`,
    );
  }
  return line;
}
