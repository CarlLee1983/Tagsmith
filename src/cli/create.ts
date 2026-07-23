import { compilePattern } from "../core/pattern.js";
import { createModel } from "../core/models/index.js";
import { planNext, validateExplicit } from "../core/plan.js";
import { assignTagsToLines, selectLine } from "../core/lines.js";
import { createTag, ensureRepo, fetchTags, listTags, pushTag } from "../git/git.js";
import { color, info, printError, success, warn } from "./ui.js";
import { printNextStepsAfterCreate } from "./guidance.js";
import { requireWorkspaceChanges } from "./workspace.js";
import { resolveReleaseInput } from "./release-input.js";
import { resolveConfig } from "./resolve-config.js";
import { printImplicitConfigNotice } from "./implicit.js";

export interface CreateFlags {
  level?: string;
  setVersion?: string;
  message?: string;
  push?: boolean;
  dryRun?: boolean;
  allowOutOfOrder?: boolean;
  tag?: string;
  fetch?: boolean;
  remote?: string;
  fromCommits?: boolean;
  requireChanges?: boolean;
}

export async function runCreate(cwd: string, flags: CreateFlags): Promise<number> {
  try {
    const resolved = await resolveConfig(cwd);
    const { config } = resolved;
    await ensureRepo({ cwd });
    const line = selectLine(config, flags.tag);
    const model = createModel(line.model);
    const pattern = compilePattern(line.pattern);
    const willPush = flags.push ?? line.push;
    // A dry-run remains local by default; callers can still ask for an exact
    // remote preview with --fetch.
    const shouldFetch = flags.fetch === true || (willPush && !flags.dryRun);
    if (shouldFetch) {
      await fetchTags({ cwd, remote: flags.remote });
      if (!flags.dryRun) info(`Fetched tags from ${flags.remote ?? "origin"}.`);
    }
    const allTags = await listTags({ cwd });
    const lineTags = assignTagsToLines(allTags, config.lines).byLine.get(line.name) ?? [];

    let tagName: string;
    if (flags.setVersion !== undefined) {
      if (flags.fromCommits) {
        throw new Error("--from-commits cannot be combined with --set-version.");
      }
      const result = validateExplicit(line, model, flags.setVersion, lineTags, {
        allowOutOfOrder: flags.allowOutOfOrder,
      });
      if (!result.ok) {
        for (const e of result.errors) printError(e);
        return 1;
      }
      const parsed = model.parse(flags.setVersion)!;
      tagName = pattern.render(model.format(parsed));
    } else {
      const { level, recommendation } = await resolveReleaseInput({
        cwd,
        line,
        model,
        lineTags,
        level: flags.level,
        fromCommits: flags.fromCommits,
      });
      const plan = planNext(line, model, lineTags, level);
      if (plan.fresh && plan.analysis.anomalies.length > 0) {
        warn(
          `${plan.analysis.anomalies.length} non-conforming tag(s) ignored; treating repo as having no prior version.`,
        );
      }
      if (recommendation) {
        info(
          `Conventional Commits recommend a ${recommendation.level} release (${recommendation.reasons.length} matching commit(s)).`,
        );
      }
      tagName = plan.tag;
    }

    if (lineTags.includes(tagName)) {
      printError(`Tag "${tagName}" already exists.`);
      return 1;
    }

    if (flags.requireChanges) {
      const latest = planNext(line, model, lineTags).analysis.latest?.raw ?? null;
      await requireWorkspaceChanges(cwd, line, latest);
    }

    if (flags.dryRun) {
      printImplicitConfigNotice(resolved);
      warn(`[dry-run] would create ${color.cyan(tagName)}${flags.message ? " (annotated)" : ""}`);
      if (flags.push ?? line.push) warn(`[dry-run] would push ${tagName}`);
      return 0;
    }

    printImplicitConfigNotice(resolved);
    await createTag({ cwd, name: tagName, message: flags.message });
    success(`Created tag ${color.cyan(tagName)}`);

    if (willPush) {
      await pushTag({ cwd, name: tagName, remote: flags.remote });
      success(`Pushed ${tagName}`);
    }
    printNextStepsAfterCreate({ pushed: willPush, tag: tagName });
    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}
