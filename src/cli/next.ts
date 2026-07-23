import { createModel } from "../core/models/index.js";
import { planNext } from "../core/plan.js";
import { assignTagsToLines, selectLine } from "../core/lines.js";
import { ensureRepo, fetchTags, listTags } from "../git/git.js";
import { color, info, printError, warn } from "./ui.js";
import { printNextStepsAfterNext } from "./guidance.js";
import { requireWorkspaceChanges } from "./workspace.js";
import { resolveReleaseInput } from "./release-input.js";
import { resolveConfig } from "./resolve-config.js";
import { implicitConfigJson, printImplicitConfigNotice } from "./implicit.js";

export interface NextFlags {
  level?: string;
  json?: boolean;
  hints?: boolean;
  tag?: string;
  fetch?: boolean;
  remote?: string;
  fromCommits?: boolean;
  requireChanges?: boolean;
}

export async function runNext(cwd: string, flags: NextFlags): Promise<number> {
  try {
    const resolved = await resolveConfig(cwd);
    const { config } = resolved;
    await ensureRepo({ cwd });
    if (flags.fetch) {
      await fetchTags({ cwd, remote: flags.remote });
      if (!flags.json) info(`Fetched tags from ${flags.remote ?? "origin"}.`);
    }
    const line = selectLine(config, flags.tag);
    const model = createModel(line.model);
    const allTags = await listTags({ cwd });
    const lineTags = assignTagsToLines(allTags, config.lines).byLine.get(line.name) ?? [];
    const { level, recommendation } = await resolveReleaseInput({
      cwd,
      line,
      model,
      lineTags,
      level: flags.level,
      fromCommits: flags.fromCommits,
    });
    const plan = planNext(line, model, lineTags, level);
    if (flags.requireChanges) {
      await requireWorkspaceChanges(cwd, line, plan.analysis.latest?.raw ?? null);
    }

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
            workspace: line.workspace ?? null,
            recommendation,
            ...implicitConfigJson(resolved),
          },
          null,
          2,
        ),
      );
      return 0;
    }

    printImplicitConfigNotice(resolved, flags.json);

    if (recommendation) {
      info(
        `Conventional Commits recommend a ${recommendation.level} release (${recommendation.reasons.length} matching commit(s)).`,
      );
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
    return 1;
  }
}
