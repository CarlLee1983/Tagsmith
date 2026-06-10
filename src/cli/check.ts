import { loadConfig, MissingConfigError } from "../core/config.js";
import { compilePattern } from "../core/pattern.js";
import { createModel } from "../core/models/index.js";
import { checkTags } from "../core/check.js";
import { analyzeTags } from "../core/analyze.js";
import { ensureRepo, listTags, GitError } from "../git/git.js";
import { color, info, printError, success } from "./ui.js";
import { printFirstRunHint } from "./guidance.js";

export interface CheckFlags {
  json?: boolean;
}

export async function runCheck(
  cwd: string,
  tags: string[],
  flags: CheckFlags,
): Promise<number> {
  try {
    const config = await loadConfig(cwd);
    const pattern = compilePattern(config.pattern);
    const model = createModel(config.model);

    if (tags.length > 0) {
      return await runExplicit(cwd, pattern, model, tags, flags);
    }
    return await runLint(cwd, pattern, model, flags);
  } catch (err) {
    printError(err);
    if (err instanceof MissingConfigError) printFirstRunHint({ json: flags.json });
    return 1;
  }
}

async function runExplicit(
  cwd: string,
  pattern: ReturnType<typeof compilePattern>,
  model: ReturnType<typeof createModel>,
  tags: string[],
  flags: CheckFlags,
): Promise<number> {
  // 重複偵測為盡力而為：在 repo 內才讀既有 tags。
  let existing: string[] = [];
  try {
    await ensureRepo({ cwd });
    existing = await listTags({ cwd });
  } catch (err) {
    if (!(err instanceof GitError)) throw err;
  }

  const result = checkTags(pattern, model, tags, existing);

  if (flags.json) {
    info(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  for (const c of result.checks) {
    if (c.ok) {
      success(`${color.cyan(c.tag)} ${color.dim("ok")}`);
    } else {
      printError(`${c.tag} (${c.anomaly})`);
    }
  }
  return result.ok ? 0 : 1;
}

async function runLint(
  cwd: string,
  pattern: ReturnType<typeof compilePattern>,
  model: ReturnType<typeof createModel>,
  flags: CheckFlags,
): Promise<number> {
  await ensureRepo({ cwd });
  const tags = await listTags({ cwd });
  const analysis = analyzeTags(tags, pattern, model);
  const ok = analysis.anomalies.length === 0;

  if (flags.json) {
    info(
      JSON.stringify(
        {
          ok,
          anomalies: analysis.anomalies.map((t) => ({
            tag: t.raw,
            reason: t.anomaly,
          })),
        },
        null,
        2,
      ),
    );
    return ok ? 0 : 1;
  }

  if (ok) {
    success(`All ${analysis.conforming.length} tag(s) conform to the spec.`);
    return 0;
  }
  for (const t of analysis.anomalies) {
    printError(`${t.raw} (${t.anomaly})`);
  }
  return 1;
}
