import type { ResolvedConfig } from "../core/config.js";
import { checkTags, type CheckResult } from "../core/check.js";
import { selectLine } from "../core/lines.js";
import { ensureRepo, listTags } from "../git/git.js";
import { color, info, printError, success } from "./ui.js";
import { resolveConfig } from "./resolve-config.js";
import { implicitConfigJson, printImplicitConfigNotice } from "./implicit.js";

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
    info(JSON.stringify({ results, strict: strict === true, ...implicitConfigJson(resolved) }, null, 2));
    return allOk ? 0 : 1;
  }

  printImplicitConfigNotice(resolved, json);
  for (const r of results) {
    if (r.ok) {
      success(`${color.cyan(r.raw)} ${color.dim("ok")} ${color.dim(`(${r.line ?? "orphan"})`)}`);
    } else {
      printError(`${r.raw} (${r.anomaly})`);
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

    if (flags.tag) {
      const line = selectLine(config, flags.tag);
      return emitCheck(
        checkTags(targets, [line], { strict: flags.strict, existingTags }),
        resolved,
        flags.json,
        flags.strict,
      );
    }

    return emitCheck(
      checkTags(targets, config.lines, { strict: flags.strict, existingTags }),
      resolved,
      flags.json,
      flags.strict,
    );
  } catch (err) {
    printError(err);
    return 1;
  }
}
