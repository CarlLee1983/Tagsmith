import type { TagAnomaly } from "../types.js";

/**
 * The closed registry of machine-readable diagnostic codes Tagsmith can emit.
 *
 * Codes are part of the published contract: callers may switch on them without
 * parsing any message text. Groups exist for readability only — every group is
 * flattened into `DIAGNOSTIC_CODES`, which `json-output.schema.json` mirrors and
 * the contract tests compare against.
 */

/** A tag that cannot participate in planning, produced by `analyzeTags`. */
export const TAG_ANOMALY_CODES = [
  "pattern-mismatch",
  "unparseable-version",
  "duplicate-version",
  "ambiguous-assignment",
] as const;

/** Configuration-level findings that exist independently of any single tag. */
export const CONFIG_DIAGNOSTIC_CODES = [
  "orphan-tag",
  "pattern-overlap-certain",
  "pattern-overlap-possible",
  "workspace-required",
  "from-commits-unsupported",
] as const;

/** Disagreement between a tag version and the manifest committed at that tag. */
export const ARTIFACT_DIAGNOSTIC_CODES = [
  "artifact-package-json-missing",
  "artifact-package-json-malformed",
  "artifact-version-missing",
  "artifact-version-invalid",
  "artifact-version-mismatch",
] as const;

/** Unmet `releasePolicy` preconditions reported by audit and create. */
export const RELEASE_DIAGNOSTIC_CODES = [
  "release-branch-not-allowed",
  "release-worktree-dirty",
  "release-remote-not-checked",
  "release-annotation-required",
  "release-target-not-head",
  "release-signature-required",
  "release-artifact-not-configured",
  "release-artifact-version-invalid",
] as const;

/** The command could not complete; `data` is null in this case. */
export const COMMAND_DIAGNOSTIC_CODES = ["command-error"] as const;

export const DIAGNOSTIC_CODES = [
  ...TAG_ANOMALY_CODES,
  ...CONFIG_DIAGNOSTIC_CODES,
  ...ARTIFACT_DIAGNOSTIC_CODES,
  ...RELEASE_DIAGNOSTIC_CODES,
  ...COMMAND_DIAGNOSTIC_CODES,
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export type DiagnosticSeverity = "error" | "warning";

/**
 * Compile-time proof that a locally declared union is registered. Modules keep
 * their own narrow unions for readability; this makes divergence a type error
 * instead of a contract gap discovered by a caller.
 */
export type AssertRegistered<T extends DiagnosticCode> = T;

export type RegisteredTagAnomaly = AssertRegistered<TagAnomaly>;
