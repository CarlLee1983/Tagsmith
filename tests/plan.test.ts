import { describe, it, expect } from "vitest";
import { planNext, validateExplicit } from "../src/core/plan.js";
import { createSemverModel, createBuildModel } from "../src/core/models/index.js";
import type { TagLine } from "../src/types.js";

const semverLine: TagLine = {
  name: "app",
  pattern: "v{version}",
  model: { type: "semver" },
  initialVersion: "0.1.0",
  push: false,
};
const model = createSemverModel();

describe("planNext", () => {
  it("bumps from the latest conforming tag", () => {
    const plan = planNext(semverLine, model, ["v1.0.0", "v1.2.0"], "patch");
    expect(plan.tag).toBe("v1.2.1");
    expect(plan.fromVersion).toBe("1.2.0");
    expect(plan.fresh).toBe(false);
  });

  it("uses initialVersion when no conforming tag exists", () => {
    const plan = planNext(semverLine, model, [], "patch");
    expect(plan.tag).toBe("v0.1.0");
    expect(plan.fresh).toBe(true);
    expect(plan.fromVersion).toBeNull();
  });

  it("ignores non-conforming tags when computing latest", () => {
    const plan = planNext(semverLine, model, ["garbage", "v2.0.0"], "minor");
    expect(plan.tag).toBe("v2.1.0");
  });

  it("guarantees strict increase via build model", () => {
    const buildLine: TagLine = {
      name: "build",
      pattern: "build-{version}",
      model: { type: "build" },
      initialVersion: "1",
      push: false,
    };
    const bm = createBuildModel();
    const plan = planNext(buildLine, bm, ["build-7"], "auto");
    expect(plan.tag).toBe("build-8");
  });
});

describe("validateExplicit", () => {
  it("accepts a strictly greater new version", () => {
    const r = validateExplicit(semverLine, model, "1.3.0", ["v1.2.0"]);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("rejects an out-of-order version", () => {
    const r = validateExplicit(semverLine, model, "1.0.0", ["v1.2.0"]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/not greater/);
  });

  it("allows out-of-order when overridden", () => {
    const r = validateExplicit(semverLine, model, "1.0.0", ["v1.2.0"], {
      allowOutOfOrder: true,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects an existing tag", () => {
    const r = validateExplicit(semverLine, model, "1.2.0", ["v1.2.0"]);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /already exists/.test(e))).toBe(true);
  });

  it("rejects an unparseable version", () => {
    const r = validateExplicit(semverLine, model, "not-semver", []);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/not valid/);
  });
});
