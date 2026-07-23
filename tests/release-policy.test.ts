import { describe, expect, it } from "vitest";
import { evaluateReleaseReadiness } from "../src/core/release-policy/validate.js";
import type { ReleasePolicy } from "../src/types.js";

const strictPolicy: ReleasePolicy = {
  allowedBranches: ["main", "release/*"],
  requireCleanWorktree: true,
  requireAnnotatedTag: true,
  requireHeadTag: true,
  signature: "required",
  requireArtifactVersion: true,
};

describe("evaluateReleaseReadiness", () => {
  it("passes every configured check for a ready signed candidate", () => {
    const report = evaluateReleaseReadiness(strictPolicy, {
      branch: "release/0.6",
      worktreeClean: true,
      head: "abc123",
      candidate: {
        tag: "v0.6.0",
        target: "abc123",
        annotated: true,
        signed: true,
      },
      artifact: { configured: true, ok: true, message: "Artifact matches." },
    });

    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => check.status)).toEqual([
      "pass", "pass", "pass", "pass", "pass", "pass",
    ]);
    expect(report.diagnostics).toEqual([]);
  });

  it("returns stable failure codes for every blocked candidate condition", () => {
    const report = evaluateReleaseReadiness(strictPolicy, {
      branch: "feature/unsafe",
      worktreeClean: false,
      head: "abc123",
      candidate: {
        tag: "v0.6.0",
        target: "older456",
        annotated: false,
        signed: false,
      },
      artifact: { configured: true, ok: false, message: "Artifact does not match." },
    });

    expect(report.ok).toBe(false);
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "release-branch-not-allowed",
      "release-worktree-dirty",
      "release-annotation-required",
      "release-target-not-head",
      "release-signature-required",
      "release-artifact-version-invalid",
    ]);
  });

  it("requires an artifact configuration only when that policy guardrail is enabled", () => {
    const report = evaluateReleaseReadiness(strictPolicy, {
      branch: "main",
      worktreeClean: true,
      head: "abc123",
      candidate: { tag: "v0.6.0", target: "abc123", annotated: true, signed: true },
    });

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "release-artifact-not-configured",
    }));
  });

  it("audits repository-level facts without inventing a candidate tag", () => {
    const report = evaluateReleaseReadiness(strictPolicy, {
      branch: "main",
      worktreeClean: true,
      head: "abc123",
    });

    expect(report.ok).toBe(true);
    expect(report.checks.slice(2).map((check) => check.status)).toEqual([
      "not-applicable", "not-applicable", "not-applicable", "not-applicable",
    ]);
  });

  it("warns, without blocking, when an audit intentionally skips remote fetch", () => {
    const report = evaluateReleaseReadiness(strictPolicy, {
      branch: "main",
      worktreeClean: true,
      head: "abc123",
      remote: { checked: false },
    });

    expect(report.ok).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({
      code: "release-remote",
      status: "warn",
    }));
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "release-remote-not-checked",
      severity: "warning",
    }));
  });
});
