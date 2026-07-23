import { classify } from "./analyze.js";
import { createModel } from "./models/index.js";
import { compilePattern } from "./pattern.js";
import type { TagAnomaly, TagLine, VersionModel } from "../types.js";

export interface CheckResult {
  raw: string;
  line: string | null;
  ok: boolean;
  anomaly: TagAnomaly | null;
}

export interface CheckOptions {
  /**
   * Reject a candidate whose canonical version already appears in `existingTags`
   * or an earlier candidate. Without this, checks only validate tag shape.
   */
  strict?: boolean;
  /** Existing repository tags used as history for strict candidate checks. */
  existingTags?: readonly string[];
}

interface CompiledLine {
  line: TagLine;
  pattern: ReturnType<typeof compilePattern>;
  model: VersionModel;
}

interface ClassifiedCheck extends CheckResult {
  version: unknown | null;
  model: VersionModel | null;
}

/**
 * Check tag names against the configured lines. In strict mode, this deep
 * module additionally owns canonical-version de-duplication, hiding model and
 * pattern details from CLI and CI callers.
 */
export function checkTags(
  candidates: readonly string[],
  lines: readonly TagLine[],
  opts: CheckOptions = {},
): CheckResult[] {
  const compiled = lines.map<CompiledLine>((line) => ({
    line,
    pattern: compilePattern(line.pattern),
    model: createModel(line.model),
  }));
  const seenVersions = new Set<string>();

  if (opts.strict) {
    for (const raw of opts.existingTags ?? []) {
      const checked = classifyTag(raw, compiled);
      if (checked.ok && checked.line !== null && checked.version !== null && checked.model !== null) {
        seenVersions.add(versionKey(checked.line, checked.model, checked.version));
      }
    }
  }

  return candidates.map((raw) => {
    const checked = classifyTag(raw, compiled);
    if (
      !opts.strict ||
      !checked.ok ||
      checked.line === null ||
      checked.version === null ||
      checked.model === null
    ) {
      return toResult(checked);
    }

    const key = versionKey(checked.line, checked.model, checked.version);
    if (seenVersions.has(key)) {
      return {
        raw: checked.raw,
        line: checked.line,
        ok: false,
        anomaly: "duplicate-version",
      };
    }
    seenVersions.add(key);
    return toResult(checked);
  });
}

function classifyTag(raw: string, lines: readonly CompiledLine[]): ClassifiedCheck {
  const hit = lines.find((candidate) => candidate.pattern.extract(raw) !== null);
  if (!hit) {
    return {
      raw,
      line: null,
      ok: false,
      anomaly: "pattern-mismatch",
      version: null,
      model: null,
    };
  }

  const classified = classify(raw, hit.pattern, hit.model);
  return {
    raw,
    // A matching pattern identifies the owning line even when its version is
    // malformed. This keeps CI output actionable: `null` now truly means no
    // configured line matched the tag at all.
    line: hit.line.name,
    ok: classified.conforming,
    anomaly: classified.anomaly,
    version: classified.version,
    model: hit.model,
  };
}

function toResult(checked: ClassifiedCheck): CheckResult {
  return {
    raw: checked.raw,
    line: checked.line,
    ok: checked.ok,
    anomaly: checked.anomaly,
  };
}

function versionKey(line: string, model: VersionModel, version: unknown): string {
  return `${line}\u0000${model.format(version)}`;
}
