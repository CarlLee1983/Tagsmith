import type { TagLine, TagsmithConfig } from "../types.js";
import { compilePattern } from "./pattern.js";

export interface LineAssignment {
  /** 線名 → 屬於該線的原始 git tag 名(宣告順序、首條命中者勝)。 */
  byLine: Map<string, string[]>;
  /** 不被任何線命中的 tag。 */
  orphans: string[];
}

/** 把 git tag 依「宣告順序第一條命中的 pattern」歸屬到各線桶。 */
export function assignTagsToLines(
  tags: readonly string[],
  lines: readonly TagLine[],
): LineAssignment {
  const compiled = lines.map((l) => ({ name: l.name, p: compilePattern(l.pattern) }));
  const byLine = new Map<string, string[]>(lines.map((l) => [l.name, []]));
  const orphans: string[] = [];

  for (const tag of tags) {
    const hit = compiled.find((c) => c.p.extract(tag) !== null);
    if (hit) byLine.get(hit.name)!.push(tag);
    else orphans.push(tag);
  }
  return { byLine, orphans };
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
