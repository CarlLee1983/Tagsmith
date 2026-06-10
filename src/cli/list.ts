import { loadConfig, MissingConfigError } from "../core/config.js";
import { compilePattern } from "../core/pattern.js";
import { createModel } from "../core/models/index.js";
import { analyzeTags } from "../core/analyze.js";
import type { Analysis } from "../core/analyze.js";
import { assignTagsToLines, selectLine } from "../core/lines.js";
import { ensureRepo, listTags } from "../git/git.js";
import { color, info, printError, warn } from "./ui.js";
import { printFirstRunHint } from "./guidance.js";

export interface ListFlags {
  json?: boolean;
  tag?: string;
  all?: boolean;
}

/** Print the analysis for a single named line (human-readable). */
function printLineSection(lineName: string, analysis: Analysis): void {
  info(color.bold(`\n── Line: ${lineName} ──`));
  if (analysis.conforming.length === 0 && analysis.anomalies.length === 0) {
    info("  (no tags)");
    return;
  }

  info(color.bold("Conforming tags (newest first):"));
  if (analysis.conforming.length === 0) {
    info("  (none)");
  }
  analysis.conforming.forEach((t, i) => {
    const marker = i === 0 ? color.green(" ← latest") : "";
    info(`  ${color.cyan(t.raw)}${marker}`);
  });

  if (analysis.anomalies.length > 0) {
    info("");
    warn(`${analysis.anomalies.length} non-conforming tag(s):`);
    for (const t of analysis.anomalies) {
      info(`  ${color.yellow(t.raw)} ${color.dim(`(${t.anomaly})`)}`);
    }
  }
}

/** Print the orphan tags section (human-readable). */
function printOrphans(orphans: readonly string[]): void {
  info(color.bold("\n── Unassigned / orphan tags ──"));
  for (const t of orphans) {
    info(`  ${color.yellow(t)}`);
  }
}

export async function runList(cwd: string, flags: ListFlags): Promise<number> {
  try {
    const config = await loadConfig(cwd);
    await ensureRepo({ cwd });
    const allTags = await listTags({ cwd });
    const assignment = assignTagsToLines(allTags, config.lines);

    if (flags.all) {
      if (flags.json) {
        const lines = config.lines.map((line) => {
          const model = createModel(line.model);
          const pattern = compilePattern(line.pattern);
          const lineTags = assignment.byLine.get(line.name) ?? [];
          const analysis = analyzeTags(lineTags, pattern, model);
          return {
            line: line.name,
            conforming: analysis.conforming.map((t) => ({
              tag: t.raw,
              version: t.versionString,
            })),
            anomalies: analysis.anomalies.map((t) => ({
              tag: t.raw,
              reason: t.anomaly,
            })),
            latest: analysis.latest?.raw ?? null,
          };
        });
        info(
          JSON.stringify(
            {
              lines,
              orphans: assignment.orphans,
            },
            null,
            2,
          ),
        );
        return 0;
      }

      // Human-readable --all output
      for (const line of config.lines) {
        const model = createModel(line.model);
        const pattern = compilePattern(line.pattern);
        const lineTags = assignment.byLine.get(line.name) ?? [];
        const analysis = analyzeTags(lineTags, pattern, model);
        printLineSection(line.name, analysis);
      }

      if (assignment.orphans.length > 0) {
        printOrphans(assignment.orphans);
      }
      return 0;
    }

    // Single-line path: default or --tag <name>
    const line = selectLine(config, flags.tag);
    const model = createModel(line.model);
    const pattern = compilePattern(line.pattern);
    const lineTags = assignment.byLine.get(line.name) ?? [];
    // Single-line config: feed allTags so non-matching tags appear as pattern-mismatch
    // anomalies — preserves backward-compatible behaviour (allTags === lineTags + orphans).
    // Multi-line config: feed only this line's own bucket (spec 5.3); orphans belong to
    // the `list --all` view and must NOT pollute a single-line analysis.
    const tagsForAnalysis = config.lines.length === 1 ? allTags : lineTags;
    const analysis = analyzeTags(tagsForAnalysis, pattern, model);

    if (flags.json) {
      info(
        JSON.stringify(
          {
            conforming: analysis.conforming.map((t) => ({
              tag: t.raw,
              version: t.versionString,
            })),
            anomalies: analysis.anomalies.map((t) => ({
              tag: t.raw,
              reason: t.anomaly,
            })),
            latest: analysis.latest?.raw ?? null,
          },
          null,
          2,
        ),
      );
      return 0;
    }

    if (analysis.conforming.length === 0 && analysis.anomalies.length === 0) {
      info("No tags found.");
      return 0;
    }

    info(color.bold("Conforming tags (newest first):"));
    if (analysis.conforming.length === 0) {
      info("  (none)");
    }
    analysis.conforming.forEach((t, i) => {
      const marker = i === 0 ? color.green(" ← latest") : "";
      info(`  ${color.cyan(t.raw)}${marker}`);
    });

    if (analysis.anomalies.length > 0) {
      info("");
      warn(`${analysis.anomalies.length} non-conforming tag(s):`);
      for (const t of analysis.anomalies) {
        info(`  ${color.yellow(t.raw)} ${color.dim(`(${t.anomaly})`)}`);
      }
    }
    return 0;
  } catch (err) {
    printError(err);
    if (err instanceof MissingConfigError) printFirstRunHint({ json: flags.json });
    return 1;
  }
}
