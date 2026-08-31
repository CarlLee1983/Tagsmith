import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const actionRunner = path.join(root, "scripts", "action.mjs");

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function parseOutputs(raw: string): Record<string, string> {
  const lines = raw.split("\n");
  const outputs: Record<string, string> = {};
  for (let index = 0; index < lines.length;) {
    const header = /^(?<name>[^<]+)<<(?<delimiter>.+)$/.exec(lines[index] ?? "");
    if (!header?.groups) {
      index += 1;
      continue;
    }
    const value: string[] = [];
    index += 1;
    while (index < lines.length && lines[index] !== header.groups.delimiter) {
      value.push(lines[index] ?? "");
      index += 1;
    }
    outputs[header.groups.name!] = value.join("\n");
    index += 1;
  }
  return outputs;
}

async function runAction(cwd: string, inputs: Record<string, string> = {}) {
  const runnerTemp = await mkdtemp(path.join(tmpdir(), "tagsmith-action-runner-"));
  const outputFile = path.join(runnerTemp, "outputs");
  await writeFile(outputFile, "", "utf8");
  const result = spawnSync(process.execPath, [actionRunner], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_ACTION_PATH: root,
      GITHUB_OUTPUT: outputFile,
      RUNNER_TEMP: runnerTemp,
      INPUT_FETCH_TAGS: "true",
      INPUT_PLAN_FROM_COMMITS: "false",
      INPUT_PLAN_REQUIRE_CHANGES: "false",
      INPUT_PLAN_TAG: "",
      INPUT_REMOTE: "origin",
      ...inputs,
    },
  });
  const outputs = parseOutputs(await readFile(outputFile, "utf8"));
  await rm(runnerTemp, { recursive: true, force: true });
  return { ...result, outputs };
}

async function createHistory(options: {
  config?: unknown;
  tags?: string[];
  commits?: string[];
} = {}) {
  const source = await mkdtemp(path.join(tmpdir(), "tagsmith-action-source-"));
  const remote = await mkdtemp(path.join(tmpdir(), "tagsmith-action-remote-"));
  git(source, ["init", "-q"]);
  git(source, ["config", "user.email", "test@example.com"]);
  git(source, ["config", "user.name", "Test"]);
  await writeFile(path.join(source, ".tagsmith.json"), JSON.stringify(options.config ?? {
    pattern: "v{version}",
    model: { type: "semver" },
    initialVersion: "1.0.0",
  }));
  git(source, ["add", ".tagsmith.json"]);
  git(source, ["commit", "-q", "-m", "chore: configure tags"]);
  for (const tag of options.tags ?? ["v1.0.0"]) git(source, ["tag", tag]);
  for (const [index, message] of (options.commits ?? [
    "feat: intermediate feature",
    "fix: latest fix",
  ]).entries()) {
    await writeFile(path.join(source, `change-${index}.txt`), `${message}\n`, "utf8");
    git(source, ["add", `change-${index}.txt`]);
    git(source, ["commit", "-q", "-m", message]);
  }
  git(source, ["clone", "--bare", "-q", source, remote]);
  return { source, remote };
}

async function cloneRepo(remote: string, depth?: number): Promise<string> {
  const clone = await mkdtemp(path.join(tmpdir(), "tagsmith-action-clone-"));
  await rm(clone, { recursive: true, force: true });
  git(root, [
    "clone",
    "-q",
    ...(depth === undefined ? [] : [`--depth=${depth}`]),
    `file://${remote}`,
    clone,
  ]);
  return clone;
}

describe("GitHub Action", () => {
  it("unshallows Conventional Commit history and exposes the minor candidate with evidence", async () => {
    const source = await mkdtemp(path.join(tmpdir(), "tagsmith-action-source-"));
    const remote = await mkdtemp(path.join(tmpdir(), "tagsmith-action-remote-"));
    const shallow = await mkdtemp(path.join(tmpdir(), "tagsmith-action-shallow-"));
    try {
      git(source, ["init", "-q"]);
      git(source, ["config", "user.email", "test@example.com"]);
      git(source, ["config", "user.name", "Test"]);
      await writeFile(path.join(source, ".tagsmith.json"), JSON.stringify({
        pattern: "v{version}",
        model: { type: "semver" },
        initialVersion: "1.0.0",
      }));
      git(source, ["add", ".tagsmith.json"]);
      git(source, ["commit", "-q", "-m", "chore: configure tags"]);
      git(source, ["tag", "v1.0.0"]);
      await writeFile(path.join(source, "feature.txt"), "feature\n", "utf8");
      git(source, ["add", "feature.txt"]);
      git(source, ["commit", "-q", "-m", "feat: intermediate feature"]);
      await writeFile(path.join(source, "feature.txt"), "feature fixed\n", "utf8");
      git(source, ["add", "feature.txt"]);
      git(source, ["commit", "-q", "-m", "fix: latest fix"]);
      git(source, ["clone", "--bare", "-q", source, remote]);
      await rm(shallow, { recursive: true, force: true });
      git(source, ["clone", "--depth=1", "-q", `file://${remote}`, shallow]);

      const result = await runAction(shallow, { INPUT_PLAN_FROM_COMMITS: "true" });
      const plan = JSON.parse(result.outputs.plan!);

      expect(result.status).toBe(0);
      expect(result.outputs["has-releases"]).toBe("true");
      expect(result.outputs["next-tag"]).toBe("v1.1.0");
      expect(plan.data.lines[0].recommendation.reasons.map((reason: { summary: string }) =>
        reason.summary)).toEqual([
        "fix: latest fix",
        "feat: intermediate feature",
      ]);
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(remote, { recursive: true, force: true });
      await rm(shallow, { recursive: true, force: true });
    }
  });

  it("plans from commits in a non-shallow repository", async () => {
    const { source, remote } = await createHistory();
    try {
      git(source, ["remote", "add", "origin", remote]);
      const result = await runAction(source, { INPUT_PLAN_FROM_COMMITS: "true" });
      expect(result.status).toBe(0);
      expect(result.outputs["next-tag"]).toBe("v1.1.0");
      expect(git(source, ["rev-parse", "--is-shallow-repository"]).trim()).toBe("false");
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(remote, { recursive: true, force: true });
    }
  });

  it("fetches complete history from a custom remote", async () => {
    const { source, remote } = await createHistory();
    const clone = await cloneRepo(remote, 1);
    try {
      git(clone, ["remote", "rename", "origin", "upstream"]);
      const result = await runAction(clone, {
        INPUT_PLAN_FROM_COMMITS: "true",
        INPUT_REMOTE: "upstream",
      });
      expect(result.status).toBe(0);
      expect(result.outputs["next-tag"]).toBe("v1.1.0");
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(remote, { recursive: true, force: true });
      await rm(clone, { recursive: true, force: true });
    }
  });

  it("does not fetch when fetch-tags is false and reports incomplete history", async () => {
    const { source, remote } = await createHistory();
    const clone = await cloneRepo(remote, 1);
    try {
      const result = await runAction(clone, {
        INPUT_FETCH_TAGS: "false",
        INPUT_PLAN_FROM_COMMITS: "true",
      });
      const plan = JSON.parse(result.outputs.plan!);
      expect(result.status).toBe(1);
      expect(git(clone, ["tag", "--list"]).trim()).toBe("");
      expect(plan.diagnostics).toContainEqual(expect.objectContaining({
        code: "incomplete-git-history",
        message: expect.stringContaining("fetch-depth: 0"),
      }));
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(remote, { recursive: true, force: true });
      await rm(clone, { recursive: true, force: true });
    }
  });

  it("runs from a nested working directory", async () => {
    const { source, remote } = await createHistory();
    const nested = path.join(source, "packages", "release");
    try {
      await mkdir(nested, { recursive: true });
      await writeFile(path.join(nested, ".tagsmith.json"), JSON.stringify({
        pattern: "v{version}",
        model: { type: "semver" },
        initialVersion: "1.0.0",
      }));
      await rm(path.join(source, ".tagsmith.json"));
      git(source, ["add", "-A"]);
      git(source, ["commit", "-q", "-m", "chore: move release config"]);

      const result = await runAction(nested, { INPUT_FETCH_TAGS: "false" });
      expect(result.status).toBe(0);
      expect(result.outputs["next-tag"]).toBe("v1.0.1");
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(remote, { recursive: true, force: true });
    }
  });

  it("selects an output candidate from multiple tag lines", async () => {
    const { source, remote } = await createHistory({
      config: {
        tags: [
          {
            name: "app",
            pattern: "v{version}",
            model: { type: "semver" },
            initialVersion: "1.0.0",
          },
          {
            name: "release",
            pattern: "release/{version}",
            model: { type: "build" },
            initialVersion: "1",
          },
        ],
        default: "app",
      },
      tags: ["v1.0.0", "release/1"],
      commits: ["fix: shared change"],
    });
    try {
      const result = await runAction(source, {
        INPUT_FETCH_TAGS: "false",
        INPUT_PLAN_TAG: "release",
      });
      const plan = JSON.parse(result.outputs.plan!);
      expect(result.status).toBe(0);
      expect(plan.data.lines).toHaveLength(2);
      expect(result.outputs["next-tag"]).toBe("release/2");
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(remote, { recursive: true, force: true });
    }
  });

  it("reports no release for non-release-worthy commits", async () => {
    const { source, remote } = await createHistory({ commits: ["docs: clarify usage"] });
    try {
      const result = await runAction(source, {
        INPUT_FETCH_TAGS: "false",
        INPUT_PLAN_FROM_COMMITS: "true",
      });
      const plan = JSON.parse(result.outputs.plan!);
      expect(result.status).toBe(0);
      expect(result.outputs["has-releases"]).toBe("false");
      expect(result.outputs["next-tag"]).toBe("");
      expect(plan.data.lines[0].status).toBe("skipped");
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(remote, { recursive: true, force: true });
    }
  });

  it("fails for invalid config", async () => {
    const { source, remote } = await createHistory({
      config: {
        pattern: "v{version}",
        model: { type: "semver" },
        initialVersion: "1.0.0",
        pussh: true,
      },
      tags: [],
      commits: [],
    });
    try {
      const result = await runAction(source, { INPUT_FETCH_TAGS: "false" });
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).diagnostics[0].message).toContain("pussh");
      expect(result.outputs).toEqual({});
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(remote, { recursive: true, force: true });
    }
  });

  it("rejects a malicious newline pattern before producing outputs", async () => {
    const { source, remote } = await createHistory({
      config: {
        pattern: "v{version}\nhas-releases=false",
        model: { type: "semver" },
        initialVersion: "1.0.0",
      },
      tags: [],
      commits: [],
    });
    try {
      const result = await runAction(source, { INPUT_FETCH_TAGS: "false" });
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).diagnostics[0].code).toBe("invalid-git-tag");
      expect(result.outputs).toEqual({});
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(remote, { recursive: true, force: true });
    }
  });

  it("fails closed when a successful plan process emits malformed JSON", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "tagsmith-action-malformed-"));
    const fakeAction = path.join(temp, "action");
    const output = path.join(temp, "outputs");
    try {
      await mkdir(path.join(fakeAction, "dist", "cli"), { recursive: true });
      await writeFile(
        path.join(fakeAction, "dist", "cli", "index.js"),
        'process.stdout.write(process.argv.includes("plan") ? "not-json" : "{}");\n',
      );
      await writeFile(output, "", "utf8");
      const result = spawnSync(process.execPath, [actionRunner], {
        cwd: temp,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_ACTION_PATH: fakeAction,
          GITHUB_OUTPUT: output,
          INPUT_FETCH_TAGS: "false",
          INPUT_PLAN_FROM_COMMITS: "false",
          INPUT_PLAN_REQUIRE_CHANGES: "false",
          INPUT_PLAN_TAG: "",
          INPUT_REMOTE: "origin",
        },
      });
      expect(result.status).toBe(1);
      expect(parseOutputs(await readFile(output, "utf8"))).toEqual({});
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("serializes multiline values without allowing output injection", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "tagsmith-action-output-"));
    const output = path.join(temp, "outputs");
    try {
      await writeFile(output, "", "utf8");
      const moduleUrl = pathToFileURL(path.join(root, "scripts", "action-output.mjs")).href;
      const result = spawnSync(process.execPath, [
        "--input-type=module",
        "--eval",
        `import { appendActionOutput } from ${JSON.stringify(moduleUrl)}; appendActionOutput(process.argv[1], "next-tag", "v1.0.0\\nhas-releases=false"); appendActionOutput(process.argv[1], "has-releases", "true");`,
        output,
      ], { encoding: "utf8" });
      const outputs = parseOutputs(await readFile(output, "utf8"));
      expect(result.status).toBe(0);
      expect(outputs["next-tag"]).toBe("v1.0.0\nhas-releases=false");
      expect(outputs["has-releases"]).toBe("true");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("builds the checked-out action, audits tags, and exposes a release plan", async () => {
    const action = await readFile(path.join(root, "action.yml"), "utf8");

    expect(action).toContain("using: composite");
    expect(action).toContain("npm ci --ignore-scripts");
    expect(action).toContain("npm run build");
    expect(action).toContain("remote:");
    expect(action).toContain('scripts/action.mjs');
    expect(action).toContain("has-releases");
    expect(action).toContain("next-tag");
  });

  it("pins every third-party Action to a full commit SHA", async () => {
    const workflowDir = path.join(root, ".github", "workflows");
    const files = [
      path.join(root, "action.yml"),
      ...(await readdir(workflowDir)).map((file) => path.join(workflowDir, file)),
    ];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(/^\s*- uses: ([^\s#]+)(?:\s+#.*)?$/gm)) {
        expect(match[1], `${path.basename(file)}: ${match[0].trim()}`)
          .toMatch(/^[^@]+@[0-9a-f]{40}$/);
      }
    }
  });
});
