// tests/merge-policy.integration.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runMergeCheck } from "../src/cli/merge-check.js";

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir }).toString();
}

function initRepo(dir: string): void {
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["commit", "--allow-empty", "-q", "-m", "init"]);
}

async function writePolicy(dir: string): Promise<void> {
  await writeFile(
    path.join(dir, ".tagsmith.json"),
    JSON.stringify({
      pattern: "v{version}",
      mergePolicy: {
        protectedBranches: {
          develop: { allow: ["main"] },
          main: { deny: ["develop"] },
        },
      },
    }),
  );
}

async function silence(fn: () => Promise<number>): Promise<number> {
  const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  try {
    return await fn();
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}

describe("runMergeCheck", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tagsmith-mc-"));
    initRepo(dir);
    await writePolicy(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns 0 when there is no config", async () => {
    await rm(path.join(dir, ".tagsmith.json"));
    const code = await silence(() =>
      runMergeCheck(dir, { mode: "merge-head" }),
    );
    expect(code).toBe(0);
  });

  it("returns 0 on a non-protected branch", async () => {
    git(dir, ["checkout", "-q", "-b", "feature/x"]);
    const code = await silence(() =>
      runMergeCheck(dir, { mode: "merge-head" }),
    );
    expect(code).toBe(0);
  });

  it("blocks a disallowed fast-forward merge and rolls back", async () => {
    git(dir, ["checkout", "-q", "-b", "feature/x"]);
    git(dir, ["commit", "--allow-empty", "-q", "-m", "work"]);
    const featureTip = git(dir, ["rev-parse", "HEAD"]).trim();
    git(dir, ["checkout", "-q", "main"]);
    git(dir, ["checkout", "-q", "-b", "develop"]);
    const before = git(dir, ["rev-parse", "HEAD"]).trim();
    git(dir, ["update-ref", "ORIG_HEAD", before]);
    git(dir, ["merge", "-q", "--ff-only", featureTip]);
    const code = await silence(() =>
      runMergeCheck(dir, { mode: "post-merge" }),
    );
    expect(code).toBe(1);
    expect(git(dir, ["rev-parse", "HEAD"]).trim()).toBe(before);
  });

  it("allows a fast-forward merge from an allowed source", async () => {
    git(dir, ["checkout", "-q", "-b", "develop"]);
    git(dir, ["checkout", "-q", "main"]);
    git(dir, ["commit", "--allow-empty", "-q", "-m", "main work"]);
    const mainTip = git(dir, ["rev-parse", "HEAD"]).trim();
    git(dir, ["checkout", "-q", "develop"]);
    const before = git(dir, ["rev-parse", "HEAD"]).trim();
    git(dir, ["update-ref", "ORIG_HEAD", before]);
    git(dir, ["merge", "-q", "--ff-only", mainTip]);
    const code = await silence(() =>
      runMergeCheck(dir, { mode: "post-merge" }),
    );
    expect(code).toBe(0);
    expect(git(dir, ["rev-parse", "HEAD"]).trim()).toBe(mainTip);
  });

  it("honours TAGSMITH_SKIP=1", async () => {
    git(dir, ["checkout", "-q", "-b", "develop"]);
    const prev = process.env.TAGSMITH_SKIP;
    process.env.TAGSMITH_SKIP = "1";
    try {
      const code = await silence(() =>
        runMergeCheck(dir, { mode: "post-merge" }),
      );
      expect(code).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.TAGSMITH_SKIP;
      else process.env.TAGSMITH_SKIP = prev;
    }
  });
});
