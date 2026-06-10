#!/usr/bin/env node
import { Command } from "commander";
import { runInit } from "./init.js";
import { runList } from "./list.js";
import { runNext } from "./next.js";
import { runCreate } from "./create.js";
import { runGuide } from "./guide.js";
import { runCheck } from "./check.js";
import { printError } from "./ui.js";

const program = new Command();

program
  .name("tagsmith")
  .description(
    "Define git tag specs, view tags, and generate the next git tag safely.",
  )
  .version("0.1.0");

program.addHelpText(
  "beforeAll",
  "\n  Tagsmith — define a tag spec, then safely compute and create git tags.\n" +
    "  First time here? Run `tagsmith init`, or `tagsmith guide` for a walkthrough.\n",
);

program.addHelpText(
  "after",
  `
Examples:
  $ tagsmith init                          Define the tag spec (interactive)
  $ tagsmith guide                         Step-by-step walkthrough
  $ tagsmith list                          Inspect existing tags
  $ tagsmith check v1.2.3                  Validate a tag against the spec
  $ tagsmith next --level minor            Preview the next tag
  $ tagsmith create --level minor --push   Create and push the next tag
`,
);

program
  .command("init")
  .description("Create a .tagsmith.json tag spec for this repo")
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
  .action(async (opts) => {
    process.exitCode = await runList(process.cwd(), opts);
  });

program
  .command("next")
  .description("Compute the next tag without creating it")
  .option(
    "-l, --level <level>",
    "bump level: major | minor | patch | prerelease | auto",
    "patch",
  )
  .option("--json", "output JSON")
  .action(async (opts) => {
    process.exitCode = await runNext(process.cwd(), opts);
  });

program
  .command("check [tags...]")
  .description(
    "Validate tags against the spec; with no args, lint all repo tags",
  )
  .option("--json", "output JSON")
  .action(async (tags: string[], opts) => {
    process.exitCode = await runCheck(process.cwd(), tags, opts);
  });

const createCommand = program
  .command("create")
  .description("Create the next (or an explicit) git tag")
  .option(
    "-l, --level <level>",
    "bump level: major | minor | patch | prerelease | auto",
    "patch",
  )
  .option(
    "--set-version <version>",
    "create an explicit version instead of bumping",
  )
  .option("-m, --message <message>", "annotate the tag with a message")
  .option("--push", "push the tag after creating")
  .option("--dry-run", "preview without creating")
  .option("--allow-out-of-order", "permit a version not greater than latest")
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
`,
);

program.parseAsync(process.argv).catch((err) => {
  printError(err);
  process.exitCode = 1;
});
