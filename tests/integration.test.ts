import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  ensureRepo,
  listTags,
  listCommitMessages,
  hasWorkspaceChanges,
  hasCommittedChanges,
  createTag,
  fetchTags,
  pushTag,
  GitError,
} from "../src/git/git.js";
import { writeConfig, loadConfig } from "../src/core/config.js";
import { createModel } from "../src/core/models/index.js";
import { planNext } from "../src/core/plan.js";
import { selectLine, assignTagsToLines } from "../src/core/lines.js";
import { runNext } from "../src/cli/next.js";
import { runCreate } from "../src/cli/create.js";
import { runAudit } from "../src/cli/audit.js";
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

  it("treats a repository with no commits as unchanged for release planning", async () => {
    const empty = await mkdtemp(path.join(tmpdir(), "tagsmith-empty-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: empty });
      expect(await hasCommittedChanges({ cwd: empty })).toBe(false);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("fetches tags created by another clone", async () => {
    const remote = await mkdtemp(path.join(tmpdir(), "tagsmith-remote-"));
    const peer = await mkdtemp(path.join(tmpdir(), "tagsmith-peer-"));
    try {
      execFileSync("git", ["init", "--bare", "-q", remote]);
      execFileSync("git", ["remote", "add", "origin", remote], { cwd: dir });
      execFileSync("git", ["push", "-q", "-u", "origin", "HEAD"], { cwd: dir });
      execFileSync("git", ["clone", "-q", remote, peer]);
      execFileSync("git", ["config", "user.email", "peer@example.com"], { cwd: peer });
      execFileSync("git", ["config", "user.name", "Peer"], { cwd: peer });
      execFileSync("git", ["tag", "v1.2.3"], { cwd: peer });
      execFileSync("git", ["push", "-q", "origin", "v1.2.3"], { cwd: peer });

      expect(await listTags({ cwd: dir })).toEqual([]);
      await fetchTags({ cwd: dir });
      expect(await listTags({ cwd: dir })).toEqual(["v1.2.3"]);
    } finally {
      await rm(remote, { recursive: true, force: true });
      await rm(peer, { recursive: true, force: true });
    }
  });

  it("records an explicitly fetched remote in the release-readiness audit", async () => {
    const remote = await mkdtemp(path.join(tmpdir(), "tagsmith-audit-remote-"));
    try {
      execFileSync("git", ["init", "--bare", "-q", remote]);
      execFileSync("git", ["remote", "add", "origin", remote], { cwd: dir });
      execFileSync("git", ["push", "-q", "-u", "origin", "HEAD"], { cwd: dir });
      await writeConfig(dir, {
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
        releasePolicy: {
          requireCleanWorktree: false,
          requireAnnotatedTag: false,
          requireHeadTag: false,
          signature: "optional",
        },
      });

      const result = await capture(() => runAudit(dir, { fetch: true, json: true }));
      const json = JSON.parse(result.stdout);

      expect(result.code).toBe(0);
      expect(json.data.remote).toEqual({ checked: true, name: "origin" });
      expect(json.data.releaseReadiness.checks).toContainEqual(expect.objectContaining({
        code: "release-remote",
        status: "pass",
      }));
    } finally {
      await rm(remote, { recursive: true, force: true });
    }
  });

  it("lists complete commit messages after a tag or commit ref", async () => {
    const from = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
    await writeFile(path.join(dir, "feature.txt"), "enabled\n", "utf8");
    execFileSync("git", ["add", "feature.txt"], { cwd: dir });
    execFileSync(
      "git",
      ["commit", "-q", "-m", "feat(cli): add a release preview", "-m", "More detail."],
      { cwd: dir },
    );

    expect(await listCommitMessages({ cwd: dir, from })).toEqual([
      expect.objectContaining({ message: "feat(cli): add a release preview\n\nMore detail.\n" }),
    ]);
  });

  it("scopes commit history to a repository-relative workspace", async () => {
    await mkdir(path.join(dir, "packages", "api"), { recursive: true });
    await mkdir(path.join(dir, "packages", "web"), { recursive: true });
    await writeFile(path.join(dir, "packages", "api", "index.ts"), "export {};\n", "utf8");
    execFileSync("git", ["add", "packages/api/index.ts"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "feat(api): initial package"], { cwd: dir });
    execFileSync("git", ["tag", "api/v1.0.0"], { cwd: dir });

    await writeFile(path.join(dir, "packages", "web", "index.ts"), "export {};\n", "utf8");
    execFileSync("git", ["add", "packages/web/index.ts"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "feat(web)!: redesign client"], { cwd: dir });
    await writeFile(path.join(dir, "packages", "api", "index.ts"), "export const api = true;\n", "utf8");
    execFileSync("git", ["add", "packages/api/index.ts"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "fix(api): correct export"], { cwd: dir });

    expect(
      await listCommitMessages({
        cwd: dir,
        from: "api/v1.0.0",
        workspace: "packages/api",
      }),
    ).toEqual([expect.objectContaining({ message: "fix(api): correct export\n" })]);
  });

  it("detects changes within a workspace since its latest tag", async () => {
    const workspace = path.join(dir, "packages", "api");
    await mkdir(workspace, { recursive: true });
    await writeFile(path.join(workspace, "index.ts"), "export {};\n", "utf8");
    execFileSync("git", ["add", "packages/api/index.ts"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "feat(api): initial package"], {
      cwd: dir,
    });
    execFileSync("git", ["tag", "api/v1.0.0"], { cwd: dir });

    await writeFile(path.join(dir, "README.md"), "other package change\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "docs: explain packages"], { cwd: dir });
    expect(
      await hasWorkspaceChanges({ cwd: dir, workspace: "packages/api", since: "api/v1.0.0" }),
    ).toBe(false);

    await writeFile(path.join(workspace, "index.ts"), "export const api = true;\n", "utf8");
    execFileSync("git", ["add", "packages/api/index.ts"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "fix(api): correct export"], {
      cwd: dir,
    });
    expect(
      await hasWorkspaceChanges({ cwd: dir, workspace: "packages/api", since: "api/v1.0.0" }),
    ).toBe(true);
    expect(
      await hasWorkspaceChanges({ cwd: workspace, workspace: "packages/api", since: "api/v1.0.0" }),
    ).toBe(true);
  });

  it("uses a selected remote before previewing and pushing a release", async () => {
    const remote = await mkdtemp(path.join(tmpdir(), "tagsmith-remote-"));
    const peer = await mkdtemp(path.join(tmpdir(), "tagsmith-peer-"));
    try {
      execFileSync("git", ["init", "--bare", "-q", remote]);
      execFileSync("git", ["remote", "add", "upstream", remote], { cwd: dir });
      execFileSync("git", ["push", "-q", "-u", "upstream", "HEAD"], { cwd: dir });
      execFileSync("git", ["clone", "-q", remote, peer]);
      execFileSync("git", ["config", "user.email", "peer@example.com"], { cwd: peer });
      execFileSync("git", ["config", "user.name", "Peer"], { cwd: peer });
      execFileSync("git", ["tag", "v1.2.3"], { cwd: peer });
      execFileSync("git", ["push", "-q", "origin", "v1.2.3"], { cwd: peer });

      await writeConfig(dir, {
        lines: [
          {
            name: "default",
            pattern: "v{version}",
            model: { type: "semver" },
            initialVersion: "0.1.0",
            push: true,
          },
        ],
        default: "default",
      });

      const preview = await capture(() =>
        runNext(dir, { fetch: true, remote: "upstream", json: true }),
      );
      expect(preview.code).toBe(0);
      expect(JSON.parse(preview.stdout).data.tag).toBe("v1.2.4");

      const created = await capture(() => runCreate(dir, { remote: "upstream" }));
      expect(created.code).toBe(0);
      expect(created.stdout).toMatch(/Fetched tags from upstream/);
      expect(created.stdout).toMatch(/Pushed v1\.2\.4/);
      expect(
        execFileSync("git", ["ls-remote", "--tags", remote, "v1.2.4"], {
          encoding: "utf8",
        }),
      ).toMatch(/refs\/tags\/v1\.2\.4/);
    } finally {
      await rm(remote, { recursive: true, force: true });
      await rm(peer, { recursive: true, force: true });
    }
  });

  it("leaves a clear Git error when a tag wins the post-fetch push race", async () => {
    const remote = await mkdtemp(path.join(tmpdir(), "tagsmith-remote-"));
    const peer = await mkdtemp(path.join(tmpdir(), "tagsmith-peer-"));
    try {
      execFileSync("git", ["init", "--bare", "-q", remote]);
      execFileSync("git", ["remote", "add", "upstream", remote], { cwd: dir });
      execFileSync("git", ["push", "-q", "-u", "upstream", "HEAD"], { cwd: dir });
      execFileSync("git", ["clone", "-q", remote, peer]);
      execFileSync("git", ["config", "user.email", "peer@example.com"], { cwd: peer });
      execFileSync("git", ["config", "user.name", "Peer"], { cwd: peer });

      await fetchTags({ cwd: dir, remote: "upstream" });
      await writeFile(path.join(peer, "peer.txt"), "peer release\n", "utf8");
      execFileSync("git", ["add", "peer.txt"], { cwd: peer });
      execFileSync("git", ["commit", "-q", "-m", "feat: release from peer"], { cwd: peer });
      execFileSync("git", ["tag", "v1.2.4"], { cwd: peer });
      execFileSync("git", ["push", "-q", "origin", "v1.2.4"], { cwd: peer });
      await createTag({ cwd: dir, name: "v1.2.4" });

      await expect(pushTag({ cwd: dir, name: "v1.2.4", remote: "upstream" })).rejects.toBeInstanceOf(
        GitError,
      );
    } finally {
      await rm(remote, { recursive: true, force: true });
      await rm(peer, { recursive: true, force: true });
    }
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
    expect(JSON.parse(nextResult.stdout).data.tag).toBe("v1.0.1");

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
