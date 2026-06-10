import { color, info } from "./ui.js";

interface JsonAware {
  json?: boolean;
}

/** A dim "next step" line: an arrow, a label, and the literal command. */
function step(label: string, command: string): void {
  info(`  ${color.dim("→")} ${label}: ${color.cyan(command)}`);
}

/** Shown when a command needs a config but none exists yet. */
export function printFirstRunHint(opts: JsonAware = {}): void {
  if (opts.json) return;
  info("");
  info(color.bold("No tag spec yet."));
  step("Define one", "tagsmith init");
}

export function printNextStepsAfterInit(opts: JsonAware): void {
  if (opts.json) return;
  info("");
  info(color.bold("Next steps:"));
  step("Inspect existing tags", "tagsmith list");
  step("Preview the next tag", "tagsmith next");
}

export function printNextStepsAfterNext(
  opts: JsonAware & { level: string },
): void {
  if (opts.json) return;
  info("");
  info(color.bold("Next step:"));
  step("Create this tag", `tagsmith create -l ${opts.level}`);
}

export function printNextStepsAfterCreate(
  opts: JsonAware & { pushed: boolean; tag?: string },
): void {
  if (opts.json) return;
  info("");
  info(color.bold("Next step:"));
  if (opts.pushed) {
    step("Review your tags", "tagsmith list");
  } else if (opts.tag) {
    step("Publish it", `git push origin ${opts.tag}`);
  } else {
    step("Publish it", "git push --tags");
  }
}
