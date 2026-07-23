import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, "..", "dist", "cli", "index.js");

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(dir: string, args: string[]): RunResult {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      cwd: dir,
      encoding: "utf8",
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

function gitInit(dir: string): void {
  const g = (args: string[]) => execFileSync("git", args, { cwd: dir });
  g(["init", "-q"]);
  g(["config", "user.email", "t@example.com"]);
  g(["config", "user.name", "Test"]);
  g(["commit", "--allow-empty", "-q", "-m", "init"]);
}

describe("tagsmith CLI (built binary)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tagsmith-cli-"));
    gitInit(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("init --yes writes a config", () => {
    const r = run(dir, ["init", "--yes", "--pattern", "v{version}"]);
    expect(r.code).toBe(0);
    const ls = run(dir, ["list", "--json"]);
    expect(ls.code).toBe(0);
    expect(JSON.parse(ls.stdout).data.latest).toBeNull();
  });

  it("full lifecycle: init → next → create → list", () => {
    run(dir, ["init", "--yes", "--model", "semver"]);

    const next1 = run(dir, ["next", "--json"]);
    expect(JSON.parse(next1.stdout).data.tag).toBe("v0.1.0");

    const create1 = run(dir, ["create"]);
    expect(create1.code).toBe(0);
    expect(create1.stdout).toContain("v0.1.0");

    const create2 = run(dir, ["create", "--level", "minor"]);
    expect(create2.code).toBe(0);
    expect(create2.stdout).toContain("v0.2.0");

    const list = run(dir, ["list", "--json"]);
    const parsed = JSON.parse(list.stdout).data;
    expect(parsed.latest).toBe("v0.2.0");
    expect(parsed.conforming.map((t: { tag: string }) => t.tag)).toEqual([
      "v0.2.0",
      "v0.1.0",
    ]);
  });

  it("create rejects an out-of-order explicit version", () => {
    run(dir, ["init", "--yes"]);
    run(dir, ["create", "--set-version", "1.0.0"]);
    const r = run(dir, ["create", "--set-version", "0.5.0"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/not greater/);
  });

  it("create --allow-out-of-order overrides the guard", () => {
    run(dir, ["init", "--yes"]);
    run(dir, ["create", "--set-version", "1.0.0"]);
    const r = run(dir, [
      "create",
      "--set-version",
      "0.5.0",
      "--allow-out-of-order",
    ]);
    expect(r.code).toBe(0);
  });

  it("create --dry-run does not create a tag", () => {
    run(dir, ["init", "--yes"]);
    const r = run(dir, ["create", "--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/dry-run/);
    const list = run(dir, ["list", "--json"]);
    expect(JSON.parse(list.stdout).data.latest).toBeNull();
  });

  it("list reports tags outside the configured line as orphan diagnostics", () => {
    run(dir, ["init", "--yes"]);
    execFileSync("git", ["tag", "random-thing"], { cwd: dir });
    execFileSync("git", ["tag", "v1.0.0"], { cwd: dir });
    const r = run(dir, ["list", "--json"]);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.data.orphans).toContain("random-thing");
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: "orphan-tag",
      severity: "warning",
      tag: "random-thing",
    }));
  });

  it("runs the complete audit through the built binary", () => {
    writeFileSync(
      path.join(dir, ".tagsmith.json"),
      JSON.stringify({
        tags: [
          { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          { name: "bare", pattern: "{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
        ],
        default: "app",
      }),
    );
    execFileSync("git", ["tag", "v1.0.0"], { cwd: dir });

    const r = run(dir, ["audit", "--json"]);
    const json = JSON.parse(r.stdout);

    expect(r.code).toBe(1);
    expect(json).toMatchObject({ schemaVersion: 1, command: "audit", ok: false });
    expect(json.data.ambiguous).toEqual([
      { tag: "v1.0.0", lines: ["app", "bare"] },
    ]);
  });

  it("next works without a config using implicit defaults", () => {
    const r = run(dir, ["next"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/v0\.1\.0/);
  });

  it("derives a SemVer bump from Conventional Commits through the built CLI", () => {
    run(dir, ["init", "--yes"]);
    run(dir, ["create", "--set-version", "1.0.0"]);
    writeFileSync(path.join(dir, "feature.txt"), "enabled\n");
    execFileSync("git", ["add", "feature.txt"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "feat: add an API"], { cwd: dir });

    const r = run(dir, ["next", "--from-commits", "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({
      schemaVersion: 1,
      command: "next",
      ok: true,
      data: {
        tag: "v1.1.0",
        recommendation: { level: "minor" },
      },
    });
  });

  it("plans releases through the built CLI without creating tags", () => {
    run(dir, ["init", "--yes"]);
    writeFileSync(path.join(dir, "feature.txt"), "enabled\n");
    execFileSync("git", ["add", "feature.txt"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "feat: add planning"], { cwd: dir });

    const r = run(dir, ["plan", "--all", "--from-commits", "--json"]);
    const plan = JSON.parse(r.stdout);

    expect(r.code).toBe(0);
    expect(plan).toMatchObject({
      schemaVersion: 1,
      command: "plan",
      ok: true,
      data: { hasReleases: true },
    });
    expect(plan.data.lines[0]).toMatchObject({
      line: "default",
      status: "ready",
      candidate: { tag: "v0.1.0" },
      recommendation: { level: "minor" },
    });
    expect(execFileSync("git", ["tag", "--list"], { cwd: dir }).toString()).toBe("");
  });

  it("shows a welcome banner and first step in top-level help", () => {
    const r = run(dir, ["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/tagsmith init/);
    expect(r.stdout).toMatch(/Examples/);
    expect(r.stdout).toMatch(/guide/);
  });

  it("includes an examples block in create --help", () => {
    const r = run(dir, ["create", "--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Examples/);
    expect(r.stdout).toMatch(/tagsmith create/);
  });
});
