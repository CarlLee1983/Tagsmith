import {
  evaluateArtifactVersion,
  packageJsonPath,
  type ArtifactVersionReport,
} from "../core/artifact.js";
import { readFileAtRef } from "../git/git.js";
import type { TagLine, VersionModel } from "../types.js";
import { info, printError } from "./ui.js";

/** Read the configured artifact at one immutable Git ref, then apply core rules. */
export async function inspectArtifactVersion(
  cwd: string,
  line: TagLine,
  model: VersionModel,
  tag: string,
  expectedVersion: string,
  ref: string,
): Promise<ArtifactVersionReport> {
  const path = packageJsonPath(line);
  const contents = path === null ? null : await readFileAtRef({ cwd, ref, path });
  return evaluateArtifactVersion(line, model, tag, expectedVersion, contents);
}

/** Compact human output shared by audit and create policy preflight. */
export function printArtifactVersion(report: ArtifactVersionReport): void {
  if (report.status === "not-configured") {
    info(`${report.line}: artifact version check not configured.`);
    return;
  }
  if (report.status === "pass") {
    info(`${report.line}: artifact ${report.path} matches ${report.tag} (${report.expectedVersion}).`);
    return;
  }
  for (const diagnostic of report.diagnostics) printError(`[${diagnostic.code}] ${diagnostic.message}`);
}
