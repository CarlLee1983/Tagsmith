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
