// tests/merge-policy.integration.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runMergeCheck } from "../src/cli/merge-check.js";
import { runHooksInstall, runHooksUninstall } from "../src/cli/hooks.js";

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

  it("blocks a disallowed in-progress merge in merge-head mode", async () => {
    // diverge develop and main so the merge is a true (non-ff) merge
    git(dir, ["checkout", "-q", "-b", "develop"]);
    git(dir, ["commit", "--allow-empty", "-q", "-m", "develop work"]);
    git(dir, ["checkout", "-q", "main"]);
    git(dir, ["commit", "--allow-empty", "-q", "-m", "main work"]);
    // start the merge but stop before committing → leaves MERGE_HEAD on disk
    try {
      git(dir, ["merge", "--no-ff", "--no-commit", "-q", "develop"]);
    } catch {
      // --no-commit can exit non-zero by design when it stops for the commit; ignore
    }
    const code = await silence(() =>
      runMergeCheck(dir, { mode: "merge-head" }),
    );
    expect(code).toBe(1);
  });

  it("honours HUSKY=0", async () => {
    git(dir, ["checkout", "-q", "-b", "develop"]);
    const prev = process.env.HUSKY;
    process.env.HUSKY = "0";
    try {
      const code = await silence(() =>
        runMergeCheck(dir, { mode: "post-merge" }),
      );
      expect(code).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.HUSKY;
      else process.env.HUSKY = prev;
    }
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

describe("runHooksInstall", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tagsmith-hooks-"));
    initRepo(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes husky hooks when a .husky directory exists", async () => {
    await mkdir(path.join(dir, ".husky"));
    const code = await silence(() => runHooksInstall(dir, {}));
    expect(code).toBe(0);
    const pre = await readFile(
      path.join(dir, ".husky", "prepare-commit-msg"),
      "utf8",
    );
    expect(pre).toContain("tagsmith merge-check --mode merge-head");
    const post = await readFile(
      path.join(dir, ".husky", "post-merge"),
      "utf8",
    );
    expect(post).toContain("tagsmith merge-check --mode post-merge");
  });

  it("writes .git/hooks (executable) when husky is absent", async () => {
    const code = await silence(() => runHooksInstall(dir, {}));
    expect(code).toBe(0);
    const hookPath = path.join(dir, ".git", "hooks", "post-merge");
    const post = await readFile(hookPath, "utf8");
    expect(post).toContain("tagsmith merge-check --mode post-merge");
    const mode = (await stat(hookPath)).mode;
    expect(mode & 0o100).toBeTruthy(); // owner-executable
  });

  it("refuses to overwrite a non-tagsmith hook without --force", async () => {
    const hookPath = path.join(dir, ".git", "hooks", "post-merge");
    await writeFile(hookPath, "#!/bin/sh\necho custom\n");
    const code = await silence(() => runHooksInstall(dir, {}));
    expect(code).toBe(1);
    expect(await readFile(hookPath, "utf8")).toContain("echo custom");
  });

  it("uninstall removes tagsmith-managed hooks", async () => {
    await silence(() => runHooksInstall(dir, {}));
    const code = await silence(() => runHooksUninstall(dir));
    expect(code).toBe(0);
    await expect(
      stat(path.join(dir, ".git", "hooks", "post-merge")),
    ).rejects.toThrow();
  });

  it("overwrites a foreign hook when --force is set", async () => {
    const hookPath = path.join(dir, ".git", "hooks", "post-merge");
    await writeFile(hookPath, "#!/bin/sh\necho custom\n");
    const code = await silence(() => runHooksInstall(dir, { force: true }));
    expect(code).toBe(0);
    const post = await readFile(hookPath, "utf8");
    expect(post).toContain("tagsmith merge-check --mode post-merge");
    expect(post).not.toContain("echo custom");
  });

  it("uninstall skips hooks that are not tagsmith-managed", async () => {
    const hookPath = path.join(dir, ".git", "hooks", "post-merge");
    await writeFile(hookPath, "#!/bin/sh\necho custom\n");
    const code = await silence(() => runHooksUninstall(dir));
    expect(code).toBe(0);
    expect(await readFile(hookPath, "utf8")).toContain("echo custom");
  });
});
