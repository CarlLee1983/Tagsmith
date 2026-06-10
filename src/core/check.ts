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
 * 重複偵測於後續加入。
 */
export function checkTags(
  pattern: CompiledPattern,
  model: VersionModel,
  candidates: readonly string[],
  _existing: readonly string[],
): CheckResult {
  const checks: TagCheck[] = candidates.map((tag) => {
    const c = classify(tag, pattern, model);
    return { tag, ok: c.conforming, anomaly: c.anomaly };
  });
  return { ok: checks.every((c) => c.ok), checks };
}
