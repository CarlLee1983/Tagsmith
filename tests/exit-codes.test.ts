import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { runList } from "../src/cli/list.js";
import { runNext } from "../src/cli/next.js";
import { runCheck } from "../src/cli/check.js";
import { runAudit } from "../src/cli/audit.js";
import { runPlan } from "../src/cli/plan.js";
import { runCreate } from "../src/cli/create.js";
import { runMergeCheck } from "../src/cli/merge-check.js";
import { runHooksInstall, runHooksUninstall } from "../src/cli/hooks.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, "..", "dist", "cli", "index.js");

/**
 * Exit codes are part of the published contract: 0 means the command's question
 * was answered affirmatively, 1 means anything else. Tagsmith deliberately does
 * not subdivide failures — scripts testing `$? -eq 1` must keep working, and
 * failure classification is carried by --json diagnostic codes instead.
 */
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

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

function gitInit(dir: string): void {
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["commit", "--allow-empty", "-q", "-m", "init"]);
}

async function writeLines(dir: string, extra: Record<string, unknown> = {}): Promise<void> {
  await writeFile(
    path.join(dir, ".tagsmith.json"),
    JSON.stringify({
      tags: [
        { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
        { name: "docs", pattern: "docs-v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
      ],
      default: "app",
      ...extra,
    }),
  );
}

describe("exit code contract", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tagsmith-exit-"));
    gitInit(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("list", () => {
    it("exits 0 whenever tags can be read", async () => {
      git(dir, ["tag", "not-a-version"]);
      expect(await silence(() => runList(dir, {}))).toBe(0);
    });

    it("exits 1 when the repository cannot be read", async () => {
      const outside = await mkdtemp(path.join(tmpdir(), "tagsmith-exit-bare-"));
      try {
        expect(await silence(() => runList(outside, {}))).toBe(1);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  describe("check", () => {
    it("exits 0 when every tag conforms", async () => {
      expect(await silence(() => runCheck(dir, ["v1.2.3"], {}))).toBe(0);
    });

    it("exits 1 when any tag fails", async () => {
      expect(await silence(() => runCheck(dir, ["v1.2.3", "junk"], {}))).toBe(1);
    });
  });

  describe("next", () => {
    it("exits 0 when a candidate can be computed", async () => {
      git(dir, ["tag", "v1.0.0"]);
      expect(await silence(() => runNext(dir, { level: "minor" }))).toBe(0);
    });

    it("exits 1 when the request cannot be satisfied", async () => {
      await writeLines(dir);
      // --require-changes without a workspace has no safe answer.
      expect(await silence(() => runNext(dir, { requireChanges: true }))).toBe(1);
    });
  });

  describe("audit", () => {
    it("exits 0 when no diagnostic has error severity", async () => {
      git(dir, ["tag", "v1.0.0"]);
      expect(await silence(() => runAudit(dir, {}))).toBe(0);
    });

    it("exits 1 on an error-severity diagnostic", async () => {
      await writeLines(dir);
      git(dir, ["tag", "v1.0.0"]);
      git(dir, ["tag", "v1.0"]); // matches the app pattern, but semver cannot parse it
      expect(await silence(() => runAudit(dir, {}))).toBe(1);
    });

    it("keeps warnings at exit 0 unless --strict-overlap is passed", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "rc", pattern: "v{version}-rc", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
        }),
      );
      expect(await silence(() => runAudit(dir, {}))).toBe(0);
      expect(await silence(() => runAudit(dir, { strictOverlap: true }))).toBe(1);
    });
  });

  describe("plan", () => {
    it("exits 0 when no line is blocked", async () => {
      await writeLines(dir);
      expect(await silence(() => runPlan(dir, { all: true }))).toBe(0);
    });

    it("exits 1 when any line is blocked", async () => {
      await writeLines(dir);
      expect(await silence(() => runPlan(dir, { all: true, requireChanges: true }))).toBe(1);
    });
  });

  describe("create", () => {
    it("exits 0 for a dry run and for a real tag", async () => {
      expect(await silence(() => runCreate(dir, { dryRun: true }))).toBe(0);
      expect(git(dir, ["tag"]).trim()).toBe("");
      expect(await silence(() => runCreate(dir, { level: "minor" }))).toBe(0);
      expect(git(dir, ["tag"]).trim()).not.toBe("");
    });

    it("exits 1 when validation rejects the request", async () => {
      git(dir, ["tag", "v2.0.0"]);
      expect(await silence(() => runCreate(dir, { setVersion: "1.0.0" }))).toBe(1);
    });
  });

  describe("merge-check", () => {
    it("exits 0 with no policy configured", async () => {
      expect(await silence(() => runMergeCheck(dir, { mode: "merge-head" }))).toBe(0);
    });

    it("exits 1 when the policy rejects the merge", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          pattern: "v{version}",
          mergePolicy: { protectedBranches: { develop: { allow: ["main"] } } },
        }),
      );
      git(dir, ["checkout", "-q", "-b", "feature/x"]);
      git(dir, ["commit", "--allow-empty", "-q", "-m", "work"]);
      const featureTip = git(dir, ["rev-parse", "HEAD"]).trim();
      git(dir, ["checkout", "-q", "main"]);
      git(dir, ["checkout", "-q", "-b", "develop"]);
      const before = git(dir, ["rev-parse", "HEAD"]).trim();
      git(dir, ["update-ref", "ORIG_HEAD", before]);
      git(dir, ["merge", "-q", "--ff-only", featureTip]);
      expect(await silence(() => runMergeCheck(dir, { mode: "post-merge" }))).toBe(1);
    });

    it("exits 0 when the escape hatches are set", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          pattern: "v{version}",
          mergePolicy: { protectedBranches: { main: { allow: ["release"] } } },
        }),
      );
      for (const [key, value] of [["HUSKY", "0"], ["TAGSMITH_SKIP", "1"]] as const) {
        const previous = process.env[key];
        process.env[key] = value;
        try {
          expect(await silence(() => runMergeCheck(dir, { mode: "post-merge" }))).toBe(0);
        } finally {
          if (previous === undefined) delete process.env[key];
          else process.env[key] = previous;
        }
      }
    });
  });

  describe("hooks", () => {
    it("exits 0 on install and uninstall", async () => {
      expect(await silence(() => runHooksInstall(dir, {}))).toBe(0);
      expect(await silence(() => runHooksUninstall(dir))).toBe(0);
    });

    it("exits 1 when a foreign hook would be overwritten", async () => {
      await writeFile(path.join(dir, ".git", "hooks", "post-merge"), "#!/bin/sh\necho custom\n");
      expect(await silence(() => runHooksInstall(dir, {}))).toBe(1);
    });
  });

  describe("unknown command", () => {
    it("exits 1 from the built CLI", () => {
      try {
        execFileSync("node", [CLI, "definitely-not-a-command"], {
          cwd: dir,
          encoding: "utf8",
          stdio: "pipe",
        });
        expect.unreachable("unknown command must not exit 0");
      } catch (err) {
        expect((err as { status?: number }).status).toBe(1);
      }
    });
  });
});
