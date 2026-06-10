#!/usr/bin/env node
import { Command } from "commander";
import { runInit } from "./init.js";
import { runList } from "./list.js";
import { runNext } from "./next.js";
import { runCreate } from "./create.js";
import { printError } from "./ui.js";

const program = new Command();

program
  .name("tagsmith")
  .description(
    "Define git tag specs, view tags, and generate the next git tag safely.",
  )
  .version("0.1.0");

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

program.parseAsync(process.argv).catch((err) => {
  printError(err);
  process.exitCode = 1;
});
