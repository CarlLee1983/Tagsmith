import { describe, expect, it } from "vitest";
import { checkTags } from "../src/core/check.js";
import type { TagLine } from "../src/types.js";

const line: TagLine = {
  name: "app",
  pattern: "v{version}",
  model: { type: "semver" },
  initialVersion: "0.1.0",
  push: false,
};

describe("checkTags", () => {
  it("classifies a tag against its matching line", () => {
    expect(checkTags(["v1.2.3"], [line])).toEqual([
      {
        raw: "v1.2.3",
        line: "app",
        matches: ["app"],
        ok: true,
        anomaly: null,
      },
    ]);
  });

  it("keeps the matching line on a malformed version", () => {
    expect(checkTags(["vnot-a-version"], [line])).toEqual([
      {
        raw: "vnot-a-version",
        line: "app",
        matches: ["app"],
        ok: false,
        anomaly: "unparseable-version",
      },
    ]);
  });

  it("strict mode rejects a candidate version that is already in history", () => {
    const results = checkTags(["v1.2.3"], [line], {
      strict: true,
      existingTags: ["v1.2.3"],
    });

    expect(results).toEqual([
      {
        raw: "v1.2.3",
        line: "app",
        matches: ["app"],
        ok: false,
        anomaly: "duplicate-version",
      },
    ]);
  });

  it("strict mode reports a duplicate among submitted candidates", () => {
    const results = checkTags(["v1.2.3", "v1.2.3"], [line], {
      strict: true,
    });

    expect(results[0]).toMatchObject({ ok: true, anomaly: null, matches: ["app"] });
    expect(results[1]).toMatchObject({
      ok: false,
      anomaly: "duplicate-version",
    });
  });

  it("rejects a tag that matches multiple configured lines", () => {
    const bare: TagLine = { ...line, name: "bare", pattern: "{version}" };

    expect(checkTags(["v1.2.3"], [line, bare])).toEqual([
      {
        raw: "v1.2.3",
        line: null,
        matches: ["app", "bare"],
        ok: false,
        anomaly: "ambiguous-assignment",
      },
    ]);
  });
});
