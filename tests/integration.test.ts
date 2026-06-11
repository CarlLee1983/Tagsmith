import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  ensureRepo,
  listTags,
  createTag,
  GitError,
} from "../src/git/git.js";
import { writeConfig, loadConfig } from "../src/core/config.js";
import { createModel } from "../src/core/models/index.js";
import { planNext } from "../src/core/plan.js";
import { selectLine, assignTagsToLines } from "../src/core/lines.js";
import { runNext } from "../src/cli/next.js";
import { runCreate } from "../src/cli/create.js";
import type { TagsmithConfig } from "../src/types.js";

/** Capture everything written to stdout/stderr during `fn`. */
async function capture(fn: () => Promise<number>): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  let stdout = "";
  let stderr = "";
  const outSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    });
  const errSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    });
  try {
    const code = await fn();
    return { code, stdout, stderr };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

function gitInit(dir: string): void {
  const run = (args: string[]) => execFileSync("git", args, { cwd: dir });
  run(["init", "-q"]);
  run(["config", "user.email", "t@example.com"]);
  run(["config", "user.name", "Test"]);
  run(["commit", "--allow-empty", "-q", "-m", "init"]);
}

describe("git integration", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tagsmith-"));
    gitInit(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("ensureRepo passes inside a repo and fails outside", async () => {
    await expect(ensureRepo({ cwd: dir })).resolves.toBeUndefined();
    const outside = await mkdtemp(path.join(tmpdir(), "norepo-"));
    await expect(ensureRepo({ cwd: outside })).rejects.toBeInstanceOf(GitError);
    await rm(outside, { recursive: true, force: true });
  });

  it("creates and lists tags", async () => {
    expect(await listTags({ cwd: dir })).toEqual([]);
    await createTag({ cwd: dir, name: "v1.0.0" });
    await createTag({ cwd: dir, name: "v1.1.0", message: "release 1.1" });
    const tags = await listTags({ cwd: dir });
    expect(tags.sort()).toEqual(["v1.0.0", "v1.1.0"]);
  });

  it("end-to-end: config → plan next → create → plan again", async () => {
    const config: TagsmithConfig = {
      lines: [
        {
          name: "default",
          pattern: "v{version}",
          model: { type: "semver" },
          initialVersion: "0.1.0",
          push: false,
        },
      ],
      default: "default",
    };
    await writeConfig(dir, config);

    const loaded = await loadConfig(dir);
    const line = selectLine(loaded);
    const model = createModel(line.model);

    // No tags yet → fresh initial.
    const allTags1 = await listTags({ cwd: dir });
    const lineTags1 = assignTagsToLines(allTags1, loaded.lines).byLine.get(line.name) ?? [];
    const first = planNext(line, model, lineTags1, "patch");
    expect(first.tag).toBe("v0.1.0");
    expect(first.fresh).toBe(true);
    await createTag({ cwd: dir, name: first.tag });

    // Now bump minor.
    const allTags2 = await listTags({ cwd: dir });
    const lineTags2 = assignTagsToLines(allTags2, loaded.lines).byLine.get(line.name) ?? [];
    const second = planNext(line, model, lineTags2, "minor");
    expect(second.tag).toBe("v0.2.0");
    expect(second.fromVersion).toBe("0.1.0");
    await createTag({ cwd: dir, name: second.tag });

    // Default patch from latest.
    const allTags3 = await listTags({ cwd: dir });
    const lineTags3 = assignTagsToLines(allTags3, loaded.lines).byLine.get(line.name) ?? [];
    const third = planNext(line, model, lineTags3, "patch");
    expect(third.tag).toBe("v0.2.1");
  });

  it("loadConfig throws a friendly error when missing", async () => {
    await expect(loadConfig(dir)).rejects.toThrow(/tagsmith init/);
  });

  it("loadConfig rejects invalid JSON", async () => {
    await writeFile(path.join(dir, ".tagsmith.json"), "{ not json", "utf8");
    await expect(loadConfig(dir)).rejects.toThrow(/valid JSON/);
  });

  it("legacy flat config still drives next → create unchanged", async () => {
    // Write a raw legacy flat .tagsmith.json (no `tags` array)
    await writeFile(
      path.join(dir, ".tagsmith.json"),
      JSON.stringify({
        pattern: "v{version}",
        model: { type: "semver" },
        initialVersion: "0.1.0",
        push: false,
      }),
      "utf8",
    );
    execFileSync("git", ["tag", "v1.0.0"], { cwd: dir });

    // next --json should compute v1.0.1
    const nextResult = await capture(() => runNext(dir, { json: true }));
    expect(nextResult.code).toBe(0);
    expect(JSON.parse(nextResult.stdout).tag).toBe("v1.0.1");

    // create should actually create v1.0.1
    const createResult = await capture(() => runCreate(dir, {}));
    expect(createResult.code).toBe(0);
    const tagsAfter = execFileSync("git", ["tag", "-l"], { cwd: dir })
      .toString()
      .trim()
      .split("\n");
    expect(tagsAfter).toContain("v1.0.1");
  });

  it("two lines bump independently end-to-end", async () => {
    // Multi-line config: app (semver v{version}) + release (build release/{version})
    await writeFile(
      path.join(dir, ".tagsmith.json"),
      JSON.stringify({
        tags: [
          {
            name: "app",
            pattern: "v{version}",
            model: { type: "semver" },
            initialVersion: "0.1.0",
          },
          {
            name: "release",
            pattern: "release/{version}",
            model: { type: "build" },
            initialVersion: "1",
          },
        ],
        default: "app",
      }),
      "utf8",
    );
    execFileSync("git", ["tag", "v1.0.0"], { cwd: dir });
    execFileSync("git", ["tag", "release/5"], { cwd: dir });

    // create --tag release → build line → release/6
    const releaseCreate = await capture(() => runCreate(dir, { tag: "release" }));
    expect(releaseCreate.code).toBe(0);

    // create (default app line) → semver → v1.0.1
    const appCreate = await capture(() => runCreate(dir, {}));
    expect(appCreate.code).toBe(0);

    const repoTags = execFileSync("git", ["tag", "-l"], { cwd: dir })
      .toString()
      .trim()
      .split("\n");
    expect(repoTags).toContain("release/6");
    expect(repoTags).toContain("v1.0.1");
  });
});
