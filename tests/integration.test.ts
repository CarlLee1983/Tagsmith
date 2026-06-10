import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
import type { TagsmithConfig } from "../src/types.js";

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
      pattern: "v{version}",
      model: { type: "semver" },
      initialVersion: "0.1.0",
      push: false,
    };
    await writeConfig(dir, config);

    const loaded = await loadConfig(dir);
    const model = createModel(loaded.model);

    // No tags yet → fresh initial.
    const first = planNext(loaded, model, await listTags({ cwd: dir }), "patch");
    expect(first.tag).toBe("v0.1.0");
    expect(first.fresh).toBe(true);
    await createTag({ cwd: dir, name: first.tag });

    // Now bump minor.
    const second = planNext(loaded, model, await listTags({ cwd: dir }), "minor");
    expect(second.tag).toBe("v0.2.0");
    expect(second.fromVersion).toBe("0.1.0");
    await createTag({ cwd: dir, name: second.tag });

    // Default patch from latest.
    const third = planNext(loaded, model, await listTags({ cwd: dir }), "patch");
    expect(third.tag).toBe("v0.2.1");
  });

  it("loadConfig throws a friendly error when missing", async () => {
    await expect(loadConfig(dir)).rejects.toThrow(/tagsmith init/);
  });

  it("loadConfig rejects invalid JSON", async () => {
    await writeFile(path.join(dir, ".tagsmith.json"), "{ not json", "utf8");
    await expect(loadConfig(dir)).rejects.toThrow(/valid JSON/);
  });
});
