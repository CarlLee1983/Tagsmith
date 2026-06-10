import { describe, it, expect } from "vitest";
import { checkTags } from "../src/core/check.js";
import { compilePattern } from "../src/core/pattern.js";
import { createModel } from "../src/core/models/index.js";

const pattern = compilePattern("v{version}");
const model = createModel({ type: "semver" });

describe("checkTags — format", () => {
  it("passes a conforming tag", () => {
    const r = checkTags(pattern, model, ["v1.2.3"], []);
    expect(r.ok).toBe(true);
    expect(r.checks).toEqual([{ tag: "v1.2.3", ok: true, anomaly: null }]);
  });

  it("flags a pattern mismatch", () => {
    const r = checkTags(pattern, model, ["junk"], []);
    expect(r.ok).toBe(false);
    expect(r.checks[0]).toEqual({ tag: "junk", ok: false, anomaly: "pattern-mismatch" });
  });

  it("flags an unparseable version", () => {
    const r = checkTags(pattern, model, ["vNOPE"], []);
    expect(r.ok).toBe(false);
    expect(r.checks[0].anomaly).toBe("unparseable-version");
  });

  it("returns ok for empty candidates", () => {
    const r = checkTags(pattern, model, [], []);
    expect(r).toEqual({ ok: true, checks: [] });
  });
});

describe("checkTags — duplicates", () => {
  it("flags a candidate duplicating an existing tag", () => {
    const r = checkTags(pattern, model, ["v1.2.3"], ["v1.2.3"]);
    expect(r.ok).toBe(false);
    expect(r.checks[0].anomaly).toBe("duplicate-version");
  });

  it("flags the second of two duplicate candidates", () => {
    const r = checkTags(pattern, model, ["v1.0.0", "v1.0.0"], []);
    expect(r.checks[0].ok).toBe(true);
    expect(r.checks[1].anomaly).toBe("duplicate-version");
  });

  it("ignores existing non-conforming tags when deduping", () => {
    const r = checkTags(pattern, model, ["v1.2.3"], ["junk"]);
    expect(r.ok).toBe(true);
  });

  it("ok is false when any candidate fails", () => {
    const r = checkTags(pattern, model, ["v1.0.0", "junk"], []);
    expect(r.ok).toBe(false);
    expect(r.checks[0].ok).toBe(true);
    expect(r.checks[1].ok).toBe(false);
  });
});
