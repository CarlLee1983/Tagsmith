import type { CompiledPattern } from "./pattern.js";
import { classify } from "./analyze.js";
import type { TagAnomaly, VersionModel } from "../types.js";

export interface TagCheck {
  tag: string;
  ok: boolean;
  anomaly: TagAnomaly | null;
}

export interface CheckResult {
  ok: boolean;
  checks: TagCheck[];
}

/**
 * 驗證候選 tag 是否符合 pattern + model。純函式，無 IO。
 */
export function checkTags(
  pattern: CompiledPattern,
  model: VersionModel,
  candidates: readonly string[],
  existing: readonly string[],
): CheckResult {
  // 既有 conforming 版本的鍵集合。
  const seen = new Set<string>();
  for (const raw of existing) {
    const c = classify(raw, pattern, model);
    if (c.conforming && c.version !== null) {
      seen.add(model.format(c.version));
    }
  }

  const checks: TagCheck[] = candidates.map((tag) => {
    const c = classify(tag, pattern, model);
    if (!c.conforming) {
      return { tag, ok: false, anomaly: c.anomaly };
    }
    const key = model.format(c.version);
    if (seen.has(key)) {
      return { tag, ok: false, anomaly: "duplicate-version" };
    }
    seen.add(key);
    return { tag, ok: true, anomaly: null };
  });

  return { ok: checks.every((c) => c.ok), checks };
}
