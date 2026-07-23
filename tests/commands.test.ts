import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runInit } from "../src/cli/init.js";
import { runList } from "../src/cli/list.js";
import { runNext } from "../src/cli/next.js";
import { runCreate } from "../src/cli/create.js";
import { runCheck } from "../src/cli/check.js";
import { runAudit } from "../src/cli/audit.js";
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

function jsonOutput(out: string): {
  schemaVersion: number;
  command: string;
  ok: boolean;
  data: any;
  diagnostics: unknown[];
} {
  return JSON.parse(out);
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
      expect(r.out).toMatch(/orphan/i);
      expect(r.out).toContain("junk");
    });

    it("emits JSON", async () => {
      await runInit(dir, { yes: true });
      tag(dir, "v2.0.0");
      const r = await capture(() => runList(dir, { json: true }));
      const json = jsonOutput(r.out);
      expect(json).toMatchObject({ schemaVersion: 1, command: "list", ok: true });
      expect(json.data.latest).toBe("v2.0.0");
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

    it("strict mode rejects an explicit tag whose version already exists", async () => {
      await runInit(dir, { yes: true });
      tag(dir, "v1.0.0");

      const r = await capture(() =>
        runCheck(dir, ["v1.0.0"], { strict: true, json: true }),
      );

      expect(r.code).toBe(1);
      const result = jsonOutput(r.out).data.results[0];
      expect(result).toMatchObject({
        raw: "v1.0.0",
        ok: false,
        anomaly: "duplicate-version",
      });
      expect(jsonOutput(r.out).data.strict).toBe(true);
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
      const parsed = jsonOutput(r.out);
      expect(parsed).toMatchObject({ schemaVersion: 1, command: "check", ok: false });
      const junkResult = parsed.data.results.find((res: { raw: string }) => res.raw === "junk");
      expect(junkResult.ok).toBe(false);
      expect(junkResult.line).toBeNull();
    });

    it("explicit mode emits JSON with results shape", async () => {
      // JSON shape changed from { ok, checks } to { results: [{ raw, line, ok, anomaly }] }
      // under the new cross-line check semantics.
      await runInit(dir, { yes: true });
      const r = await capture(() => runCheck(dir, ["v1.2.3"], { json: true }));
      const parsed = jsonOutput(r.out);
      expect(parsed).toMatchObject({ schemaVersion: 1, command: "check", ok: true });
      expect(parsed.data.results[0]).toMatchObject({ raw: "v1.2.3", ok: true, anomaly: null, line: "default" });
    });

    it("explicit mode emits JSON for non-conforming tag", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runCheck(dir, ["junk"], { json: true }));
      const parsed = jsonOutput(r.out);
      expect(parsed.data.results[0]).toMatchObject({ raw: "junk", ok: false, anomaly: "pattern-mismatch", line: null });
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
      const json = jsonOutput(r.out);
      expect(json.data).toHaveProperty("results");
      const byRaw = Object.fromEntries(
        json.data.results.map((res: { raw: string; line: string | null }) => [res.raw, res.line]),
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
      const json = jsonOutput(r.out);
      expect(r.code).toBe(1);
      const junkResult = json.data.results.find((res: { raw: string }) => res.raw === "junk");
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
      const json = jsonOutput(r.out);
      expect(json.data.results[0].ok).toBe(false);
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
      const json = jsonOutput(r.out);
      expect(json.data.results[0].ok).toBe(true);
      expect(json.data.results[0].line).toBe("app");
      expect(r.code).toBe(0);
    });

    it("keeps detecting an ambiguous assignment even when --tag selects one matching line", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "bare", pattern: "{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
        }),
        "utf8",
      );
      const r = await capture(() => runCheck(dir, ["v1.2.3"], { tag: "app", json: true }));

      expect(r.code).toBe(1);
      expect(jsonOutput(r.out).data.results[0]).toMatchObject({
        line: null,
        matches: ["app", "bare"],
        anomaly: "ambiguous-assignment",
      });
    });
  });

  describe("audit", () => {
    it("renders a human-readable summary while preserving orphan tags as warnings", async () => {
      await runInit(dir, { yes: true });
      tag(dir, "legacy-tag");

      const r = await capture(() => runAudit(dir, {}));

      expect(r.code).toBe(0);
      expect(r.out).toMatch(/default: 0 conforming tag\(s\); latest: none/);
      expect(r.out).toMatch(/\[orphan-tag\]/);
      expect(r.out).toMatch(/Audit passed with 1 warning/);
    });

    it("reports complete assignment safety in a versioned JSON envelope", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "bare", pattern: "{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
        }),
        "utf8",
      );
      tag(dir, "v1.0.0");

      const r = await capture(() => runAudit(dir, { json: true }));
      const json = jsonOutput(r.out);

      expect(r.code).toBe(1);
      expect(json).toMatchObject({ schemaVersion: 1, command: "audit", ok: false });
      expect(json.data).toMatchObject({
        config: { source: "file" },
        ambiguous: [{ tag: "v1.0.0", lines: ["app", "bare"] }],
      });
      expect(json.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "ambiguous-assignment", severity: "error" }),
      ]));
    });

    it("reports configured release readiness separately from tag-history findings", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          pattern: "v{version}",
          model: { type: "semver" },
          initialVersion: "0.1.0",
          releasePolicy: { allowedBranches: ["release/*"] },
        }),
        "utf8",
      );

      const r = await capture(() => runAudit(dir, { json: true }));
      const json = jsonOutput(r.out);

      expect(r.code).toBe(1);
      expect(json.data.releaseReadiness).toMatchObject({ enabled: true, ok: false });
      expect(json.diagnostics).toContainEqual(expect.objectContaining({
        code: "release-branch-not-allowed",
        severity: "error",
      }));
      expect(json.data.remote).toEqual({ checked: false });
    });

    it("keeps JSON output parseable when auditing outside a repository", async () => {
      const outside = await mkdtemp(path.join(tmpdir(), "tagsmith-no-repo-"));
      try {
        const r = await capture(() => runAudit(outside, { json: true }));
        expect(r.code).toBe(1);
        expect(r.err).toBe("");
        expect(jsonOutput(r.out)).toMatchObject({
          schemaVersion: 1,
          command: "audit",
          ok: false,
          data: null,
          diagnostics: [expect.objectContaining({ code: "command-error", severity: "error" })],
        });
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
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
      expect(jsonOutput(r.out).data.tag).toBe("v1.3.0");
    });

    it("derives a semver bump from Conventional Commits since the latest tag", async () => {
      await runInit(dir, { yes: true });
      tag(dir, "v1.0.0");
      await writeFile(path.join(dir, "feature.txt"), "enabled\n", "utf8");
      execFileSync("git", ["add", "feature.txt"], { cwd: dir });
      execFileSync("git", ["commit", "-q", "-m", "feat: add remote safety"], {
        cwd: dir,
      });

      const r = await capture(() =>
        runNext(dir, { fromCommits: true, json: true }),
      );

      expect(r.code).toBe(0);
      expect(jsonOutput(r.out)).toMatchObject({
        schemaVersion: 1,
        command: "next",
        ok: true,
        data: {
        tag: "v1.1.0",
        recommendation: { level: "minor" },
        },
      });
    });

    it("does not combine Conventional Commit recommendation with an explicit level", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() =>
        runNext(dir, { fromCommits: true, level: "patch" }),
      );

      expect(r.code).toBe(1);
      expect(r.err).toMatch(/cannot be combined with --level/);
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
      const json = jsonOutput(r.out);
      expect(json.data.line).toBe("release");
      expect(json.data.tag).toBe("release/8");
    });

    it("only proposes a workspace release when that workspace changed", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            {
              name: "api",
              workspace: "packages/api",
              pattern: "api/v{version}",
              model: { type: "semver" },
              initialVersion: "0.1.0",
            },
            {
              name: "web",
              workspace: "packages/web",
              pattern: "web/v{version}",
              model: { type: "semver" },
              initialVersion: "0.1.0",
            },
          ],
          default: "api",
        }),
        "utf8",
      );
      await mkdir(path.join(dir, "packages", "api"), { recursive: true });
      await mkdir(path.join(dir, "packages", "web"), { recursive: true });
      await writeFile(path.join(dir, "packages", "api", "index.ts"), "export {};\n");
      await writeFile(path.join(dir, "packages", "web", "index.ts"), "export {};\n");
      execFileSync("git", ["add", "packages"], { cwd: dir });
      execFileSync("git", ["commit", "-q", "-m", "feat: add packages"], { cwd: dir });
      tag(dir, "api/v1.0.0");

      await writeFile(path.join(dir, "packages", "web", "index.ts"), "export const web = true;\n");
      execFileSync("git", ["add", "packages/web/index.ts"], { cwd: dir });
      execFileSync("git", ["commit", "-q", "-m", "feat(web)!: redesign client"], {
        cwd: dir,
      });
      const blocked = await capture(() =>
        runNext(dir, { tag: "api", requireChanges: true }),
      );
      expect(blocked.code).toBe(1);
      expect(blocked.err).toMatch(/No changes in workspace "packages\/api"/);

      await writeFile(path.join(dir, "packages", "api", "index.ts"), "export const api = true;\n");
      execFileSync("git", ["add", "packages/api/index.ts"], { cwd: dir });
      execFileSync("git", ["commit", "-q", "-m", "fix(api): correct output"], {
        cwd: dir,
      });
      const scopedRecommendation = await capture(() =>
        runNext(dir, {
          tag: "api",
          fromCommits: true,
          requireChanges: true,
          json: true,
        }),
      );
      expect(scopedRecommendation.code).toBe(0);
      expect(jsonOutput(scopedRecommendation.out).data).toMatchObject({
        tag: "api/v1.0.1",
        recommendation: {
          level: "patch",
          reasons: [expect.objectContaining({ summary: "fix(api): correct output" })],
        },
      });
      const allowed = await capture(() =>
        runNext(dir, { tag: "api", requireChanges: true, json: true }),
      );
      expect(allowed.code).toBe(0);
      expect(jsonOutput(allowed.out).data.tag).toBe("api/v1.0.1");

      const created = await capture(() =>
        runCreate(dir, { tag: "api", requireChanges: true }),
      );
      expect(created.code).toBe(0);
      expect(execFileSync("git", ["tag", "-l", "api/v1.0.1"], { cwd: dir }).toString()).toBe(
        "api/v1.0.1\n",
      );
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

    it("refuses to plan a line whose history contains an ambiguous tag", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "bare", pattern: "{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
        }),
        "utf8",
      );
      tag(dir, "v1.0.0");

      const r = await capture(() => runNext(dir, { json: true }));
      expect(r.code).toBe(1);
      expect(jsonOutput(r.out)).toMatchObject({
        command: "next",
        ok: false,
        data: null,
        diagnostics: [expect.objectContaining({ code: "command-error" })],
      });
      expect(jsonOutput(r.out).diagnostics[0]).toMatchObject({ message: expect.stringMatching(/tagsmith audit/) });
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
      const parsed = jsonOutput(r.out);
      expect(parsed).toMatchObject({ schemaVersion: 1, command: "list", ok: true });
      expect(parsed.data.line).toBe("release");
      expect(parsed.data).toHaveProperty("conforming");
      expect(parsed.data).toHaveProperty("latest");
      expect(parsed.data.latest).toBe("release/3");
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
      const parsed = jsonOutput(r.out);
      // top-level keys
      expect(parsed).toMatchObject({ schemaVersion: 1, command: "list", ok: true });
      expect(parsed.data).toHaveProperty("lines");
      expect(parsed.data).toHaveProperty("orphans");
      // lines array: one entry per tag line
      expect(parsed.data.lines).toHaveLength(2);
      const appEntry = parsed.data.lines.find((l: { line: string }) => l.line === "app");
      const releaseEntry = parsed.data.lines.find((l: { line: string }) => l.line === "release");
      expect(appEntry).toBeDefined();
      expect(releaseEntry).toBeDefined();
      expect(appEntry.conforming.map((t: { tag: string }) => t.tag)).toContain("v1.0.0");
      expect(releaseEntry.conforming.map((t: { tag: string }) => t.tag)).toContain("release/3");
      // orphans array
      expect(parsed.data.orphans).toContain("legacy-tag");
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

    it("creates the Conventional Commit recommended version", async () => {
      await runInit(dir, { yes: true });
      tag(dir, "v1.0.0");
      await writeFile(path.join(dir, "fix.txt"), "fixed\n", "utf8");
      execFileSync("git", ["add", "fix.txt"], { cwd: dir });
      execFileSync("git", ["commit", "-q", "-m", "feat: add a workflow"], {
        cwd: dir,
      });

      const r = await capture(() => runCreate(dir, { fromCommits: true }));

      expect(r.code).toBe(0);
      expect(r.out).toMatch(/recommend a minor release/);
      expect(execFileSync("git", ["tag", "-l", "v1.1.0"], { cwd: dir }).toString()).toBe(
        "v1.1.0\n",
      );
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

    it("refuses to create from a line whose history contains an ambiguous tag", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "bare", pattern: "{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
        }),
        "utf8",
      );
      tag(dir, "v1.0.0");

      const r = await capture(() => runCreate(dir, {}));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/ambiguous tag assignment/);
      expect(execFileSync("git", ["tag", "-l"], { cwd: dir, encoding: "utf8" })).toBe("v1.0.0\n");
    });

    it("enforces an annotated candidate only when --enforce-policy is requested", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          pattern: "v{version}",
          model: { type: "semver" },
          initialVersion: "0.1.0",
          releasePolicy: { requireAnnotatedTag: true },
        }),
        "utf8",
      );

      const unguarded = await capture(() => runCreate(dir, { dryRun: true }));
      expect(unguarded.code).toBe(0);

      const guarded = await capture(() =>
        runCreate(dir, { dryRun: true, enforcePolicy: true }),
      );
      expect(guarded.code).toBe(1);
      expect(guarded.out).toMatch(/FAIL.*must be annotated/);

      const ready = await capture(() =>
        runCreate(dir, {
          dryRun: true,
          enforcePolicy: true,
          message: "Release 0.1.0",
        }),
      );
      expect(ready.code).toBe(0);
      expect(ready.out).toMatch(/PASS.*will be annotated/);
    });

    it("blocks a dirty worktree under an enforced release policy", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          pattern: "v{version}",
          model: { type: "semver" },
          initialVersion: "0.1.0",
          releasePolicy: { requireCleanWorktree: true },
        }),
        "utf8",
      );
      execFileSync("git", ["add", ".tagsmith.json"], { cwd: dir });
      execFileSync("git", ["commit", "-q", "-m", "chore: configure release policy"], { cwd: dir });
      await writeFile(path.join(dir, "uncommitted.txt"), "dirty\n", "utf8");

      const r = await capture(() =>
        runCreate(dir, { dryRun: true, enforcePolicy: true }),
      );

      expect(r.code).toBe(1);
      expect(r.out).toMatch(/FAIL.*Worktree is dirty/);
      expect(execFileSync("git", ["tag", "-l"], { cwd: dir, encoding: "utf8" })).toBe("");
    });

    it("blocks an explicitly non-HEAD target under an enforced release policy", async () => {
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          pattern: "v{version}",
          model: { type: "semver" },
          initialVersion: "0.1.0",
          releasePolicy: { requireHeadTag: true },
        }),
        "utf8",
      );
      execFileSync("git", ["add", ".tagsmith.json"], { cwd: dir });
      execFileSync("git", ["commit", "-q", "-m", "chore: configure release policy"], { cwd: dir });
      execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "feat: prepare release"], { cwd: dir });

      const r = await capture(() =>
        runCreate(dir, {
          dryRun: true,
          enforcePolicy: true,
          target: "HEAD~1",
        }),
      );

      expect(r.code).toBe(1);
      expect(r.out).toMatch(/FAIL.*other than HEAD/);
    });

    it("does not let --sign open an editor without an explicit message", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runCreate(dir, { sign: true }));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/--sign requires --message/);
    });
  });

  describe("zero-config (implicit semver)", () => {
    it("next bumps patch from an existing v-prefixed tag", async () => {
      tag(dir, "v0.1.0");
      const r = await capture(() => runNext(dir, { json: true }));
      expect(r.code).toBe(0);
      const json = jsonOutput(r.out);
      expect(json.data.tag).toBe("v0.1.1");
      expect(json.data.config.source).toBe("inferred");
      expect(json.data.config.pattern).toBe("v{version}");
    });

    it("next bumps minor when requested", async () => {
      tag(dir, "v0.1.0");
      const r = await capture(() => runNext(dir, { level: "minor", json: true }));
      expect(jsonOutput(r.out).data.tag).toBe("v0.2.0");
    });

    it("infers bare semver pattern from existing tags", async () => {
      tag(dir, "0.1.0");
      const r = await capture(() => runNext(dir, { json: true }));
      expect(jsonOutput(r.out).data.config.pattern).toBe("{version}");
      expect(jsonOutput(r.out).data.tag).toBe("0.1.1");
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
      expect(jsonOutput(r.out).data.config.pattern).toBe("{version}");
    });

    it("prefers an on-disk config over inference", async () => {
      tag(dir, "0.1.0");
      await runInit(dir, { yes: true, pattern: "v{version}" });
      const r = await capture(() => runNext(dir, { json: true }));
      expect(jsonOutput(r.out).data.tag).toBe("v0.1.0");
      expect(jsonOutput(r.out).data.config).toEqual({ source: "file" });
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
