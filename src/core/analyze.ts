import type { CompiledPattern } from "./pattern.js";
import type { ParsedTag, VersionModel } from "../types.js";

export interface AnalyzedTag extends ParsedTag {
  /** True when the tag matches the pattern and the version parses. */
  conforming: boolean;
}

export interface Analysis {
  /** Conforming tags sorted newest → oldest by version. */
  conforming: AnalyzedTag[];
  /** Tags that failed pattern or version parsing, in input order. */
  anomalies: AnalyzedTag[];
  /** The highest conforming version, or null when none exist. */
  latest: AnalyzedTag | null;
}

/**
 * Classify a list of raw git tag names against the configured pattern + model,
 * sort the conforming ones by semantic version (newest first), and surface
 * format / duplicate anomalies.
 */
export function analyzeTags(
  tags: readonly string[],
  pattern: CompiledPattern,
  model: VersionModel,
): Analysis {
  const parsed: AnalyzedTag[] = tags.map((raw) => classify(raw, pattern, model));

  // Detect duplicate versions among otherwise-conforming tags.
  const seen = new Map<string, AnalyzedTag>();
  for (const tag of parsed) {
    if (tag.version === null || tag.versionString === null) continue;
    const key = model.format(tag.version);
    const prior = seen.get(key);
    if (prior === undefined) {
      seen.set(key, tag);
    } else {
      tag.anomaly = "duplicate-version";
      tag.conforming = false;
    }
  }

  const conforming = parsed
    .filter((t) => t.conforming)
    .sort((a, b) => model.compare(b.version, a.version));
  const anomalies = parsed.filter((t) => !t.conforming);

  return {
    conforming,
    anomalies,
    latest: conforming[0] ?? null,
  };
}

export function classify(
  raw: string,
  pattern: CompiledPattern,
  model: VersionModel,
): AnalyzedTag {
  const versionString = pattern.extract(raw);
  if (versionString === null) {
    return {
      raw,
      versionString: null,
      version: null,
      anomaly: "pattern-mismatch",
      conforming: false,
    };
  }
  const version = model.parse(versionString);
  if (version === null) {
    return {
      raw,
      versionString,
      version: null,
      anomaly: "unparseable-version",
      conforming: false,
    };
  }
  return { raw, versionString, version, anomaly: null, conforming: true };
}
