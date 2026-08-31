import { spawnSync } from "node:child_process";
import path from "node:path";
import { assertValidGitTagName } from "../dist/core/git-tag.js";
import { appendActionOutput } from "./action-output.mjs";

const cwd = process.cwd();
const actionPath = process.env.GITHUB_ACTION_PATH;
const outputFile = process.env.GITHUB_OUTPUT;
if (!actionPath || !outputFile) {
  throw new Error("GITHUB_ACTION_PATH and GITHUB_OUTPUT are required.");
}

const fetchTags = process.env.INPUT_FETCH_TAGS === "true";
const fromCommits = process.env.INPUT_PLAN_FROM_COMMITS === "true";
const requireChanges = process.env.INPUT_PLAN_REQUIRE_CHANGES === "true";
const requestedLine = process.env.INPUT_PLAN_TAG ?? "";
const remote = process.env.INPUT_REMOTE || "origin";
const cli = path.join(actionPath, "dist", "cli", "index.js");

function run(command, args) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function requireSuccess(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (fetchTags) {
  const shallow = fromCommits &&
    run("git", ["rev-parse", "--is-shallow-repository"]).stdout.trim() === "true";
  requireSuccess(run("git", [
    "fetch",
    ...(shallow ? ["--unshallow"] : []),
    "--tags",
    "--",
    remote,
  ]));
}

requireSuccess(run(process.execPath, [cli, "audit", "--json"]));

const planArgs = [cli, "plan", "--all", "--json"];
if (fromCommits) planArgs.push("--from-commits");
if (requireChanges) planArgs.push("--require-changes");
const planned = run(process.execPath, planArgs);
let plan;
try {
  plan = JSON.parse(planned.stdout);
} catch {
  if (planned.stdout) process.stdout.write(planned.stdout);
  if (planned.stderr) process.stderr.write(planned.stderr);
  process.exit(1);
}

const selectedLine = requestedLine || plan.data?.defaultLine;
const line = plan.data?.lines?.find((item) => item.line === selectedLine);
const nextTag = line?.status === "ready" ? line.candidate.tag : "";
if (nextTag !== "") assertValidGitTagName(nextTag);

appendActionOutput(outputFile, "plan", JSON.stringify(plan));
appendActionOutput(outputFile, "has-releases", String(plan.data?.hasReleases === true));
appendActionOutput(outputFile, "next-tag", nextTag);

if (planned.stderr) process.stderr.write(planned.stderr);
process.exit(planned.status ?? 1);
