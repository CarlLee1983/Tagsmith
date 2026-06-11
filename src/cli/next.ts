import { loadConfig, MissingConfigError } from "../core/config.js";
import { createModel } from "../core/models/index.js";
import { planNext } from "../core/plan.js";
import { assignTagsToLines, selectLine } from "../core/lines.js";
import { ensureRepo, listTags } from "../git/git.js";
import type { BumpLevel } from "../types.js";
import { color, info, printError, warn } from "./ui.js";
import { printFirstRunHint, printNextStepsAfterNext } from "./guidance.js";

export interface NextFlags {
  level?: string;
  json?: boolean;
  hints?: boolean;
  tag?: string;
}

const LEVELS: BumpLevel[] = ["major", "minor", "patch", "prerelease", "auto"];

export async function runNext(cwd: string, flags: NextFlags): Promise<number> {
  try {
    const level = resolveLevel(flags.level);
    const config = await loadConfig(cwd);
    await ensureRepo({ cwd });
    const line = selectLine(config, flags.tag);
    const model = createModel(line.model);
    const allTags = await listTags({ cwd });
    const lineTags = assignTagsToLines(allTags, config.lines).byLine.get(line.name) ?? [];
    const plan = planNext(line, model, lineTags, level);

    if (plan.fresh && plan.analysis.anomalies.length > 0 && !flags.json) {
      warn(
        `${plan.analysis.anomalies.length} non-conforming tag(s) ignored; treating repo as having no prior version. Run \`tagsmith list\` to inspect.`,
      );
    }

    if (flags.json) {
      info(
        JSON.stringify(
          {
            tag: plan.tag,
            version: plan.version,
            fromVersion: plan.fromVersion,
            fresh: plan.fresh,
            line: line.name,
          },
          null,
          2,
        ),
      );
      return 0;
    }

    if (plan.fresh) {
      info(`${color.cyan(plan.tag)} ${color.dim("(initial — no prior tag)")}`);
    } else {
      info(
        `${color.cyan(plan.tag)} ${color.dim(`(from ${plan.fromVersion})`)}`,
      );
    }
    if (flags.hints !== false) printNextStepsAfterNext({ level, json: flags.json });
    return 0;
  } catch (err) {
    printError(err);
    if (err instanceof MissingConfigError) printFirstRunHint({ json: flags.json });
    return 1;
  }
}

function resolveLevel(raw: string | undefined): BumpLevel {
  if (raw === undefined) return "patch";
  if ((LEVELS as string[]).includes(raw)) return raw as BumpLevel;
  throw new Error(`Invalid level "${raw}". Expected one of: ${LEVELS.join(", ")}`);
}
