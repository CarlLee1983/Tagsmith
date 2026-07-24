import type { AssertRegistered } from "./diagnostics.js";
import type { TagLine, VersionModel } from "../types.js";

export type ArtifactCheckStatus = "pass" | "fail" | "not-configured";

/** The registry proves each code below is published; see `diagnostics.ts`. */
export type ArtifactDiagnosticCode = AssertRegistered<
  | "artifact-package-json-missing"
  | "artifact-package-json-malformed"
  | "artifact-version-missing"
  | "artifact-version-invalid"
  | "artifact-version-mismatch"
>;

export interface ArtifactDiagnostic {
  code: ArtifactDiagnosticCode;
  severity: "error";
  message: string;
  line: string;
  tag: string;
  path: string;
}

/** Pure, serializable result of checking one tag/candidate against its manifest. */
export interface ArtifactVersionReport {
  line: string;
  tag: string;
  expectedVersion: string;
  path: string | null;
  configured: boolean;
  status: ArtifactCheckStatus;
  actualVersion: string | null;
  diagnostics: ArtifactDiagnostic[];
}

type ArtifactReportBase = Omit<ArtifactVersionReport, "status" | "diagnostics">;

/** Repository-relative manifest path for a line's built-in artifact, if enabled. */
export function packageJsonPath(line: TagLine): string | null {
  if (line.artifact?.type !== "package-json") return null;
  return line.workspace === undefined ? "package.json" : `${line.workspace}/package.json`;
}

/**
 * Parse package.json evidence and compare it with an already-planned version.
 * File acquisition is deliberately outside this module so all decision logic
 * stays deterministic and reusable by audit and create.
 */
export function evaluateArtifactVersion(
  line: TagLine,
  model: VersionModel,
  tag: string,
  expectedVersion: string,
  contents: string | null,
): ArtifactVersionReport {
  const path = packageJsonPath(line);
  const base: ArtifactReportBase = {
    line: line.name,
    tag,
    expectedVersion,
    path,
    configured: path !== null,
    actualVersion: null,
  };
  if (path === null) {
    return { ...base, status: "not-configured", actualVersion: null, diagnostics: [] };
  }
  if (contents === null) {
    return failed(base, "artifact-package-json-missing", `Artifact manifest "${path}" is missing at ${tag}.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return failed(base, "artifact-package-json-malformed", `Artifact manifest "${path}" at ${tag} is not valid JSON.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return failed(base, "artifact-package-json-malformed", `Artifact manifest "${path}" at ${tag} must be a JSON object.`);
  }

  const rawVersion = (parsed as Record<string, unknown>).version;
  if (typeof rawVersion !== "string" || rawVersion.length === 0) {
    return failed(base, "artifact-version-missing", `Artifact manifest "${path}" at ${tag} has no non-empty string version.`);
  }
  const actual = model.parse(rawVersion);
  if (actual === null) {
    return failed(
      { ...base, actualVersion: rawVersion },
      "artifact-version-invalid",
      `Artifact version "${rawVersion}" in "${path}" is not valid for line "${line.name}"'s ${model.type} model.`,
    );
  }
  const normalized = model.format(actual);
  if (normalized !== expectedVersion) {
    return failed(
      { ...base, actualVersion: normalized },
      "artifact-version-mismatch",
      `Artifact version "${normalized}" in "${path}" does not match tag version "${expectedVersion}" for ${tag}.`,
    );
  }
  return { ...base, status: "pass", actualVersion: normalized, diagnostics: [] };
}

function failed(
  base: Omit<ArtifactVersionReport, "status" | "diagnostics">,
  code: ArtifactDiagnosticCode,
  message: string,
): ArtifactVersionReport {
  const path = base.path!;
  return {
    ...base,
    status: "fail",
    diagnostics: [{ code, severity: "error", message, line: base.line, tag: base.tag, path }],
  };
}
