import { describe, expect, it } from "vitest";
import { auditTags } from "../src/core/audit.js";
import type { TagLine } from "../src/types.js";

const app: TagLine = {
  name: "app",
  pattern: "v{version}",
  model: { type: "semver" },
  initialVersion: "0.1.0",
  push: false,
};

const release: TagLine = {
  name: "release",
  pattern: "release/{version}",
  model: { type: "build" },
  initialVersion: "1",
  push: false,
};

describe("auditTags", () => {
  it("reports per-line semantic history, an orphan warning, and no errors", () => {
    const report = auditTags(["v1.0.0", "v1.2.0", "release/4", "legacy"], [app, release]);

    expect(report.ok).toBe(true);
    expect(report.lines).toEqual([
      expect.objectContaining({
        line: "app",
        latest: "v1.2.0",
        conforming: [
          { tag: "v1.2.0", version: "1.2.0" },
          { tag: "v1.0.0", version: "1.0.0" },
        ],
      }),
      expect.objectContaining({
        line: "release",
        latest: "release/4",
      }),
    ]);
    expect(report.orphans).toEqual(["legacy"]);
    expect(report.diagnostics).toContainEqual({
      code: "orphan-tag",
      severity: "warning",
      message: 'Tag "legacy" does not match any configured tag line.',
      tag: "legacy",
    });
  });

  it("reports malformed and duplicate versions as errors", () => {
    const report = auditTags(["v1.0.0", "v1.0.0+build", "vbroken"], [app]);

    expect(report.ok).toBe(false);
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "duplicate-version",
        severity: "error",
        tag: "v1.0.0+build",
        line: "app",
      }),
      expect.objectContaining({
        code: "unparseable-version",
        severity: "error",
        tag: "vbroken",
        line: "app",
      }),
    ]));
  });

  it("reports a matching tag as an assignment error without giving either line ownership", () => {
    const bare: TagLine = { ...app, name: "bare", pattern: "{version}" };
    const report = auditTags(["v1.0.0"], [app, bare]);

    expect(report.ok).toBe(false);
    expect(report.lines.map((line) => line.conforming)).toEqual([[], []]);
    expect(report.ambiguous).toEqual([
      { tag: "v1.0.0", lines: ["app", "bare"] },
    ]);
    expect(report.diagnostics).toContainEqual({
      code: "ambiguous-assignment",
      severity: "error",
      message: 'Tag "v1.0.0" matches multiple tag lines: app, bare.',
      tag: "v1.0.0",
      lines: ["app", "bare"],
    });
  });
});

describe("auditTags pattern overlap", () => {
  const rc: TagLine = { ...app, name: "rc", pattern: "v{version}-rc" };
  const crossed: TagLine = { ...app, name: "crossed", pattern: "{version}v" };

  it("reports no overlap for disjoint lines, with or without tags", () => {
    const report = auditTags(["v1.0.0", "release/4"], [app, release]);

    expect(report.overlaps).toEqual([]);
    expect(report.diagnostics.map((item) => item.code))
      .not.toContain("pattern-overlap-certain");
  });

  it("warns before a collision exists, without failing the audit", () => {
    const report = auditTags(["v1.0.0"], [app, rc]);

    expect(report.ok).toBe(true);
    expect(report.overlaps).toEqual([
      expect.objectContaining({ a: "app", b: "rc", witness: "v0.1.0-rc" }),
    ]);
    expect(report.diagnostics).toContainEqual({
      code: "pattern-overlap-certain",
      severity: "warning",
      message:
        'Tag lines "app" and "rc" can produce the same tag: line "rc" renders "v0.1.0-rc" for version 0.1.0, which the other line also matches.',
      tag: "v0.1.0-rc",
      lines: ["app", "rc"],
    });
  });

  it("separates a theoretical collision from one a line really renders", () => {
    const report = auditTags([], [app, crossed]);

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "pattern-overlap-possible",
      severity: "warning",
      tag: "v0v",
      lines: ["app", "crossed"],
    }));
  });

  it("raises overlap diagnostics to errors only under strictOverlap", () => {
    const report = auditTags(["v1.0.0"], [app, rc], { strictOverlap: true });

    expect(report.ok).toBe(false);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "pattern-overlap-certain",
      severity: "error",
    }));
  });

  it("keeps single-line configurations free of overlap output", () => {
    const report = auditTags(["v1.0.0"], [app], { strictOverlap: true });

    expect(report.ok).toBe(true);
    expect(report.overlaps).toEqual([]);
  });
});
