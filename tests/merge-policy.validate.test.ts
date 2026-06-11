// tests/merge-policy.validate.test.ts
import { describe, it, expect } from "vitest";
import { validateMerge } from "../src/core/merge-policy/validate.js";
import type { MergePolicy } from "../src/core/merge-policy/schema.js";

const policy: MergePolicy = {
  protectedBranches: {
    develop: { allow: ["main"] },
    main: { deny: ["develop", "feature/*"] },
  },
  onUnknownSource: "block",
};

describe("validateMerge", () => {
  it("allows merges into a non-protected branch", () => {
    expect(validateMerge(policy, "feature/x", "develop").ok).toBe(true);
  });

  it("allow-list: permits a listed source", () => {
    expect(validateMerge(policy, "develop", "main").ok).toBe(true);
  });

  it("allow-list: blocks an unlisted source", () => {
    const d = validateMerge(policy, "develop", "feature/x");
    expect(d.ok).toBe(false);
  });

  it("deny-list: blocks a listed source (incl. glob)", () => {
    expect(validateMerge(policy, "main", "develop").ok).toBe(false);
    expect(validateMerge(policy, "main", "feature/login").ok).toBe(false);
  });

  it("deny-list: permits an unlisted source", () => {
    expect(validateMerge(policy, "main", "hotfix/x").ok).toBe(true);
  });

  it("unknown source blocks when onUnknownSource = block", () => {
    expect(validateMerge(policy, "develop", null).ok).toBe(false);
  });

  it("unknown source passes when onUnknownSource = allow", () => {
    const p: MergePolicy = { ...policy, onUnknownSource: "allow" };
    expect(validateMerge(p, "develop", null).ok).toBe(true);
  });
});
