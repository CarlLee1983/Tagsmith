// tests/merge-policy.match.test.ts
import { describe, it, expect } from "vitest";
import { matchSource } from "../src/core/merge-policy/match.js";

describe("matchSource", () => {
  it("matches an exact branch name", () => {
    expect(matchSource("main", "main")).toBe(true);
    expect(matchSource("main", "develop")).toBe(false);
  });

  it("matches a trailing wildcard across path segments", () => {
    expect(matchSource("feature/*", "feature/login")).toBe(true);
    expect(matchSource("feature/*", "feature/a/b")).toBe(true);
    expect(matchSource("feature/*", "hotfix/x")).toBe(false);
  });

  it("treats ? as a single character", () => {
    expect(matchSource("rc?", "rc1")).toBe(true);
    expect(matchSource("rc?", "rc12")).toBe(false);
  });

  it("escapes regex-special characters in the pattern", () => {
    expect(matchSource("release.1", "release.1")).toBe(true);
    expect(matchSource("release.1", "releaseX1")).toBe(false);
  });
});
