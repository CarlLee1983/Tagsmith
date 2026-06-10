import { loadConfig, MissingConfigError } from "../core/config.js";
import { compilePattern } from "../core/pattern.js";
import { createModel } from "../core/models/index.js";
import { planNext, validateExplicit } from "../core/plan.js";
import { createTag, ensureRepo, listTags, pushTag } from "../git/git.js";
import type { BumpLevel } from "../types.js";
import { color, printError, success, warn } from "./ui.js";
import { printFirstRunHint, printNextStepsAfterCreate } from "./guidance.js";

export interface CreateFlags {
  level?: string;
  setVersion?: string;
  message?: string;
  push?: boolean;
  dryRun?: boolean;
  allowOutOfOrder?: boolean;
}

const LEVELS: BumpLevel[] = ["major", "minor", "patch", "prerelease", "auto"];

export async function runCreate(cwd: string, flags: CreateFlags): Promise<number> {
  try {
    const config = await loadConfig(cwd);
    await ensureRepo({ cwd });
    const model = createModel(config.model);
    const pattern = compilePattern(config.pattern);
    const tags = await listTags({ cwd });

    let tagName: string;
    if (flags.setVersion !== undefined) {
      const result = validateExplicit(config, model, flags.setVersion, tags, {
        allowOutOfOrder: flags.allowOutOfOrder,
      });
      if (!result.ok) {
        for (const e of result.errors) printError(e);
        return 1;
      }
      const parsed = model.parse(flags.setVersion)!;
      tagName = pattern.render(model.format(parsed));
    } else {
      const level = resolveLevel(flags.level);
      const plan = planNext(config, model, tags, level);
      if (plan.fresh && plan.analysis.anomalies.length > 0) {
        warn(
          `${plan.analysis.anomalies.length} non-conforming tag(s) ignored; treating repo as having no prior version.`,
        );
      }
      tagName = plan.tag;
    }

    if (tags.includes(tagName)) {
      printError(`Tag "${tagName}" already exists.`);
      return 1;
    }

    if (flags.dryRun) {
      warn(`[dry-run] would create ${color.cyan(tagName)}${flags.message ? " (annotated)" : ""}`);
      if (flags.push ?? config.push) warn(`[dry-run] would push ${tagName}`);
      return 0;
    }

    await createTag({ cwd, name: tagName, message: flags.message });
    success(`Created tag ${color.cyan(tagName)}`);

    const willPush = flags.push ?? config.push;
    if (willPush) {
      await pushTag({ cwd, name: tagName });
      success(`Pushed ${tagName}`);
    }
    printNextStepsAfterCreate({ pushed: willPush });
    return 0;
  } catch (err) {
    printError(err);
    if (err instanceof MissingConfigError) printFirstRunHint();
    return 1;
  }
}

function resolveLevel(raw: string | undefined): BumpLevel {
  if (raw === undefined) return "patch";
  if ((LEVELS as string[]).includes(raw)) return raw as BumpLevel;
  throw new Error(`Invalid level "${raw}". Expected one of: ${LEVELS.join(", ")}`);
}
