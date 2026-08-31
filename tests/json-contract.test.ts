import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import Ajv, { type ValidateFunction } from "ajv";
import { runList } from "../src/cli/list.js";
import { runNext } from "../src/cli/next.js";
import { runCheck } from "../src/cli/check.js";
import { runAudit } from "../src/cli/audit.js";
import { runPlan } from "../src/cli/plan.js";
import { DIAGNOSTIC_CODES } from "../src/core/diagnostics.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The published JSON envelope is a product interface: every documented field is
 * validated against json-output.schema.json using real command output, so a
 * contract break fails here rather than in a caller's CI.
 */
async function compileValidator(): Promise<ValidateFunction> {
  const schema = JSON.parse(
    await readFile(path.join(root, "json-output.schema.json"), "utf8"),
  );
  return new Ajv({ allErrors: true, strict: false }).compile(schema);
}

async function capture(fn: () => Promise<number>): Promise<{ code: number; json: any }> {
  let out = "";
  const outSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      out += chunk.toString();
      return true;
    });
  const errSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  try {
    const code = await fn();
    return { code, json: JSON.parse(out) };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

function gitInit(dir: string): void {
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["commit", "--allow-empty", "-q", "-m", "init"]);
}

describe("JSON output contract", () => {
  let validate: ValidateFunction;
  let dir: string;

  /** Validate and surface ajv's own error list, which names the failing path. */
  function expectValid(envelope: unknown, label: string): void {
    const ok = validate(envelope);
    expect(
      ok,
      `${label} violates json-output.schema.json: ${JSON.stringify(validate.errors, null, 2)}`,
    ).toBe(true);
  }

  beforeEach(async () => {
    validate = await compileValidator();
    dir = await mkdtemp(path.join(tmpdir(), "tagsmith-contract-"));
    gitInit(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("registry", () => {
    it("keeps the schema enum identical to the code registry", async () => {
      const schema = JSON.parse(
        await readFile(path.join(root, "json-output.schema.json"), "utf8"),
      );
      expect(schema.definitions.diagnosticCode.enum).toEqual([...DIAGNOSTIC_CODES]);
    });

    it("registers every tag anomaly the schema accepts", async () => {
      const schema = JSON.parse(
        await readFile(path.join(root, "json-output.schema.json"), "utf8"),
      );
      for (const anomaly of schema.definitions.tagAnomaly.enum) {
        expect(DIAGNOSTIC_CODES).toContain(anomaly);
      }
    });
  });

  describe("rejection", () => {
    /**
     * A contract test that only ever passes proves nothing. Each mutation below
     * takes a real envelope and breaks exactly one documented guarantee.
     */
    it("rejects envelopes that break a documented guarantee", async () => {
      git(dir, ["tag", "v1.0.0"]);
      const valid = (await capture(() => runNext(dir, { json: true, level: "minor" }))).json;
      expect(validate(valid)).toBe(true);

      const mutations: Array<[string, (envelope: any) => void]> = [
        ["unknown diagnostic code", (e) => {
          e.diagnostics.push({ code: "made-up-code", severity: "error", message: "x" });
        }],
        ["unknown severity", (e) => {
          e.diagnostics.push({ code: "orphan-tag", severity: "info", message: "x" });
        }],
        ["extra envelope key", (e) => { e.extra = true; }],
        ["wrong schemaVersion", (e) => { e.schemaVersion = 2; }],
        ["unknown command", (e) => { e.command = "release"; }],
        ["missing required data field", (e) => { delete e.data.version; }],
        ["wrong data type", (e) => { e.data.fresh = "yes"; }],
        ["data shape from another command", (e) => { e.data = { config: { source: "file" } }; }],
      ];

      for (const [label, mutate] of mutations) {
        const broken = JSON.parse(JSON.stringify(valid));
        mutate(broken);
        expect(validate(broken), `schema wrongly accepted: ${label}`).toBe(false);
      }
    });

    it("rejects a list payload that mixes the --all and single-line shapes", async () => {
      git(dir, ["tag", "v1.0.0"]);
      const all = (await capture(() => runList(dir, { json: true, all: true }))).json;
      expect(validate(all)).toBe(true);

      // oneOf: satisfying both branches is as invalid as satisfying neither.
      const mixed = JSON.parse(JSON.stringify(all));
      Object.assign(mixed.data, {
        line: "default",
        conforming: [],
        anomalies: [],
        latest: null,
      });
      expect(validate(mixed)).toBe(false);
    });
  });

  describe("list", () => {
    it("validates the implicit-config, single-line and --all shapes", async () => {
      git(dir, ["tag", "v1.0.0"]);
      const implicit = await capture(() => runList(dir, { json: true }));
      expectValid(implicit.json, "list (implicit config)");
      expect(implicit.json.data.config).toEqual({ source: "inferred", pattern: "v{version}" });

      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
            { name: "rc", pattern: "rc-{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
        }),
      );
      git(dir, ["tag", "orphan-tag-name"]);

      const single = await capture(() => runList(dir, { json: true, tag: "app" }));
      expectValid(single.json, "list --tag");
      expect(single.json.data.line).toBe("app");

      const all = await capture(() => runList(dir, { json: true, all: true }));
      expectValid(all.json, "list --all");
      expect(all.json.data.lines).toHaveLength(2);
      expect(all.json.data.orphans).toContain("orphan-tag-name");
    });

    it("validates the command-error envelope outside a repository", async () => {
      const outside = await mkdtemp(path.join(tmpdir(), "tagsmith-bare-"));
      try {
        const result = await capture(() => runList(outside, { json: true }));
        expectValid(result.json, "list (command-error)");
        expect(result.json.data).toBeNull();
        expect(result.json.diagnostics[0].code).toBe("command-error");
        expect(result.json.ok).toBe(false);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  describe("check", () => {
    it("validates passing and failing results", async () => {
      const pass = await capture(() => runCheck(dir, ["v1.2.3"], { json: true }));
      expectValid(pass.json, "check (pass)");
      expect(pass.json.ok).toBe(true);

      const fail = await capture(() => runCheck(dir, ["nope"], { json: true }));
      expectValid(fail.json, "check (fail)");
      expect(fail.json.diagnostics[0].code).toBe("pattern-mismatch");
    });

    it("publishes invalid Git tag diagnostics without changing the envelope", async () => {
      const result = await capture(() => runCheck(
        dir,
        ["v1.0.0\nextra=true", "v 1.0.0", "v1..0", "release.lock"],
        { json: true },
      ));
      expectValid(result.json, "check (invalid Git tags)");
      expect(result.code).toBe(1);
      expect(result.json.diagnostics).toHaveLength(4);
      expect(result.json.diagnostics.every(
        (diagnostic: { code: string }) => diagnostic.code === "invalid-git-tag",
      )).toBe(true);
    });
  });

  describe("next", () => {
    it("validates a plain candidate and a Conventional Commit recommendation", async () => {
      git(dir, ["tag", "v1.0.0"]);
      const plain = await capture(() => runNext(dir, { json: true, level: "minor" }));
      expectValid(plain.json, "next");
      expect(plain.json.data.tag).toBe("v1.1.0");

      git(dir, ["commit", "--allow-empty", "-q", "-m", "feat: add a capability"]);
      const derived = await capture(() => runNext(dir, { json: true, fromCommits: true }));
      expectValid(derived.json, "next --from-commits");
      expect(derived.json.data.recommendation.level).toBe("minor");
    });

    it("validates the incomplete-history diagnostic envelope", async () => {
      git(dir, ["tag", "v1.0.0"]);
      git(dir, ["commit", "--allow-empty", "-q", "-m", "feat: hidden parent"]);
      await writeFile(path.join(dir, ".git", "shallow"), `${git(dir, ["rev-parse", "HEAD"]).trim()}\n`);

      const result = await capture(() => runNext(dir, { json: true, fromCommits: true }));
      expectValid(result.json, "next --from-commits (incomplete history)");
      expect(result.code).toBe(1);
      expect(result.json.diagnostics[0].code).toBe("incomplete-git-history");
    });
  });

  describe("audit", () => {
    it("validates overlaps, artifacts and release readiness together", async () => {
      await mkdir(path.join(dir, "packages/app"), { recursive: true });
      await writeFile(
        path.join(dir, "packages/app/package.json"),
        JSON.stringify({ name: "app", version: "1.0.0" }),
      );
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            {
              name: "app",
              pattern: "v{version}",
              model: { type: "semver" },
              initialVersion: "0.1.0",
              workspace: "packages/app",
              artifact: { type: "package-json" },
            },
            { name: "rc", pattern: "v{version}-rc", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
          releasePolicy: { allowedBranches: ["main"], requireCleanWorktree: true },
        }),
      );
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "feat: add app"]);
      git(dir, ["tag", "v1.0.0"]);

      const audit = await capture(() => runAudit(dir, { json: true }));
      expectValid(audit.json, "audit");
      expect(audit.json.data.overlaps).toHaveLength(1);
      expect(audit.json.data.artifacts[0].status).toBe("pass");
      expect(audit.json.data.releaseReadiness.enabled).toBe(true);

      const strict = await capture(() => runAudit(dir, { json: true, strictOverlap: true }));
      expectValid(strict.json, "audit --strict-overlap");
      expect(strict.json.ok).toBe(false);
    });

    it("validates an audit with no configuration file", async () => {
      git(dir, ["tag", "v1.0.0"]);
      const audit = await capture(() => runAudit(dir, { json: true }));
      expectValid(audit.json, "audit (implicit config)");
      expect(audit.json.data.releaseReadiness.enabled).toBe(false);
    });
  });

  describe("plan", () => {
    it("validates ready, skipped and blocked lines", async () => {
      await mkdir(path.join(dir, "packages/app"), { recursive: true });
      await writeFile(path.join(dir, "packages/app/index.js"), "export default 1;\n");
      await writeFile(
        path.join(dir, ".tagsmith.json"),
        JSON.stringify({
          tags: [
            {
              name: "app",
              pattern: "app-v{version}",
              model: { type: "semver" },
              initialVersion: "0.1.0",
              workspace: "packages/app",
            },
            { name: "docs", pattern: "docs-v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          ],
          default: "app",
        }),
      );
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "feat: add app"]);

      const ready = await capture(() => runPlan(dir, { json: true, all: true }));
      expectValid(ready.json, "plan --all");
      expect(ready.json.data.hasReleases).toBe(true);
      expect(ready.json.data.defaultLine).toBe("app");

      const blocked = await capture(() =>
        runPlan(dir, { json: true, all: true, requireChanges: true }),
      );
      expectValid(blocked.json, "plan --require-changes");
      const docs = blocked.json.data.lines.find((line: any) => line.line === "docs");
      expect(docs.blockers[0].code).toBe("workspace-required");
    });
  });
});
