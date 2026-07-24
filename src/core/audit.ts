import { analyzeTags } from "./analyze.js";
import type { AssertRegistered, DiagnosticSeverity } from "./diagnostics.js";
import { assignTagsToLines } from "./lines.js";
import { createModel } from "./models/index.js";
import { compilePattern } from "./pattern.js";
import { analyzePatternOverlap, type OverlapPair } from "./pattern-overlap.js";
import type { TagAnomaly, TagLine } from "../types.js";

export type AuditSeverity = DiagnosticSeverity;

/** The registry proves each code below is published; see `diagnostics.ts`. */
export type AuditDiagnosticCode = AssertRegistered<
  | "unparseable-version"
  | "duplicate-version"
  | "orphan-tag"
  | "ambiguous-assignment"
  | "pattern-overlap-certain"
  | "pattern-overlap-possible"
>;

export interface AuditDiagnostic {
  code: AuditDiagnosticCode;
  severity: AuditSeverity;
  message: string;
  tag: string;
  /** The unique line whose matching tag is malformed, when one exists. */
  line?: string;
  /** Every matching line when assignment is ambiguous. */
  lines?: string[];
}

export interface AuditLineReport {
  line: string;
  conforming: Array<{ tag: string; version: string }>;
  anomalies: Array<{ tag: string; reason: TagAnomaly }>;
  latest: string | null;
}

export interface AuditReport {
  /** False when any diagnostic has error severity. */
  ok: boolean;
  lines: AuditLineReport[];
  orphans: string[];
  ambiguous: Array<{ tag: string; lines: string[] }>;
  /** Line pairs proven to accept a common tag; disjoint pairs are omitted. */
  overlaps: OverlapPair[];
  diagnostics: AuditDiagnostic[];
}

export interface AuditOptions {
  /** Raise pattern-overlap diagnostics from warning to error. */
  strictOverlap?: boolean;
}

/**
 * Audit complete tag history against configured lines. This pure module owns
 * assignment, per-line analysis, and diagnostic severity so CLI and CI never
 * have to recreate release-safety rules.
 */
export function auditTags(
  tags: readonly string[],
  lines: readonly TagLine[],
  options: AuditOptions = {},
): AuditReport {
  const assignment = assignTagsToLines(tags, lines);
  const diagnostics: AuditDiagnostic[] = [];
  const lineReports = lines.map((line) => {
    const model = createModel(line.model);
    const pattern = compilePattern(line.pattern);
    const analysis = analyzeTags(
      assignment.byLine.get(line.name) ?? [],
      pattern,
      model,
    );

    for (const anomaly of analysis.anomalies) {
      diagnostics.push(diagnosticForLineAnomaly(line.name, anomaly.raw, anomaly.anomaly));
    }

    return {
      line: line.name,
      conforming: analysis.conforming.map((tag) => ({
        tag: tag.raw,
        version: tag.versionString!,
      })),
      anomalies: analysis.anomalies.map((tag) => ({
        tag: tag.raw,
        reason: tag.anomaly!,
      })),
      latest: analysis.latest?.raw ?? null,
    };
  });

  for (const tag of assignment.orphans) {
    diagnostics.push({
      code: "orphan-tag",
      severity: "warning",
      message: `Tag "${tag}" does not match any configured tag line.`,
      tag,
    });
  }

  for (const item of assignment.ambiguous) {
    diagnostics.push({
      code: "ambiguous-assignment",
      severity: "error",
      message: `Tag "${item.tag}" matches multiple tag lines: ${item.lines.join(", ")}.`,
      tag: item.tag,
      lines: item.lines,
    });
  }

  // Static proof: a collision the tag history has not produced yet is still a
  // configuration defect, and it is cheapest to fix before the tag exists.
  const overlaps = analyzePatternOverlap(lines).pairs
    .filter((pair) => pair.verdict === "overlapping");
  const overlapSeverity: AuditSeverity =
    options.strictOverlap === true ? "error" : "warning";
  for (const pair of overlaps) {
    diagnostics.push(overlapDiagnostic(pair, overlapSeverity));
  }

  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    lines: lineReports,
    orphans: assignment.orphans,
    ambiguous: assignment.ambiguous,
    overlaps,
    diagnostics,
  };
}

function overlapDiagnostic(
  pair: OverlapPair,
  severity: AuditSeverity,
): AuditDiagnostic {
  const witness = pair.witness!;
  const lines = [pair.a, pair.b];
  if (pair.witnessSource === "line-version") {
    const origin = pair.witnessOrigin!;
    return {
      code: "pattern-overlap-certain",
      severity,
      message: `Tag lines "${pair.a}" and "${pair.b}" can produce the same tag: line "${origin.line}" renders "${witness}" for version ${origin.version}, which the other line also matches.`,
      tag: witness,
      lines,
    };
  }
  return {
    code: "pattern-overlap-possible",
    severity,
    message: `Tag lines "${pair.a}" and "${pair.b}" both accept "${witness}", although neither line's initial version produces such a tag today.`,
    tag: witness,
    lines,
  };
}

function diagnosticForLineAnomaly(
  line: string,
  tag: string,
  anomaly: TagAnomaly | null,
): AuditDiagnostic {
  switch (anomaly) {
    case "unparseable-version":
      return {
        code: anomaly,
        severity: "error",
        message: `Tag "${tag}" matches line "${line}" but its version cannot be parsed.`,
        tag,
        line,
      };
    case "duplicate-version":
      return {
        code: anomaly,
        severity: "error",
        message: `Tag "${tag}" duplicates a version already used by line "${line}".`,
        tag,
        line,
      };
    default:
      throw new Error(`Unexpected assigned tag anomaly: ${anomaly ?? "none"}`);
  }
}
