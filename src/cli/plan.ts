import { createModel } from "../core/models/index.js";
import {
  planReleaseLine,
  releasePlanBlockers,
  type ReleasePlanBlocker,
  type ReleasePlanLine,
} from "../core/release-plan.js";
import { ambiguousAssignmentsForLine, assignTagsToLines } from "../core/lines.js";
import { planNext } from "../core/plan.js";
import {
  ensureCompleteHistory,
  ensureRepo,
  fetchTags,
  hasCommittedChanges,
  listCommitMessages,
  listTags,
} from "../git/git.js";
import { emitJson, emitJsonError, type JsonDiagnostic } from "./json.js";
import { configMetadata, printImplicitConfigNotice } from "./implicit.js";
import { printError, info, success, warn } from "./ui.js";
import { resolveConfig } from "./resolve-config.js";

export interface PlanFlags {
  all?: boolean;
  json?: boolean;
  fetch?: boolean;
  remote?: string;
  fromCommits?: boolean;
  requireChanges?: boolean;
}

/** Read-only multi-line release planning; it never creates, pushes, or edits a tag. */
export async function runPlan(cwd: string, flags: PlanFlags): Promise<number> {
  try {
    if (!flags.all) {
      throw new Error("`tagsmith plan` requires --all so every configured tag line is considered.");
    }
    const resolved = await resolveConfig(cwd);
    const { config } = resolved;
    await ensureRepo({ cwd });
    if (flags.fetch) await fetchTags({ cwd, remote: flags.remote });

    const assignment = assignTagsToLines(await listTags({ cwd }), config.lines);
    const lines: ReleasePlanLine[] = [];
    for (const line of config.lines) {
      const model = createModel(line.model);
      const assignmentBlockers = ambiguousBlockers(assignment, line.name);
      const blockers = releasePlanBlockers(
        line,
        { fromCommits: flags.fromCommits === true, requireChanges: flags.requireChanges },
        assignmentBlockers,
      );
      const lineTags = assignment.byLine.get(line.name) ?? [];
      if (blockers.length > 0) {
        lines.push(planReleaseLine({
          line,
          model,
          existingTags: lineTags,
          changed: null,
          commits: [],
          fromCommits: flags.fromCommits === true,
          requireChanges: flags.requireChanges,
          commitPolicy: config.commitPolicy,
          blockers: assignmentBlockers,
        }));
        continue;
      }

      // This uses the same baseline as next before Git probes select the commit range.
      const baseline = planNext(line, model, lineTags);
      const latestTag = baseline.analysis.latest?.raw ?? null;
      if (flags.fromCommits) {
        await ensureCompleteHistory({ cwd });
      }
      const changed = await hasCommittedChanges({
        cwd,
        workspace: line.workspace,
        since: latestTag,
      });
      const commits = await listCommitMessages({
        cwd,
        from: latestTag ?? undefined,
        workspace: line.workspace,
      });
      lines.push(planReleaseLine({
        line,
        model,
        existingTags: lineTags,
        changed,
        commits,
        fromCommits: flags.fromCommits === true,
        requireChanges: flags.requireChanges,
        commitPolicy: config.commitPolicy,
      }));
    }

    const diagnostics = diagnosticsForLines(lines);
    const hasReleases = lines.some((line) => line.status === "ready");
    const blocked = lines.some((line) => line.status === "blocked");
    const remote = flags.fetch
      ? { checked: true, name: flags.remote ?? "origin" }
      : { checked: false };

    if (flags.json) {
      emitJson(
        "plan",
        {
          config: configMetadata(resolved),
          defaultLine: config.default,
          hasReleases,
          lines,
          remote,
        },
        diagnostics,
      );
      return blocked ? 1 : 0;
    }

    printImplicitConfigNotice(resolved);
    if (flags.fetch) info(`Fetched tags from ${flags.remote ?? "origin"}.`);
    for (const line of lines) printLine(line);
    if (blocked) {
      info("Release plan blocked; resolve the listed lines before creating tags.");
      return 1;
    }
    success(hasReleases ? "Release plan ready." : "Release plan complete: no releases needed.");
    return 0;
  } catch (err) {
    if (flags.json) emitJsonError("plan", err);
    else printError(err);
    return 1;
  }
}

function ambiguousBlockers(
  assignment: ReturnType<typeof assignTagsToLines>,
  lineName: string,
): ReleasePlanBlocker[] {
  const ambiguous = ambiguousAssignmentsForLine(assignment, lineName);
  if (ambiguous.length === 0) return [];
  const details = ambiguous
    .map((item) => `${item.tag} (${item.lines.join(", ")})`)
    .join(", ");
  return [{
    code: "ambiguous-assignment",
    message: `Tag line "${lineName}" has ambiguous tag assignment: ${details}. Run \`tagsmith audit\` to inspect.`,
  }];
}

function diagnosticsForLines(lines: readonly ReleasePlanLine[]): JsonDiagnostic[] {
  return lines.flatMap((line) => [
    ...line.blockers.map((blocker) => ({
      code: blocker.code,
      severity: "error" as const,
      message: blocker.message,
      line: line.line,
    })),
    ...line.anomalies.map((anomaly) => ({
      code: anomaly.reason,
      severity: "warning" as const,
      message: `Tag "${anomaly.tag}" is not conforming and was excluded from release planning for line "${line.line}".`,
      tag: anomaly.tag,
      line: line.line,
    })),
  ]);
}

function printLine(line: ReleasePlanLine): void {
  switch (line.status) {
    case "ready":
      info(`${line.line}: ready → ${line.candidate!.tag} (${line.bump}; ${line.commits.length} commit(s))`);
      for (const reason of line.recommendation?.reasons ?? []) {
        info(`  ${reason.id.slice(0, 12)} [${reason.rule}] ${reason.level}: ${reason.summary}`);
      }
      return;
    case "skipped":
      if (line.changed) {
        info(`${line.line}: skipped — no release-worthy Conventional Commits.`);
      } else {
        info(`${line.line}: skipped — no committed changes since ${line.latestTag ?? "the start of history"}.`);
      }
      return;
    case "blocked":
      for (const blocker of line.blockers) warn(`${line.line}: blocked [${blocker.code}] ${blocker.message}`);
      return;
  }
}
