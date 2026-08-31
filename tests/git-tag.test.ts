import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { isValidGitTagName } from "../src/core/git-tag.js";

describe("Git tag names", () => {
  it("matches git check-ref-format for supported and hostile candidates", () => {
    const candidates = [
      "v1.2.3",
      "release/2026.08.0",
      "build-0042",
      "@",
      "",
      "v1.0.0\nhas-releases=false",
      "v 1.0.0",
      "v1..0",
      "v@{1}",
      "v~1",
      "v^1",
      "v:1",
      "v?1",
      "v*1",
      "v[1",
      "v\\1",
      "/v1",
      "v1/",
      "v1//patch",
      "v1.",
      "v1.lock",
      ".hidden/v1",
      "v1/.hidden",
    ];

    for (const candidate of candidates) {
      const gitAccepts = spawnSync(
        "git",
        ["check-ref-format", `refs/tags/${candidate}`],
      ).status === 0;
      expect(isValidGitTagName(candidate), candidate).toBe(gitAccepts);
    }
    expect(isValidGitTagName("-v1.0.0")).toBe(false);
  });
});
