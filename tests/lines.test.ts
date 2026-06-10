import { describe, it, expect } from "vitest";
import { assignTagsToLines, selectLine } from "../src/core/lines.js";
import type { TagLine, TagsmithConfig } from "../src/types.js";

const app: TagLine = {
  name: "app", pattern: "v{version}",
  model: { type: "semver" }, initialVersion: "0.1.0", push: false,
};
const release: TagLine = {
  name: "release", pattern: "release/{version}",
  model: { type: "calver", format: "YYYY.MM.MICRO" },
  initialVersion: "2026.06.0", push: true,
};

describe("assignTagsToLines", () => {
  it("buckets tags by their matching line", () => {
    const r = assignTagsToLines(
      ["v1.0.0", "release/2026.06.0", "v1.1.0"],
      [app, release],
    );
    expect(r.byLine.get("app")).toEqual(["v1.0.0", "v1.1.0"]);
    expect(r.byLine.get("release")).toEqual(["release/2026.06.0"]);
    expect(r.orphans).toEqual([]);
  });

  it("collects tags matching no line as orphans", () => {
    const r = assignTagsToLines(["weird-tag", "v1.0.0"], [app, release]);
    expect(r.byLine.get("app")).toEqual(["v1.0.0"]);
    expect(r.orphans).toEqual(["weird-tag"]);
  });

  it("first declared line wins when patterns overlap", () => {
    const bare: TagLine = { ...app, name: "bare", pattern: "{version}" };
    // "v1.0.0" 同時被 app(v{version}) 與 bare({version}) 命中 → app 先宣告者勝
    const r = assignTagsToLines(["v1.0.0"], [app, bare]);
    expect(r.byLine.get("app")).toEqual(["v1.0.0"]);
    expect(r.byLine.get("bare")).toEqual([]);
  });

  it("always returns an entry (possibly empty) for every line", () => {
    const r = assignTagsToLines([], [app, release]);
    expect(r.byLine.get("app")).toEqual([]);
    expect(r.byLine.get("release")).toEqual([]);
  });
});

describe("selectLine", () => {
  const config: TagsmithConfig = { lines: [app, release], default: "app" };

  it("returns the default line when no name given", () => {
    expect(selectLine(config).name).toBe("app");
  });

  it("returns the named line", () => {
    expect(selectLine(config, "release").name).toBe("release");
  });

  it("throws listing available names for an unknown line", () => {
    expect(() => selectLine(config, "nope")).toThrow(/app, release/);
  });
});
