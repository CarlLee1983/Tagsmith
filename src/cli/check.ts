import type { ResolvedConfig } from "../core/config.js";
import { checkTags, type CheckResult } from "../core/check.js";
import { selectLine } from "../core/lines.js";
import { ensureRepo, listTags } from "../git/git.js";
import { color, printError, success } from "./ui.js";
import { resolveConfig } from "./resolve-config.js";
import { configMetadata, printImplicitConfigNotice } from "./implicit.js";
import { emitJson, emitJsonError, type JsonDiagnostic } from "./json.js";

export interface CheckFlags {
  json?: boolean;
  tag?: string;
  strict?: boolean;
}

/**
 * Emit check results to stdout (JSON) or stdout/stderr (human-readable).
 * Returns 0 if all results are ok, 1 if any is not ok.
 */
function emitCheck(
  results: CheckResult[],
  resolved: ResolvedConfig,
  json: boolean | undefined,
  strict: boolean | undefined,
): number {
  const allOk = results.every((r) => r.ok);

  if (json) {
    emitJson(
      "check",
      {
        results,
        strict: strict === true,
        config: configMetadata(resolved),
      },
      diagnosticsFor(results),
    );
    return allOk ? 0 : 1;
  }

  printImplicitConfigNotice(resolved, json);
  for (const r of results) {
    if (r.ok) {
      success(`${color.cyan(r.raw)} ${color.dim("ok")} ${color.dim(`(${r.line ?? "orphan"})`)}`);
    } else {
      const matches = r.matches.length > 0 ? `; matches: ${r.matches.join(", ")}` : "";
      printError(`${r.raw} (${r.anomaly}${matches})`);
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
    const resolved =
      tags.length > 0
        ? await resolveConfig(cwd, tags)
        : await resolveConfig(cwd);
    const { config } = resolved;

    let targets: string[];
    let existingTags: string[] = [];
    if (tags.length > 0) {
      targets = tags;
      if (flags.strict) {
        await ensureRepo({ cwd });
        existingTags = await listTags({ cwd });
      }
    } else {
      await ensureRepo({ cwd });
      targets = await listTags({ cwd });
    }

    const selectedLine = flags.tag === undefined
      ? undefined
      : selectLine(config, flags.tag).name;

    return emitCheck(
      checkTags(targets, config.lines, {
        strict: flags.strict,
        existingTags,
        selectedLine,
      }),
      resolved,
      flags.json,
      flags.strict,
    );
  } catch (err) {
    if (flags.json) emitJsonError("check", err);
    else printError(err);
    return 1;
  }
}

function diagnosticsFor(results: readonly CheckResult[]): JsonDiagnostic[] {
  return results.flatMap((result) => result.ok || result.anomaly === null
    ? []
    : [{
      code: result.anomaly,
      severity: "error" as const,
      message: checkMessage(result),
      tag: result.raw,
      ...(result.line === null ? {} : { line: result.line }),
      ...(result.matches.length === 0 ? {} : { matches: result.matches }),
    }]);
}

function checkMessage(result: CheckResult): string {
  if (result.anomaly === "ambiguous-assignment") {
    return `Tag "${result.raw}" matches multiple tag lines: ${result.matches.join(", ")}.`;
  }
  if (result.anomaly === "pattern-mismatch" && result.matches.length > 0) {
    return `Tag "${result.raw}" does not belong to the selected tag line.`;
  }
  return `Tag "${result.raw}" failed validation: ${result.anomaly}.`;
}
