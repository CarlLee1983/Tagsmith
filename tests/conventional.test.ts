import { describe, expect, it } from "vitest";
import { recommendConventionalBump } from "../src/core/conventional.js";

describe("recommendConventionalBump", () => {
  it("selects the highest release level from Conventional Commits", () => {
    const recommendation = recommendConventionalBump([
      { id: "a", message: "fix(cli): keep JSON output clean" },
      { id: "b", message: "feat: add remote tag preflight" },
      { id: "c", message: "docs: explain the workflow" },
    ]);

    expect(recommendation.level).toBe("minor");
    expect(recommendation.reasons).toEqual([
      { id: "a", level: "patch", summary: "fix(cli): keep JSON output clean" },
      { id: "b", level: "minor", summary: "feat: add remote tag preflight" },
    ]);
  });

  it("treats bang and BREAKING CHANGE footers as major changes", () => {
    const recommendation = recommendConventionalBump([
      { id: "a", message: "feat!: replace the config format" },
      {
        id: "b",
        message: "fix: remove legacy parsing\n\nBREAKING CHANGE: flat config is no longer accepted",
      },
    ]);

    expect(recommendation.level).toBe("major");
    expect(recommendation.reasons.map((reason) => reason.level)).toEqual([
      "major",
      "major",
    ]);
  });

  it("does not recommend a release for non-release Conventional Commit types", () => {
    expect(
      recommendConventionalBump([
        { id: "a", message: "docs: update examples" },
        { id: "b", message: "chore: refresh dependencies" },
      ]),
    ).toEqual({ level: null, reasons: [] });
  });
});
