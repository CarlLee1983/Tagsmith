import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
      expect(r.code).toBe(0);
      expect(r.out).toMatch(/No tags/);
      expect(r.out).toMatch(/\.tagsmith\.json/);
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

    it("reports a tag that matches its line as ok (no duplicate detection in check)", async () => {
      // Under the new cross-line semantics, `check` classifies tags against their
      // owning line but does NOT perform duplicate-against-existing-repo detection.
      // Duplicate safety is enforced by `create`, not `check`.
      await runInit(dir, { yes: true });
      tag(dir, "v1.0.0");
      const r = await capture(() => runCheck(dir, ["v1.0.0"], {}));
      expect(r.code).toBe(0);
    });

    it("validates explicit tags without a config file", async () => {
      const r = await capture(() => runCheck(dir, ["v1.0.0"], {}));
      expect(r.code).toBe(0);
    });

    it("lints all repo tags — passes when all conform (exit 0)", async () => {
      await runInit(dir, { yes: true });
      tag(dir, "v1.0.0");
      tag(dir, "v1.1.0");
      const r = await capture(() => runCheck(dir, [], {}));
      expect(r.code).toBe(0);
      // Human output now lists each tag with "ok" and its owning line.
      expect(r.out).toMatch(/v1\.0\.0/);
      expect(r.out).toMatch(/ok/);
    });

    it("lints all repo tags — fails on anomaly (exit 1)", async () => {
      await runInit(dir, { yes: true });
      tag(dir, "v1.0.0");
      tag(dir, "junk");
      const r = await capture(() => runCheck(dir, [], {}));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/junk/);
    });

    it("lint mode emits JSON with results shape", async () => {
      // JSON shape changed from { ok, anomalies } to { results: [{ raw, line, ok, anomaly }] }
      // under the new cross-line check semantics.
      await runInit(dir, { yes: true });
      tag(dir, "junk");
      const r = await capture(() => runCheck(dir, [], { json: true }));
      const parsed = JSON.parse(r.out);
      expect(parsed).toHaveProperty("results");
      const junkResult = parsed.results.find((res: { raw: string }) => res.raw === "junk");
      expect(junkResult.ok).toBe(false);
      expect(junkResult.line).toBeNull();
    });

    it("explicit mode emits JSON with results shape", async () => {
      // JSON shape changed from { ok, checks } to { results: [{ raw, line, ok, anomaly }] }
      // under the new cross-line check semantics.
      await runInit(dir, { yes: true });
      const r = await capture(() => runCheck(dir, ["v1.2.3"], { json: true }));
      const parsed = JSON.parse(r.out);
      expect(parsed).toHaveProperty("results");
      expect(parsed.results[0]).toMatchObject({ raw: "v1.2.3", ok: true, anomaly: null, line: "default" });
    });

    it("explicit mode emits JSON for non-conforming tag", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runCheck(dir, ["junk"], { json: true }));
      const parsed = JSON.parse(r.out);
      expect(parsed.results[0]).toMatchObject({ raw: "junk", ok: false, anomaly: "pattern-mismatch", line: null });
    });

    it("explicit --json output is pure JSON (no decorated lines)", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runCheck(dir, ["v1.2.3"], { json: true }));
      expect(() => JSON.parse(r.out)).not.toThrow();
      expect(r.out).not.toMatch(/ ok$/m);
    });

    it("cross-line check reports which line each tag belongs to", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
          ],
          default: "app",
        }),
        "utf8",
      );
      const r = await capture(() =>
        runCheck(dir, ["v1.2.3", "release/9", "junk"], { json: true }),
      );
      const json = JSON.parse(r.out);
      expect(json).toHaveProperty("results");
      const byRaw = Object.fromEntries(
        json.results.map((res: { raw: string; line: string | null }) => [res.raw, res.line]),
      );
      expect(byRaw["v1.2.3"]).toBe("app");
      expect(byRaw["release/9"]).toBe("release");
      expect(byRaw["junk"]).toBeNull();
    });

    it("cross-line check exits 1 when any result is not ok", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
        }),
        "utf8",
      );
      // "junk" has no matching line → ok:false
      const r = await capture(() =>
        runCheck(dir, ["v1.2.3", "junk"], { json: true }),
      );
      const json = JSON.parse(r.out);
      expect(r.code).toBe(1);
      const junkResult = json.results.find((res: { raw: string }) => res.raw === "junk");
      expect(junkResult.ok).toBe(false);
    });

    it("--tag restricts validation to the named line", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
          ],
          default: "app",
        }),
        "utf8",
      );
      // release/9 does not match the "app" pattern → ok:false
      const r = await capture(() =>
        runCheck(dir, ["release/9"], { tag: "app", json: true }),
      );
      const json = JSON.parse(r.out);
      expect(json.results[0].ok).toBe(false);
      expect(r.code).toBe(1);
    });

    it("--tag with a conforming tag on the correct line exits 0", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
          ],
          default: "app",
        }),
        "utf8",
      );
      const r = await capture(() =>
        runCheck(dir, ["v1.2.3"], { tag: "app", json: true }),
      );
      const json = JSON.parse(r.out);
      expect(json.results[0].ok).toBe(true);
      expect(json.results[0].line).toBe("app");
      expect(r.code).toBe(0);
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

    it("uses implicit semver defaults when no config", async () => {
      const r = await capture(() => runNext(dir, {}));
      expect(r.code).toBe(0);
      expect(r.out).toContain("v0.1.0");
      expect(r.out).toMatch(/\.tagsmith\.json/);
    });

    it("next --tag selects the named line and outputs line in JSON", async () => {
      // Multi-line config: app (semver v{version}), release (build release/{version})
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
          ],
          default: "app",
        }),
        "utf8",
      );
      tag(dir, "v1.0.0");
      tag(dir, "release/7");

      const r = await capture(() => runNext(dir, { tag: "release", json: true }));
      expect(r.code).toBe(0);
      const json = JSON.parse(r.out);
      expect(json.line).toBe("release");
      expect(json.tag).toBe("release/8");
    });

    it("next with unknown --tag exits 1 with Available: in stderr", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
        }),
        "utf8",
      );

      const r = await capture(() => runNext(dir, { tag: "ghost" }));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/Available:/);
    });
  });

  describe("list --tag (single-line selection)", () => {
    it("shows only the selected line's tags in a multi-line config", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
          ],
          default: "app",
        }),
        "utf8",
      );
      tag(dir, "v1.0.0");
      tag(dir, "release/3");
      tag(dir, "orphan-tag");

      const r = await capture(() => runList(dir, { tag: "release" }));
      expect(r.code).toBe(0);
      // Should show release line tags
      expect(r.out).toContain("release/3");
      // Should NOT show app tags or orphan tags
      expect(r.out).not.toContain("v1.0.0");
      expect(r.out).not.toContain("orphan-tag");
    });

    it("--tag with --json includes line field in single-line output", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
          ],
          default: "app",
        }),
        "utf8",
      );
      tag(dir, "v1.0.0");
      tag(dir, "release/3");

      const r = await capture(() => runList(dir, { tag: "release", json: true }));
      expect(r.code).toBe(0);
      const parsed = JSON.parse(r.out);
      expect(parsed.line).toBe("release");
      expect(parsed).toHaveProperty("conforming");
      expect(parsed).toHaveProperty("latest");
      expect(parsed.latest).toBe("release/3");
    });

    it("--all and --tag are mutually exclusive (exits 1)", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
        }),
        "utf8",
      );

      const r = await capture(() => runList(dir, { all: true, tag: "app" }));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/mutually exclusive/);
    });
  });

  describe("list --all", () => {
    it("groups tags per line and surfaces orphans in human-readable output", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
          ],
          default: "app",
        }),
        "utf8",
      );
      tag(dir, "v1.0.0");
      tag(dir, "release/3");
      tag(dir, "legacy-tag");

      const r = await capture(() => runList(dir, { all: true }));
      expect(r.code).toBe(0);
      expect(r.out).toMatch(/app/);
      expect(r.out).toMatch(/release/);
      expect(r.out).toMatch(/v1\.0\.0/);
      expect(r.out).toMatch(/release\/3/);
      // orphan section
      expect(r.out).toMatch(/legacy-tag/);
    });

    it("--json --all outputs { lines, orphans } shape", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "release", pattern: "release/{version}", model: { type: "build" }, initialVersion: "1" },
          ],
          default: "app",
        }),
        "utf8",
      );
      tag(dir, "v1.0.0");
      tag(dir, "release/3");
      tag(dir, "legacy-tag");

      const r = await capture(() => runList(dir, { all: true, json: true }));
      expect(r.code).toBe(0);
      const parsed = JSON.parse(r.out);
      // top-level keys
      expect(parsed).toHaveProperty("lines");
      expect(parsed).toHaveProperty("orphans");
      // lines array: one entry per tag line
      expect(parsed.lines).toHaveLength(2);
      const appEntry = parsed.lines.find((l: { line: string }) => l.line === "app");
      const releaseEntry = parsed.lines.find((l: { line: string }) => l.line === "release");
      expect(appEntry).toBeDefined();
      expect(releaseEntry).toBeDefined();
      expect(appEntry.conforming.map((t: { tag: string }) => t.tag)).toContain("v1.0.0");
      expect(releaseEntry.conforming.map((t: { tag: string }) => t.tag)).toContain("release/3");
      // orphans array
      expect(parsed.orphans).toContain("legacy-tag");
    });

    it("list --all with no orphans omits orphans section in human output", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
        }),
        "utf8",
      );
      tag(dir, "v1.0.0");

      const r = await capture(() => runList(dir, { all: true }));
      expect(r.code).toBe(0);
      expect(r.out).toMatch(/v1\.0\.0/);
      expect(r.out).not.toMatch(/[Oo]rphan/);
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

    it("create with unknown --tag exits 1 with Available: in stderr", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
        }),
        "utf8",
      );

      const r = await capture(() => runCreate(dir, { tag: "ghost" }));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/Available:/);
    });
  });

  describe("zero-config (implicit semver)", () => {
    it("next bumps patch from an existing v-prefixed tag", async () => {
      tag(dir, "v0.1.0");
      const r = await capture(() => runNext(dir, { json: true }));
      expect(r.code).toBe(0);
      const json = JSON.parse(r.out);
      expect(json.tag).toBe("v0.1.1");
      expect(json.configSource).toBe("inferred");
      expect(json.pattern).toBe("v{version}");
    });

    it("next bumps minor when requested", async () => {
      tag(dir, "v0.1.0");
      const r = await capture(() => runNext(dir, { level: "minor", json: true }));
      expect(JSON.parse(r.out).tag).toBe("v0.2.0");
    });

    it("infers bare semver pattern from existing tags", async () => {
      tag(dir, "0.1.0");
      const r = await capture(() => runNext(dir, { json: true }));
      expect(JSON.parse(r.out).pattern).toBe("{version}");
      expect(JSON.parse(r.out).tag).toBe("0.1.1");
    });

    it("create rejects a duplicate tag without config", async () => {
      tag(dir, "v1.0.0");
      const r = await capture(() =>
        runCreate(dir, { setVersion: "1.0.0", allowOutOfOrder: true }),
      );
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/already exists/);
    });

    it("check accepts bare semver when inferred from the argument", async () => {
      const r = await capture(() => runCheck(dir, ["0.1.0"], { json: true }));
      expect(r.code).toBe(0);
      expect(JSON.parse(r.out).pattern).toBe("{version}");
    });

    it("prefers an on-disk config over inference", async () => {
      tag(dir, "0.1.0");
      await runInit(dir, { yes: true, pattern: "v{version}" });
      const r = await capture(() => runNext(dir, { json: true }));
      expect(JSON.parse(r.out).tag).toBe("v0.1.0");
      expect(JSON.parse(r.out).configSource).toBeUndefined();
    });

    it("lists orphan tags that do not match the inferred pattern", async () => {
      tag(dir, "v1.0.0");
      tag(dir, "release/9");
      const r = await capture(() => runList(dir, {}));
      expect(r.out).toContain("v1.0.0");
      expect(r.out).toMatch(/non-conforming|orphan|release\/9/i);
    });
  });
});
