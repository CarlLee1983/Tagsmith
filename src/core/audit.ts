import { analyzeTags } from "./analyze.js";
import { assignTagsToLines } from "./lines.js";
import { createModel } from "./models/index.js";
import { compilePattern } from "./pattern.js";
import type { TagAnomaly, TagLine } from "../types.js";

export type AuditSeverity = "error" | "warning";

export type AuditDiagnosticCode =
  | "unparseable-version"
  | "duplicate-version"
  | "orphan-tag"
  | "ambiguous-assignment";

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
  diagnostics: AuditDiagnostic[];
}

/**
 * Audit complete tag history against configured lines. This pure module owns
 * assignment, per-line analysis, and diagnostic severity so CLI and CI never
 * have to recreate release-safety rules.
 */
export function auditTags(
  tags: readonly string[],
  lines: readonly TagLine[],
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

  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    lines: lineReports,
    orphans: assignment.orphans,
    ambiguous: assignment.ambiguous,
    diagnostics,
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
