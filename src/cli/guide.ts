import * as p from "@clack/prompts";
import { configExists } from "../core/config.js";
import { runInit } from "./init.js";
import { runList } from "./list.js";
import { runNext } from "./next.js";

/** Injectable IO so the walkthrough is testable without a real TTY. */
export interface GuideIO {
  intro(message: string): void;
  outro(message: string): void;
  note(message: string): void;
  cancel(message: string): void;
  confirm(message: string): Promise<boolean | symbol>;
  isCancel(value: unknown): boolean;
}

/** Default GuideIO backed by @clack/prompts. */
export const clackIO: GuideIO = {
  intro: (m) => p.intro(m),
  outro: (m) => p.outro(m),
  note: (m) => p.note(m),
  cancel: (m) => p.cancel(m),
  confirm: (message) => p.confirm({ message }) as Promise<boolean | symbol>,
  isCancel: (v) => p.isCancel(v),
};

/**
 * Interactive walkthrough of init -> list -> next -> create.
 * Read-only: it can run `init` (with your confirmation) and preview
 * `list`/`next`, but it never creates a real tag.
 */
export async function runGuide(
  cwd: string,
  io: GuideIO = clackIO,
): Promise<number> {
  io.intro("tagsmith guide");
  io.note(
    "Tagsmith defines a tag spec for this repo, then safely computes and " +
      "creates the next git tag. Let's walk through it.",
  );

  // Step 1 - init
  if (await configExists(cwd)) {
    io.note("A .tagsmith.json already exists, so we'll skip init.");
  } else {
    const answer = await io.confirm(
      "No .tagsmith.json yet. Run `tagsmith init` now to create one?",
    );
    if (io.isCancel(answer)) {
      io.cancel("Guide cancelled. Run `tagsmith init` whenever you're ready.");
      return 0;
    }
    if (answer === true) {
      // User already confirmed via io.confirm above, so run init
      // non-interactively with defaults (no second round of prompts).
      const code = await runInit(cwd, { yes: true });
      if (code !== 0) {
        io.cancel("init did not complete. Re-run `tagsmith guide` to retry.");
        return 0;
      }
    } else {
      io.note(
        "No problem. Run `tagsmith init` later, then `tagsmith guide` again " +
          "to see the rest.",
      );
      io.outro("That's the first step — `tagsmith init`.");
      return 0;
    }
  }

  // Step 2 - list (read-only preview)
  io.note("`tagsmith list` shows existing tags, sorted and validated:");
  await runList(cwd, {});

  // Step 3 - next (read-only preview)
  io.note("`tagsmith next` previews the next tag without creating it:");
  await runNext(cwd, {});

  // Step 4 - create (explained only; we never create here)
  io.note(
    "When you're ready, `tagsmith create -l patch` creates that tag. " +
      "Add `--push` to publish it. (The guide won't create anything.)",
  );

  io.outro("You're set. Try `tagsmith next` then `tagsmith create`.");
  return 0;
}
