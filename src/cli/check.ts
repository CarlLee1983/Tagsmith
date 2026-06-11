import { loadConfig, MissingConfigError } from "../core/config.js";
import { compilePattern } from "../core/pattern.js";
import { createModel } from "../core/models/index.js";
import { classify } from "../core/analyze.js";
import { assignTagsToLines, selectLine } from "../core/lines.js";
import { ensureRepo, listTags } from "../git/git.js";
import { color, info, printError, success } from "./ui.js";
import { printFirstRunHint } from "./guidance.js";

export interface CheckFlags {
  json?: boolean;
  tag?: string;
}

interface CheckResult {
  raw: string;
  line: string | null;
  ok: boolean;
  anomaly: string | null;
}

/**
 * Emit check results to stdout (JSON) or stdout/stderr (human-readable).
 * Returns 0 if all results are ok, 1 if any is not ok.
 */
function emitCheck(results: CheckResult[], json: boolean | undefined): number {
  const allOk = results.every((r) => r.ok);

  if (json) {
    info(JSON.stringify({ results }, null, 2));
    return allOk ? 0 : 1;
  }

  for (const r of results) {
    if (r.ok) {
      success(`${color.cyan(r.raw)} ${color.dim("ok")} ${color.dim(`(${r.line ?? "orphan"})`)}`);
    } else {
      printError(`${r.raw} (${r.anomaly ?? "no-matching-line"})`);
    }
  }
  return allOk ? 0 : 1;
}

export async function runCheck(
  cwd: string,
  tags: string[],
  flags: CheckFlags,
): Promise<number> {
  try {
    const config = await loadConfig(cwd);

    // Determine the list of tags to validate.
    let targets: string[];
    if (tags.length > 0) {
      targets = tags;
    } else {
      await ensureRepo({ cwd });
      targets = await listTags({ cwd });
    }

    // --tag mode: validate all targets against only the named line.
    if (flags.tag) {
      const line = selectLine(config, flags.tag);
      const pattern = compilePattern(line.pattern);
      const model = createModel(line.model);
      const results: CheckResult[] = targets.map((raw) => {
        const c = classify(raw, pattern, model);
        return {
          raw,
          line: c.conforming ? line.name : null,
          ok: c.conforming,
          anomaly: c.anomaly,
        };
      });
      return emitCheck(results, flags.json);
    }

    // Default cross-line mode: assign each target to its owning line (first match wins).
    const results: CheckResult[] = targets.map((raw) => {
      const owner = config.lines.find(
        (l) => compilePattern(l.pattern).extract(raw) !== null,
      );
      if (!owner) {
        return { raw, line: null, ok: false, anomaly: "pattern-mismatch" };
      }
      const model = createModel(owner.model);
      const c = classify(raw, compilePattern(owner.pattern), model);
      return {
        raw,
        line: owner.name,
        ok: c.conforming,
        anomaly: c.anomaly,
      };
    });

    return emitCheck(results, flags.json);
  } catch (err) {
    printError(err);
    if (err instanceof MissingConfigError) printFirstRunHint({ json: flags.json });
    return 1;
  }
}
