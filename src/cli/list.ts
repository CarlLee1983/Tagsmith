import type { AuditDiagnostic, AuditLineReport, AuditReport } from "../core/audit.js";
import { auditTags } from "../core/audit.js";
import { selectLine } from "../core/lines.js";
import { ensureRepo, listTags } from "../git/git.js";
import { color, info, printError, warn } from "./ui.js";
import { resolveConfig } from "./resolve-config.js";
import { configMetadata, printImplicitConfigNotice } from "./implicit.js";
import { emitJson, emitJsonError } from "./json.js";

export interface ListFlags {
  json?: boolean;
  tag?: string;
  all?: boolean;
}

/** Render one audit line in the familiar tag-list format. */
function printAnalysisBody(line: AuditLineReport): void {
  info(color.bold("Conforming tags (newest first):"));
  if (line.conforming.length === 0) info("  (none)");
  line.conforming.forEach((tag, index) => {
    const marker = index === 0 ? color.green(" ← latest") : "";
    info(`  ${color.cyan(tag.tag)}${marker}`);
  });

  if (line.anomalies.length > 0) {
    info("");
    warn(`${line.anomalies.length} non-conforming tag(s):`);
    for (const tag of line.anomalies) {
      info(`  ${color.yellow(tag.tag)} ${color.dim(`(${tag.reason})`)}`);
    }
  }
}

function printLineSection(line: AuditLineReport): void {
  info(color.bold(`\n── Line: ${line.line} ──`));
  if (line.conforming.length === 0 && line.anomalies.length === 0) {
    info("  (no tags)");
    return;
  }
  printAnalysisBody(line);
}

function printOrphans(orphans: readonly string[]): void {
  info(color.bold("\n── Unassigned / orphan tags ──"));
  for (const tag of orphans) info(`  ${color.yellow(tag)}`);
}

function printAmbiguous(report: AuditReport, selectedLine?: string): void {
  const ambiguous = selectedLine === undefined
    ? report.ambiguous
    : report.ambiguous.filter((item) => item.lines.includes(selectedLine));
  if (ambiguous.length === 0) return;
  warn("\nAmbiguous tag-line assignments:");
  for (const item of ambiguous) {
    info(`  ${color.yellow(item.tag)} ${color.dim(`(matches: ${item.lines.join(", ")})`)}`);
  }
}

/**
 * `list` reports tag history. Pattern overlap is a configuration defect that
 * exists with or without tags, so it stays an `audit` concern and never changes
 * what an existing `list` caller sees.
 */
function historyDiagnostics(report: AuditReport): AuditDiagnostic[] {
  return report.diagnostics.filter(
    (diagnostic) => !diagnostic.code.startsWith("pattern-overlap"),
  );
}

function diagnosticsForLine(
  report: AuditReport,
  lineName: string,
  includeOrphans: boolean,
): AuditDiagnostic[] {
  return historyDiagnostics(report).filter((diagnostic) =>
    (includeOrphans && diagnostic.code === "orphan-tag") ||
    diagnostic.line === lineName ||
    diagnostic.lines?.includes(lineName),
  );
}

/** List tags using the same complete assignment report consumed by audit. */
export async function runList(cwd: string, flags: ListFlags): Promise<number> {
  try {
    if (flags.all && flags.tag) {
      throw new Error("--all and --tag are mutually exclusive.");
    }

    const resolved = await resolveConfig(cwd);
    const { config } = resolved;
    await ensureRepo({ cwd });
    const report = auditTags(await listTags({ cwd }), config.lines);

    if (flags.all) {
      if (flags.json) {
        emitJson(
          "list",
          {
            config: configMetadata(resolved),
            lines: report.lines,
            orphans: report.orphans,
            ambiguous: report.ambiguous,
          },
          historyDiagnostics(report),
        );
        return 0;
      }

      printImplicitConfigNotice(resolved);
      for (const line of report.lines) printLineSection(line);
      if (report.orphans.length > 0) printOrphans(report.orphans);
      printAmbiguous(report);
      return 0;
    }

    const selected = selectLine(config, flags.tag);
    const line = report.lines.find((item) => item.line === selected.name)!;
    // A single-line config historically displayed every nonmatching tag. Keep
    // that visibility, but name such tags as orphans rather than assigning a
    // false pattern-mismatch owner.
    const includeOrphans = config.lines.length === 1;
    const diagnostics = diagnosticsForLine(report, line.line, includeOrphans);

    if (flags.json) {
      emitJson(
        "list",
        {
          config: configMetadata(resolved),
          line: line.line,
          conforming: line.conforming,
          anomalies: line.anomalies,
          latest: line.latest,
          ...(includeOrphans ? { orphans: report.orphans } : {}),
          ambiguous: report.ambiguous.filter((item) => item.lines.includes(line.line)),
        },
        diagnostics,
      );
      return 0;
    }

    printImplicitConfigNotice(resolved);
    if (line.conforming.length === 0 && line.anomalies.length === 0) info("No tags found.");
    else printAnalysisBody(line);
    if (includeOrphans && report.orphans.length > 0) printOrphans(report.orphans);
    printAmbiguous(report, line.line);
    return 0;
  } catch (err) {
    if (flags.json) emitJsonError("list", err);
    else printError(err);
    return 1;
  }
}
