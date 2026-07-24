import type { AssertRegistered, DiagnosticSeverity } from "../diagnostics.js";
import type { ReleasePolicy } from "../../types.js";
import { matchSource } from "../merge-policy/match.js";

export type ReleaseCheckStatus = "pass" | "warn" | "fail" | "not-applicable";

export interface ReleaseReadinessCheck {
  code:
    | "release-branch"
    | "release-worktree"
    | "release-remote"
    | "release-annotation"
    | "release-target"
    | "release-signature"
    | "release-artifact";
  status: ReleaseCheckStatus;
  message: string;
}

/** The registry proves each code below is published; see `diagnostics.ts`. */
export type ReleaseReadinessDiagnosticCode = AssertRegistered<
  | "release-branch-not-allowed"
  | "release-worktree-dirty"
  | "release-remote-not-checked"
  | "release-annotation-required"
  | "release-target-not-head"
  | "release-signature-required"
  | "release-artifact-not-configured"
  | "release-artifact-version-invalid"
>;

export interface ReleaseReadinessDiagnostic {
  code: ReleaseReadinessDiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
}

export interface ReleaseCandidate {
  tag: string;
  target: string;
  annotated: boolean;
  signed: boolean;
}

export interface ReleaseReadinessFacts {
  branch: string;
  worktreeClean: boolean;
  head: string;
  /** Omit for a repository audit that is not evaluating one concrete create. */
  candidate?: ReleaseCandidate;
  /** Present only when a caller intentionally checked a named remote. */
  remote?: { checked: boolean; name?: string };
  /** Candidate artifact evidence gathered by the CLI from the target commit. */
  artifact?: { configured: boolean; ok: boolean; message: string };
}

export interface ReleaseReadiness {
  enabled: boolean;
  ok: boolean;
  checks: ReleaseReadinessCheck[];
  diagnostics: ReleaseReadinessDiagnostic[];
}

/**
 * Apply configured release rules to already-collected Git facts. The function
 * is deliberately IO-free so audit and create share every policy decision.
 */
export function evaluateReleaseReadiness(
  policy: ReleasePolicy | undefined,
  facts: ReleaseReadinessFacts,
): ReleaseReadiness {
  if (!policy) return { enabled: false, ok: true, checks: [], diagnostics: [] };

  const checks: ReleaseReadinessCheck[] = [];
  const diagnostics: ReleaseReadinessDiagnostic[] = [];
  const fail = (
    check: ReleaseReadinessCheck["code"],
    code: ReleaseReadinessDiagnostic["code"],
    message: string,
  ): void => {
    checks.push({ code: check, status: "fail", message });
    diagnostics.push({ code, severity: "error", message });
  };
  const warn = (message: string): void => {
    checks.push({ code: "release-remote", status: "warn", message });
    diagnostics.push({
      code: "release-remote-not-checked",
      severity: "warning",
      message,
    });
  };

  if (policy.allowedBranches === undefined) {
    checks.push({
      code: "release-branch",
      status: "not-applicable",
      message: "No allowedBranches rule is configured.",
    });
  } else if (facts.branch !== "" && policy.allowedBranches.some((pattern) => matchSource(pattern, facts.branch))) {
    checks.push({
      code: "release-branch",
      status: "pass",
      message: `Branch "${facts.branch}" is allowed to release.`,
    });
  } else {
    const actual = facts.branch === "" ? "detached HEAD" : `branch "${facts.branch}"`;
    fail(
      "release-branch",
      "release-branch-not-allowed",
      `Release is not allowed from ${actual}; allowedBranches: ${policy.allowedBranches.join(", ")}.`,
    );
  }

  if (facts.remote) {
    if (facts.remote.checked) {
      checks.push({
        code: "release-remote",
        status: "pass",
        message: `Remote "${facts.remote.name ?? "origin"}" tags were fetched for this audit.`,
      });
    } else {
      warn("Remote tags were not checked; rerun audit with --fetch before releasing.");
    }
  }

  if (!policy.requireCleanWorktree) {
    checks.push({
      code: "release-worktree",
      status: "not-applicable",
      message: "A clean worktree is not required.",
    });
  } else if (facts.worktreeClean) {
    checks.push({ code: "release-worktree", status: "pass", message: "Worktree is clean." });
  } else {
    fail(
      "release-worktree",
      "release-worktree-dirty",
      "Worktree is dirty; commit, stash, or discard changes before releasing.",
    );
  }

  if (!facts.candidate) {
    checks.push(
      {
        code: "release-annotation",
        status: "not-applicable",
        message: "Annotation is checked when create supplies a candidate tag.",
      },
      {
        code: "release-target",
        status: "not-applicable",
        message: "Target is checked when create supplies a candidate tag.",
      },
      {
        code: "release-signature",
        status: "not-applicable",
        message: "Signature is checked when create supplies a candidate tag.",
      },
      {
        code: "release-artifact",
        status: "not-applicable",
        message: "Artifact version is checked when create supplies a candidate tag.",
      },
    );
  } else {
    evaluateCandidate(policy, facts, checks, fail);
  }

  return {
    enabled: true,
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    checks,
    diagnostics,
  };
}

function evaluateCandidate(
  policy: ReleasePolicy,
  facts: ReleaseReadinessFacts,
  checks: ReleaseReadinessCheck[],
  fail: (
    check: ReleaseReadinessCheck["code"],
    code: ReleaseReadinessDiagnostic["code"],
    message: string,
  ) => void,
): void {
  const candidate = facts.candidate!;
  if (!policy.requireAnnotatedTag) {
    checks.push({
      code: "release-annotation",
      status: "not-applicable",
      message: "An annotated tag is not required.",
    });
  } else if (candidate.annotated) {
    checks.push({
      code: "release-annotation",
      status: "pass",
      message: `Candidate "${candidate.tag}" will be annotated.`,
    });
  } else {
    fail(
      "release-annotation",
      "release-annotation-required",
      `Candidate "${candidate.tag}" must be annotated; pass --message <text>.`,
    );
  }

  if (!policy.requireHeadTag) {
    checks.push({
      code: "release-target",
      status: "not-applicable",
      message: "The tag target is not required to be HEAD.",
    });
  } else if (candidate.target === facts.head) {
    checks.push({
      code: "release-target",
      status: "pass",
      message: `Candidate "${candidate.tag}" targets HEAD.`,
    });
  } else {
    fail(
      "release-target",
      "release-target-not-head",
      `Candidate "${candidate.tag}" targets a commit other than HEAD.`,
    );
  }

  if (policy.signature !== "required") {
    checks.push({
      code: "release-signature",
      status: "not-applicable",
      message: "A signed tag is not required.",
    });
  } else if (candidate.signed) {
    checks.push({
      code: "release-signature",
      status: "pass",
      message: `Candidate "${candidate.tag}" will be signed by Git.`,
    });
  } else {
    fail(
      "release-signature",
      "release-signature-required",
      `Candidate "${candidate.tag}" must be signed; pass --sign with a configured Git signing key.`,
    );
  }

  if (!policy.requireArtifactVersion) {
    checks.push({
      code: "release-artifact",
      status: "not-applicable",
      message: "An artifact version match is not required.",
    });
  } else if (!facts.artifact || !facts.artifact.configured) {
    fail(
      "release-artifact",
      "release-artifact-not-configured",
      `Candidate "${candidate.tag}" requires an artifact version check; configure artifact: { type: "package-json" } on its tag line.`,
    );
  } else if (!facts.artifact.ok) {
    fail(
      "release-artifact",
      "release-artifact-version-invalid",
      facts.artifact.message,
    );
  } else {
    checks.push({
      code: "release-artifact",
      status: "pass",
      message: facts.artifact.message,
    });
  }

}
