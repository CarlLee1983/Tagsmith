import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
    expect(JSON.parse(ls.stdout).latest).toBeNull();
  });

  it("full lifecycle: init → next → create → list", () => {
    run(dir, ["init", "--yes", "--model", "semver"]);

    const next1 = run(dir, ["next", "--json"]);
    expect(JSON.parse(next1.stdout).tag).toBe("v0.1.0");

    const create1 = run(dir, ["create"]);
    expect(create1.code).toBe(0);
    expect(create1.stdout).toContain("v0.1.0");

    const create2 = run(dir, ["create", "--level", "minor"]);
    expect(create2.code).toBe(0);
    expect(create2.stdout).toContain("v0.2.0");

    const list = run(dir, ["list", "--json"]);
    const parsed = JSON.parse(list.stdout);
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
    expect(JSON.parse(list.stdout).latest).toBeNull();
  });

  it("list flags non-conforming tags", () => {
    run(dir, ["init", "--yes"]);
    execFileSync("git", ["tag", "random-thing"], { cwd: dir });
    execFileSync("git", ["tag", "v1.0.0"], { cwd: dir });
    const r = run(dir, ["list", "--json"]);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.anomalies).toContainEqual({
      tag: "random-thing",
      reason: "pattern-mismatch",
    });
  });

  it("commands fail cleanly without a config", () => {
    const r = run(dir, ["next"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/tagsmith init/);
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
