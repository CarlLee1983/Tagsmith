import { describe, it, expect } from "vitest";
import { analyzeTags } from "../src/core/analyze.js";
import { compilePattern } from "../src/core/pattern.js";
import { createSemverModel } from "../src/core/models/index.js";

const pattern = compilePattern("v{version}");
const model = createSemverModel();

describe("analyzeTags", () => {
  it("sorts conforming tags newest first and finds latest", () => {
    const a = analyzeTags(["v1.0.0", "v1.2.0", "v1.1.0"], pattern, model);
    expect(a.conforming.map((t) => t.raw)).toEqual(["v1.2.0", "v1.1.0", "v1.0.0"]);
    expect(a.latest?.raw).toBe("v1.2.0");
    expect(a.anomalies).toHaveLength(0);
  });

  it("flags pattern mismatches and unparseable versions", () => {
    const a = analyzeTags(["v1.0.0", "release-2", "vNOPE"], pattern, model);
    expect(a.conforming.map((t) => t.raw)).toEqual(["v1.0.0"]);
    const reasons = a.anomalies.map((t) => [t.raw, t.anomaly]);
    expect(reasons).toContainEqual(["release-2", "pattern-mismatch"]);
    expect(reasons).toContainEqual(["vNOPE", "unparseable-version"]);
  });

  it("flags duplicate versions", () => {
    // v1.0 and v1.0.0 both normalise to 1.0.0 under semver? No: v1.0 fails pattern parse.
    const a = analyzeTags(["v1.0.0", "v1.0.0"], pattern, model);
    expect(a.conforming).toHaveLength(1);
    expect(a.anomalies[0]?.anomaly).toBe("duplicate-version");
  });

  it("returns null latest when no conforming tags", () => {
    const a = analyzeTags(["random", "stuff"], pattern, model);
    expect(a.latest).toBeNull();
  });
});
