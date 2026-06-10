import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runInit } from "../src/cli/init.js";
import { runList } from "../src/cli/list.js";
import { runNext } from "../src/cli/next.js";
import { runCreate } from "../src/cli/create.js";
import { runCheck } from "../src/cli/check.js";
import { configExists } from "../src/core/config.js";

/** Capture everything written to stdout/stderr during `fn`. */
async function capture(fn: () => Promise<number>): Promise<{
  code: number;
  out: string;
  err: string;
}> {
  let out = "";
  let err = "";
  const outSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      out += chunk.toString();
      return true;
    });
  const errSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      err += chunk.toString();
      return true;
    });
  try {
    const code = await fn();
    return { code, out, err };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

function gitInit(dir: string): void {
  const g = (args: string[]) => execFileSync("git", args, { cwd: dir });
  g(["init", "-q"]);
  g(["config", "user.email", "t@example.com"]);
  g(["config", "user.name", "Test"]);
  g(["commit", "--allow-empty", "-q", "-m", "init"]);
}

function tag(dir: string, name: string): void {
  execFileSync("git", ["tag", name], { cwd: dir });
}

describe("command runners (in-process)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tagsmith-cmd-"));
    gitInit(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("init", () => {
    it("writes config with --yes and chosen model", async () => {
      const r = await capture(() =>
        runInit(dir, { yes: true, model: "calver" }),
      );
      expect(r.code).toBe(0);
      expect(await configExists(dir)).toBe(true);
    });

    it("refuses to overwrite without --force", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runInit(dir, { yes: true }));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/already exists/);
    });

    it("overwrites with --force", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() =>
        runInit(dir, { yes: true, force: true, pattern: "release/{version}" }),
      );
      expect(r.code).toBe(0);
    });

    it("builds each model type from flags", async () => {
      for (const model of ["semver", "calver", "build"]) {
        const d = await mkdtemp(path.join(tmpdir(), "tagsmith-m-"));
        const r = await capture(() => runInit(d, { yes: true, model }));
        expect(r.code).toBe(0);
        await rm(d, { recursive: true, force: true });
      }
    });

    it("prints next-step hints after success", async () => {
      const r = await capture(() => runInit(dir, { yes: true }));
      expect(r.out).toMatch(/tagsmith list/);
      expect(r.out).toMatch(/tagsmith next/);
    });

    it("suppresses next-step hints when hints:false", async () => {
      const r = await capture(() => runInit(dir, { yes: true, hints: false }));
      expect(r.code).toBe(0);
      expect(r.out).not.toMatch(/Next step/);
    });
  });

  describe("list", () => {
    it("reports empty repo", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runList(dir, {}));
      expect(r.code).toBe(0);
      expect(r.out).toMatch(/No tags/);
    });

    it("renders conforming and anomalous tags", async () => {
      await runInit(dir, { yes: true });
      tag(dir, "v1.0.0");
      tag(dir, "v1.2.0");
      tag(dir, "junk");
      const r = await capture(() => runList(dir, {}));
      expect(r.out).toContain("v1.2.0");
      expect(r.out).toMatch(/latest/);
      expect(r.out).toMatch(/non-conforming/);
      expect(r.out).toContain("junk");
    });

    it("emits JSON", async () => {
      await runInit(dir, { yes: true });
      tag(dir, "v2.0.0");
      const r = await capture(() => runList(dir, { json: true }));
      expect(JSON.parse(r.out).latest).toBe("v2.0.0");
    });

    it("fails without a config", async () => {
      const r = await capture(() => runList(dir, {}));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/tagsmith init/);
      expect(r.out).toMatch(/tagsmith init/);
    });
  });

  describe("check", () => {
    it("passes a conforming explicit tag (exit 0)", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runCheck(dir, ["v1.2.3"], {}));
      expect(r.code).toBe(0);
    });

    it("fails a non-conforming explicit tag (exit 1)", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runCheck(dir, ["junk"], {}));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/junk/);
    });

    it("detects a duplicate against an existing tag", async () => {
      await runInit(dir, { yes: true });
      tag(dir, "v1.0.0");
      const r = await capture(() => runCheck(dir, ["v1.0.0"], {}));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/duplicate/);
    });

    it("fails without a config", async () => {
      const r = await capture(() => runCheck(dir, ["v1.0.0"], {}));
      expect(r.code).toBe(1);
    });
  });

  describe("next", () => {
    it("computes initial when no tags", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runNext(dir, {}));
      expect(r.out).toContain("v0.1.0");
      expect(r.out).toMatch(/initial/);
    });

    it("bumps from latest with level and JSON", async () => {
      await runInit(dir, { yes: true });
      tag(dir, "v1.2.0");
      const r = await capture(() => runNext(dir, { level: "minor", json: true }));
      expect(JSON.parse(r.out).tag).toBe("v1.3.0");
    });

    it("rejects an invalid level", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runNext(dir, { level: "bogus" }));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/Invalid level/);
    });

    it("suggests create with the same level after success", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runNext(dir, { level: "minor" }));
      expect(r.out).toMatch(/tagsmith create -l minor/);
    });

    it("stays silent (no hint) in JSON mode", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runNext(dir, { json: true }));
      expect(r.out).not.toMatch(/Next step/);
    });

    it("suppresses the hint when hints:false but still previews the tag", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runNext(dir, { hints: false }));
      expect(r.out).toContain("v0.1.0");
      expect(r.out).not.toMatch(/Next step/);
    });

    it("shows the first-run hint when no config", async () => {
      const r = await capture(() => runNext(dir, {}));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/tagsmith init/);
      expect(r.out).toMatch(/tagsmith init/);
    });
  });

  describe("create", () => {
    it("creates the next tag", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runCreate(dir, {}));
      expect(r.code).toBe(0);
      expect(r.out).toContain("v0.1.0");
      expect(execFileSync("git", ["tag", "-l"], { cwd: dir }).toString()).toContain(
        "v0.1.0",
      );
    });

    it("creates an annotated explicit version", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() =>
        runCreate(dir, { setVersion: "1.0.0", message: "first" }),
      );
      expect(r.code).toBe(0);
      const type = execFileSync(
        "git",
        ["cat-file", "-t", "v1.0.0"],
        { cwd: dir },
      )
        .toString()
        .trim();
      expect(type).toBe("tag"); // annotated
    });

    it("dry-run creates nothing", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runCreate(dir, { dryRun: true, push: true }));
      expect(r.code).toBe(0);
      expect(r.out).toMatch(/dry-run/);
      expect(execFileSync("git", ["tag", "-l"], { cwd: dir }).toString()).toBe("");
    });

    it("blocks out-of-order then allows override", async () => {
      await runInit(dir, { yes: true });
      await runCreate(dir, { setVersion: "1.0.0" });
      const blocked = await capture(() =>
        runCreate(dir, { setVersion: "0.5.0" }),
      );
      expect(blocked.code).toBe(1);
      const allowed = await capture(() =>
        runCreate(dir, { setVersion: "0.5.0", allowOutOfOrder: true }),
      );
      expect(allowed.code).toBe(0);
    });

    it("rejects a duplicate explicit tag", async () => {
      await runInit(dir, { yes: true });
      await runCreate(dir, { setVersion: "1.0.0" });
      const r = await capture(() =>
        runCreate(dir, { setVersion: "1.0.0", allowOutOfOrder: true }),
      );
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/already exists/);
    });

    it("suggests pushing the new tag after a non-pushed create", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runCreate(dir, {}));
      expect(r.out).toMatch(/git push origin v0\.1\.0/);
    });
  });
});
