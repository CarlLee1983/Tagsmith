import { auditTags } from "../core/audit.js";
import type { ArtifactVersionReport } from "../core/artifact.js";
import { createModel } from "../core/models/index.js";
import { ensureRepo, fetchTags, listTags } from "../git/git.js";
import { emitJson, emitJsonError } from "./json.js";
import { configMetadata, printImplicitConfigNotice } from "./implicit.js";
import {
  inspectReleaseReadiness,
  printReleaseReadiness,
} from "./release-readiness.js";
import { printError, info, success, warn } from "./ui.js";
import { resolveConfig } from "./resolve-config.js";
import { inspectArtifactVersion, printArtifactVersion } from "./artifact.js";

export interface AuditFlags {
  json?: boolean;
  fetch?: boolean;
  remote?: string;
}

/** Audit local tag history; remote tags are fetched only when explicitly requested. */
export async function runAudit(cwd: string, flags: AuditFlags): Promise<number> {
  try {
    const resolved = await resolveConfig(cwd);
    await ensureRepo({ cwd });
    if (flags.fetch) await fetchTags({ cwd, remote: flags.remote });
    const report = auditTags(await listTags({ cwd }), resolved.config.lines);
    const artifacts = await auditArtifactVersions(cwd, resolved.config.lines, report.lines);
    const remote = flags.fetch
      ? { checked: true, name: flags.remote ?? "origin" }
      : { checked: false };
    const releaseReadiness = await inspectReleaseReadiness(
      cwd,
      resolved.config.releasePolicy,
      undefined,
      remote,
    );
    const artifactDiagnostics = artifacts.flatMap((artifact) => artifact.diagnostics);
    const diagnostics = [
      ...report.diagnostics,
      ...artifactDiagnostics,
      ...releaseReadiness.diagnostics,
    ];
    const ok = report.ok
      && artifacts.every((artifact) => artifact.status !== "fail")
      && releaseReadiness.ok;

    if (flags.json) {
      emitJson(
        "audit",
        {
          config: configMetadata(resolved),
          ...report,
          artifacts,
          ok,
          releaseReadiness,
          remote,
        },
        diagnostics,
      );
      return ok ? 0 : 1;
    }

    printImplicitConfigNotice(resolved);
    if (flags.fetch) info(`Fetched tags from ${flags.remote ?? "origin"}.`);
    else info("Remote status: not checked (pass --fetch to synchronise tags first).");
    const errorCount = diagnostics.filter((item) => item.severity === "error").length;
    const warningCount = diagnostics.length - errorCount;
    for (const line of report.lines) {
      const latest = line.latest === null ? "none" : line.latest;
      info(`${line.line}: ${line.conforming.length} conforming tag(s); latest: ${latest}`);
    }
    for (const diagnostic of report.diagnostics) {
      const prefix = `[${diagnostic.code}] ${diagnostic.message}`;
      if (diagnostic.severity === "error") printError(prefix);
      else warn(prefix);
    }
    for (const artifact of artifacts) printArtifactVersion(artifact);
    printReleaseReadiness(releaseReadiness);

    if (ok) {
      success(`Audit passed${warningCount === 0 ? "." : ` with ${warningCount} warning(s).`}`);
      return 0;
    }
    info(`Audit failed: ${errorCount} error(s), ${warningCount} warning(s).`);
    return 1;
  } catch (err) {
    if (flags.json) emitJsonError("audit", err);
    else printError(err);
    return 1;
  }
}

/** Audit immutable manifest content at each historical, conforming tag. */
async function auditArtifactVersions(
  cwd: string,
  lines: Parameters<typeof auditTags>[1],
  auditLines: ReturnType<typeof auditTags>["lines"],
): Promise<ArtifactVersionReport[]> {
  const reports: ArtifactVersionReport[] = [];
  for (const line of lines) {
    if (line.artifact === undefined) continue;
    const model = createModel(line.model);
    const history = auditLines.find((item) => item.line === line.name);
    for (const tag of history?.conforming ?? []) {
      reports.push(await inspectArtifactVersion(
        cwd,
        line,
        model,
        tag.tag,
        tag.version,
        tag.tag,
      ));
    }
  }
  return reports;
}
