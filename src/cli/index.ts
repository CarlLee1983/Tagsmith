#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { runInit } from "./init.js";
import { runList } from "./list.js";
import { runNext } from "./next.js";
import { runCreate } from "./create.js";
import { runGuide } from "./guide.js";
import { runCheck } from "./check.js";
import { runAudit } from "./audit.js";
import { runPlan } from "./plan.js";
import { runMergeCheck } from "./merge-check.js";
import { runHooksInstall, runHooksUninstall } from "./hooks.js";
import { printError } from "./ui.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const program = new Command();

program
  .name("tagsmith")
  .description(
    "Define git tag specs, view tags, and generate the next git tag safely.",
  )
  .version(version);

program.addHelpText(
  "beforeAll",
  "\n  Tagsmith (@carllee1983/tagsmith) — define a tag spec, then safely compute and create git tags.\n" +
    "  No config yet? Try `tagsmith next` (zero-config semver), `tagsmith init`, or `tagsmith guide`.\n",
);

program.addHelpText(
  "after",
  `
Examples:
  $ tagsmith init                          Define the tag spec (interactive)
  $ tagsmith guide                         Step-by-step walkthrough
  $ tagsmith list                          Inspect existing tags
  $ tagsmith audit                         Audit complete tag history
  $ tagsmith plan --all                    Plan releases across every tag line
  $ tagsmith check v1.2.3                  Validate a tag against the spec
  $ tagsmith next --level minor            Preview the next tag
  $ tagsmith next --tag release            Compute next on a named tag line
  $ tagsmith create --level minor --push   Create and push the next tag
`,
);

program
  .command("init")
  .description("Create a .tagsmith.json tag spec for this repo (optional; zero-config works without it)")
  .option("--pattern <pattern>", "tag pattern, must contain {version}")
  .option("--model <type>", "version model: semver | calver | build")
  .option("--initial-version <version>", "initial version")
  .option("--push", "push tags by default on create")
  .option("--force", "overwrite an existing config")
  .option("-y, --yes", "non-interactive; use flags/defaults")
  .action(async (opts) => {
    process.exitCode = await runInit(process.cwd(), opts);
  });

program
  .command("guide")
  .description("Interactive walkthrough: init → list → next → create")
  .action(async () => {
    process.exitCode = await runGuide(process.cwd());
  });

program
  .command("list")
  .alias("ls")
  .description("List git tags, sorted and validated against the spec")
  .option("--json", "output JSON")
  .option("-t, --tag <name>", "list only the named tag line")
  .option("--all", "list every tag line plus unassigned tags")
  .action(async (opts) => {
    process.exitCode = await runList(process.cwd(), opts);
  });

program
  .command("next")
  .description("Compute the next tag without creating it")
  .option(
    "-l, --level <level>",
    "bump level: major | minor | patch | prerelease | auto",
  )
  .option("--json", "output JSON")
  .option("--fetch", "fetch tags from the remote before calculating")
  .option("--remote <name>", "remote used by --fetch (default: origin)")
  .option("--from-commits", "derive a semver bump from Conventional Commits")
  .option("--require-changes", "require changes in the selected line's workspace")
  .option(
    "-t, --tag <name>",
    "operate on the named tag line (default: the config's default line)",
  )
  .action(async (opts) => {
    process.exitCode = await runNext(process.cwd(), opts);
  });

program
  .command("check [tags...]")
  .description(
    "Validate tags against the spec; with no args, lint all repo tags",
  )
  .option("--json", "output JSON")
  .option("--strict", "also reject candidate versions already present in the repository")
  .option("-t, --tag <name>", "validate only against the named tag line")
  .action(async (tags: string[], opts) => {
    process.exitCode = await runCheck(process.cwd(), tags, opts);
  });

program
  .command("audit")
  .description("Audit tag history, assignment safety, and release readiness")
  .option("--json", "output versioned JSON")
  .option("--fetch", "fetch tags from the remote before auditing")
  .option("--remote <name>", "remote used by --fetch (default: origin)")
  .option("--strict-overlap", "treat overlapping tag-line patterns as errors")
  .action(async (opts) => {
    process.exitCode = await runAudit(process.cwd(), opts);
  });

program
  .command("plan")
  .description("Plan read-only releases across every configured tag line")
  .requiredOption("--all", "plan every configured tag line")
  .option("--json", "output versioned JSON")
  .option("--fetch", "fetch tags from the remote before planning")
  .option("--remote <name>", "remote used by --fetch (default: origin)")
  .option("--from-commits", "derive SemVer bumps from Conventional Commits")
  .option("--require-changes", "require every planned line to declare a workspace")
  .action(async (opts) => {
    process.exitCode = await runPlan(process.cwd(), opts);
  });

const createCommand = program
  .command("create")
  .description("Create the next (or an explicit) git tag")
  .option(
    "-l, --level <level>",
    "bump level: major | minor | patch | prerelease | auto",
  )
  .option(
    "--set-version <version>",
    "create an explicit version instead of bumping",
  )
  .option("-m, --message <message>", "annotate the tag with a message")
  .option("--push", "push the tag after creating")
  .option("--fetch", "fetch tags from the remote before calculating")
  .option("--remote <name>", "remote used by --fetch and --push (default: origin)")
  .option("--from-commits", "derive a semver bump from Conventional Commits")
  .option("--require-changes", "require changes in the selected line's workspace")
  .option("--enforce-policy", "enforce the optional releasePolicy before creating")
  .option("--target <ref>", "tag target ref (default: HEAD)")
  .option("--sign", "create a signed annotated tag (requires --message)")
  .option("--dry-run", "preview without creating")
  .option("--allow-out-of-order", "permit a version not greater than latest")
  .option(
    "-t, --tag <name>",
    "operate on the named tag line (default: the config's default line)",
  )
  .action(async (opts) => {
    process.exitCode = await runCreate(process.cwd(), opts);
  });

createCommand.addHelpText(
  "after",
  `
Examples:
  $ tagsmith create                        Create the next patch tag
  $ tagsmith create -l minor -m "..."      Create an annotated minor tag
  $ tagsmith create --set-version 2.0.0    Create an explicit version
  $ tagsmith create --dry-run              Preview without creating
  $ tagsmith create --enforce-policy -m "Release 1.2.0"
                                            Enforce releasePolicy before creating
  $ tagsmith create --tag release          Create the next tag on a named tag line
`,
);

program
  .command("merge-check")
  .description("Enforce the mergePolicy for a protected branch (used by git hooks)")
  .option(
    "--mode <mode>",
    "hook context: merge-head | post-merge",
    "merge-head",
  )
  .action(async (opts: { mode?: "merge-head" | "post-merge" }) => {
    process.exitCode = await runMergeCheck(process.cwd(), { mode: opts.mode });
  });

const hooks = program
  .command("hooks")
  .description("Manage tagsmith git hooks (merge policy enforcement)");

hooks
  .command("install")
  .description("Install merge-policy git hooks into this repo")
  .option("--force", "overwrite existing non-tagsmith hooks")
  .action(async (opts: { force?: boolean }) => {
    process.exitCode = await runHooksInstall(process.cwd(), { force: opts.force });
  });

hooks
  .command("uninstall")
  .description("Remove tagsmith-managed git hooks")
  .action(async () => {
    process.exitCode = await runHooksUninstall(process.cwd());
  });

program.parseAsync(process.argv).catch((err) => {
  printError(err);
  process.exitCode = 1;
});
