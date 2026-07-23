import { describe, expect, it } from "vitest";
import { planReleaseLine } from "../src/core/release-plan.js";
import { createModel } from "../src/core/models/index.js";
import type { TagLine } from "../src/types.js";

const apiLine: TagLine = {
  name: "api",
  workspace: "packages/api",
  pattern: "api/v{version}",
  model: { type: "semver" },
  initialVersion: "0.1.0",
  push: false,
};

describe("planReleaseLine", () => {
  it("returns a candidate consistent with a Conventional Commit recommendation", () => {
    const result = planReleaseLine({
      line: apiLine,
      model: createModel(apiLine.model),
      existingTags: ["api/v1.0.0"],
      changed: true,
      commits: [{ id: "a1", message: "feat(api): add search" }],
      fromCommits: true,
    });

    expect(result).toMatchObject({
      line: "api",
      status: "ready",
      changed: true,
      bump: "minor",
      candidate: {
        tag: "api/v1.1.0",
        version: "1.1.0",
        fromVersion: "1.0.0",
      },
      recommendation: { level: "minor" },
      commits: [{ id: "a1", summary: "feat(api): add search" }],
      blockers: [],
    });
  });

  it("skips a line with no committed changes without manufacturing a candidate", () => {
    const result = planReleaseLine({
      line: apiLine,
      model: createModel(apiLine.model),
      existingTags: ["api/v1.0.0"],
      changed: false,
      commits: [],
      fromCommits: false,
    });

    expect(result).toMatchObject({
      status: "skipped",
      changed: false,
      bump: null,
      candidate: null,
      blockers: [],
    });
  });

  it("skips changed SemVer work with no release-worthy Conventional Commit", () => {
    const result = planReleaseLine({
      line: apiLine,
      model: createModel(apiLine.model),
      existingTags: ["api/v1.0.0"],
      changed: true,
      commits: [{ id: "a2", message: "docs(api): clarify setup" }],
      fromCommits: true,
    });

    expect(result).toMatchObject({
      status: "skipped",
      changed: true,
      bump: null,
      candidate: null,
      recommendation: { level: null, reasons: [] },
    });
  });

  it("reports supplied safety blockers without planning a tag", () => {
    const result = planReleaseLine({
      line: apiLine,
      model: createModel(apiLine.model),
      existingTags: ["api/v1.0.0"],
      changed: null,
      commits: [],
      fromCommits: false,
      blockers: [{ code: "ambiguous-assignment", message: "history is ambiguous" }],
    });

    expect(result).toMatchObject({
      status: "blocked",
      changed: null,
      candidate: null,
      blockers: [{ code: "ambiguous-assignment" }],
    });
  });
});
