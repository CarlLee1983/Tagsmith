# Command Guidance (Onboarding) Implementation Plan

**Goal:** Lower the first-use barrier for Tagsmith by adding first-run hints, post-command "next step" suggestions, richer `--help` examples, and an interactive `tagsmith guide` walkthrough.

**Architecture:** All guidance lives in the `cli/` layer; `core/` stays pure. A new `src/cli/guidance.ts` centralizes every suggestion string and prints to stdout, going silent under `--json`. Existing command runners call guidance helpers at their success tail. A new `src/cli/guide.ts` orchestrates an interactive walkthrough via an injectable IO interface so it stays testable.

**Tech Stack:** Node.js + TypeScript (ESM), commander, @clack/prompts, picocolors, vitest. User-facing strings are English to match the existing CLI.

---

## File Structure

- **Create** `src/cli/guidance.ts` — pure-ish output helpers for next-step hints + first-run hint. No core logic, no IO beyond stdout/stderr via `ui.ts`.
- **Create** `src/cli/guide.ts` — `runGuide(cwd, io)` interactive walkthrough; `GuideIO` interface + default clack-backed implementation.
- **Modify** `src/core/config.ts` — add `MissingConfigError extends ConfigError`, thrown only when the file is absent (keeps the existing `tagsmith init` text).
- **Modify** `src/cli/init.ts` — call `printNextStepsAfterInit` on success.
- **Modify** `src/cli/next.ts` — call `printNextStepsAfterNext` on success; show first-run hint when config missing.
- **Modify** `src/cli/list.ts` — show first-run hint when config missing.
- **Modify** `src/cli/create.ts` — call `printNextStepsAfterCreate` on success; show first-run hint when config missing.
- **Modify** `src/cli/index.ts` — `beforeAll` welcome banner, per-command `after` example blocks, register the `guide` command.
- **Test** `tests/guidance.test.ts` — unit tests for guidance helpers.
- **Test** `tests/guide.test.ts` — branch tests for `runGuide` with a fake `GuideIO`.
- **Test** `tests/commands.test.ts` — extend with next-step / `--json`-silence / first-run-hint assertions.
- **Test** `tests/cli.test.ts` — extend with `--help` example + welcome-banner assertions.

---

## Task 1: Guidance helper module

**Files:**
- Create: `src/cli/guidance.ts`
- Test: `tests/guidance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/guidance.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  printFirstRunHint,
  printNextStepsAfterInit,
  printNextStepsAfterNext,
  printNextStepsAfterCreate,
} from "../src/cli/guidance.js";

function captureOut(fn: () => void): string {
  let out = "";
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      out += chunk.toString();
      return true;
    });
  try {
    fn();
    return out;
  } finally {
    spy.mockRestore();
  }
}

describe("guidance", () => {
  it("first-run hint names the init command", () => {
    const out = captureOut(() => printFirstRunHint());
    expect(out).toMatch(/tagsmith init/);
  });

  it("after init suggests list and next", () => {
    const out = captureOut(() => printNextStepsAfterInit({}));
    expect(out).toMatch(/tagsmith list/);
    expect(out).toMatch(/tagsmith next/);
  });

  it("after next suggests create with the same level", () => {
    const out = captureOut(() =>
      printNextStepsAfterNext({ level: "minor" }),
    );
    expect(out).toMatch(/tagsmith create -l minor/);
  });

  it("after create without push suggests --push", () => {
    const out = captureOut(() =>
      printNextStepsAfterCreate({ pushed: false }),
    );
    expect(out).toMatch(/--push/);
  });

  it("after create with push suggests list", () => {
    const out = captureOut(() =>
      printNextStepsAfterCreate({ pushed: true }),
    );
    expect(out).toMatch(/tagsmith list/);
  });

  it("is silent in JSON mode", () => {
    expect(captureOut(() => printNextStepsAfterInit({ json: true }))).toBe("");
    expect(
      captureOut(() => printNextStepsAfterNext({ level: "patch", json: true })),
    ).toBe("");
    expect(
      captureOut(() => printNextStepsAfterCreate({ pushed: false, json: true })),
    ).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/guidance.test.ts`
Expected: FAIL — cannot resolve `../src/cli/guidance.js` / exports undefined.

- [ ] **Step 3: Write minimal implementation**

Create `src/cli/guidance.ts`:

```typescript
import { color, info } from "./ui.js";

interface JsonAware {
  json?: boolean;
}

/** A dim "next step" line: an arrow, a label, and the literal command. */
function step(label: string, command: string): void {
  info(`  ${color.dim("→")} ${label}: ${color.cyan(command)}`);
}

/** Shown when a command needs a config but none exists yet. */
export function printFirstRunHint(): void {
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
  opts: JsonAware & { pushed: boolean },
): void {
  if (opts.json) return;
  info("");
  info(color.bold("Next step:"));
  if (opts.pushed) {
    step("Review your tags", "tagsmith list");
  } else {
    step("Share it", "tagsmith create --push");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/guidance.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cli/guidance.ts tests/guidance.test.ts
git commit -m "feat: [cli] add guidance helpers for next-step hints"
```

---

## Task 2: Distinguish missing-config errors

**Files:**
- Modify: `src/core/config.ts:36` (the `ConfigError` declaration) and `src/core/config.ts:63-83` (`loadConfig`)
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/config.test.ts` (inside the top-level `describe`, or add a new one). First confirm the imports at the top of the file include `loadConfig`; if not, add it. Add:

```typescript
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, MissingConfigError, ConfigError } from "../src/core/config.js";

describe("loadConfig error types", () => {
  it("throws MissingConfigError when the file is absent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tagsmith-cfg-"));
    try {
      await expect(loadConfig(dir)).rejects.toBeInstanceOf(MissingConfigError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws plain ConfigError on invalid JSON (not MissingConfigError)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tagsmith-cfg-"));
    try {
      await writeFile(path.join(dir, ".tagsmith.json"), "{ not json", "utf8");
      const err = await loadConfig(dir).catch((e) => e);
      expect(err).toBeInstanceOf(ConfigError);
      expect(err).not.toBeInstanceOf(MissingConfigError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

> Note: if `tests/config.test.ts` already imports some of these symbols, merge rather than duplicate the import lines.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL — `MissingConfigError` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/core/config.ts`, replace the existing error declaration (line 36):

```typescript
export class ConfigError extends Error {}
```

with:

```typescript
export class ConfigError extends Error {}
/** Thrown by loadConfig when no config file exists (vs. a malformed one). */
export class MissingConfigError extends ConfigError {}
```

Then in `loadConfig`, change the missing-file branch (the `catch` around `readFile`) to throw the subclass — keep the exact `tagsmith init` wording so existing tests still match:

```typescript
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new MissingConfigError(
      `No ${CONFIG_FILENAME} found in ${cwd}. Run \`tagsmith init\` first.`,
    );
  }
```

(The invalid-JSON and `parseConfig` paths keep throwing plain `ConfigError`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/config.test.ts`
Expected: PASS, including the pre-existing config tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/config.ts tests/config.test.ts
git commit -m "feat: [core] add MissingConfigError to flag absent config"
```

---

## Task 3: Wire next-step hints + first-run hint into runners

**Files:**
- Modify: `src/cli/init.ts:39-40`
- Modify: `src/cli/next.ts` (success tail + catch)
- Modify: `src/cli/create.ts` (success tail + catch)
- Modify: `src/cli/list.ts` (catch)
- Test: `tests/commands.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/commands.test.ts`. Add the import near the other imports at the top:

```typescript
// (no new import needed; tests assert on captured output)
```

Inside `describe("init", ...)` add:

```typescript
    it("prints next-step hints after success", async () => {
      const r = await capture(() => runInit(dir, { yes: true }));
      expect(r.out).toMatch(/tagsmith list/);
      expect(r.out).toMatch(/tagsmith next/);
    });
```

Inside `describe("next", ...)` add:

```typescript
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

    it("shows the first-run hint when no config", async () => {
      const r = await capture(() => runNext(dir, {}));
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/tagsmith init/); // original error
      expect(r.out).toMatch(/tagsmith init/); // friendly hint
    });
```

Inside `describe("create", ...)` add:

```typescript
    it("suggests --push after a non-pushed create", async () => {
      await runInit(dir, { yes: true });
      const r = await capture(() => runCreate(dir, {}));
      expect(r.out).toMatch(/--push/);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/commands.test.ts`
Expected: FAIL — hints not printed yet; first-run hint not on stdout.

- [ ] **Step 3: Write minimal implementations**

In `src/cli/init.ts`, add the import and call the helper after the success line:

```typescript
import { printNextStepsAfterInit } from "./guidance.js";
```

Change the success tail (lines 39-40) from:

```typescript
  success(`Wrote ${CONFIG_FILENAME}`);
  return 0;
```

to:

```typescript
  success(`Wrote ${CONFIG_FILENAME}`);
  printNextStepsAfterInit({});
  return 0;
```

In `src/cli/next.ts`, update imports:

```typescript
import { MissingConfigError } from "../core/config.js";
import { printFirstRunHint, printNextStepsAfterNext } from "./guidance.js";
```

(Keep the existing `loadConfig` import; add `MissingConfigError` to that import or as a separate line.)

Replace the success `return 0;` lines (both the `plan.fresh` and else branch end up at line 53) by adding the hint just before the final `return 0;`:

```typescript
    if (plan.fresh) {
      info(`${color.cyan(plan.tag)} ${color.dim("(initial — no prior tag)")}`);
    } else {
      info(
        `${color.cyan(plan.tag)} ${color.dim(`(from ${plan.fromVersion})`)}`,
      );
    }
    printNextStepsAfterNext({ level, json: flags.json });
    return 0;
```

And update the catch block:

```typescript
  } catch (err) {
    printError(err);
    if (err instanceof MissingConfigError && !flags.json) printFirstRunHint();
    return 1;
  }
```

In `src/cli/create.ts`, update imports:

```typescript
import { MissingConfigError } from "../core/config.js";
import { printFirstRunHint, printNextStepsAfterCreate } from "./guidance.js";
```

Add the hint after a real (non-dry-run) create. Replace the tail (lines 61-68) with:

```typescript
    await createTag({ cwd, name: tagName, message: flags.message });
    success(`Created tag ${color.cyan(tagName)}`);

    const willPush = flags.push ?? config.push;
    if (willPush) {
      await pushTag({ cwd, name: tagName });
      success(`Pushed ${tagName}`);
    }
    printNextStepsAfterCreate({ pushed: willPush });
    return 0;
```

Update the catch block:

```typescript
  } catch (err) {
    printError(err);
    if (err instanceof MissingConfigError) printFirstRunHint();
    return 1;
  }
```

In `src/cli/list.ts`, update imports and catch:

```typescript
import { MissingConfigError } from "../core/config.js";
import { printFirstRunHint } from "./guidance.js";
```

```typescript
  } catch (err) {
    printError(err);
    if (err instanceof MissingConfigError && !flags.json) printFirstRunHint();
    return 1;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/commands.test.ts`
Expected: PASS, including the pre-existing command tests.

- [ ] **Step 5: Commit**

```bash
git add src/cli/init.ts src/cli/next.ts src/cli/create.ts src/cli/list.ts tests/commands.test.ts
git commit -m "feat: [cli] print next-step and first-run hints from runners"
```

---

## Task 4: Interactive `guide` command

**Files:**
- Create: `src/cli/guide.ts`
- Test: `tests/guide.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/guide.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runGuide, type GuideIO } from "../src/cli/guide.js";
import { configExists } from "../src/core/config.js";

function gitInit(dir: string): void {
  const g = (args: string[]) => execFileSync("git", args, { cwd: dir });
  g(["init", "-q"]);
  g(["config", "user.email", "t@example.com"]);
  g(["config", "user.name", "Test"]);
  g(["commit", "--allow-empty", "-q", "-m", "init"]);
}

/** A scripted GuideIO that answers confirms from a queue and records notes. */
function fakeIO(answers: boolean[]): GuideIO & { notes: string[] } {
  const queue = [...answers];
  const notes: string[] = [];
  return {
    notes,
    intro: () => {},
    outro: () => {},
    note: (msg: string) => {
      notes.push(msg);
    },
    cancel: (msg: string) => {
      notes.push(msg);
    },
    confirm: async () => (queue.length ? queue.shift()! : false),
    isCancel: () => false,
  };
}

describe("runGuide", () => {
  let dir: string;
  let outSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tagsmith-guide-"));
    gitInit(dir);
    outSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
  });

  afterEach(async () => {
    outSpy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it("runs init (via --yes path) when the user agrees, then previews", async () => {
    // confirm #1: run init now? -> yes
    const io = fakeIO([true]);
    const code = await runGuide(dir, io);
    expect(code).toBe(0);
    expect(await configExists(dir)).toBe(true);
    expect(io.notes.join("\n")).toMatch(/next|create/i);
  });

  it("skips init when the user declines and still finishes cleanly", async () => {
    // confirm #1: run init now? -> no
    const io = fakeIO([false]);
    const code = await runGuide(dir, io);
    expect(code).toBe(0);
    expect(await configExists(dir)).toBe(false);
    expect(io.notes.join("\n")).toMatch(/tagsmith init/);
  });

  it("never creates a real tag during the walkthrough", async () => {
    const io = fakeIO([true]);
    await runGuide(dir, io);
    const tags = execFileSync("git", ["tag", "-l"], { cwd: dir })
      .toString()
      .trim();
    expect(tags).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/guide.test.ts`
Expected: FAIL — cannot resolve `../src/cli/guide.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/cli/guide.ts`:

```typescript
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

  // Step 1 — init
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
      const code = await runInit(cwd, {});
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

  // Step 2 — list (read-only preview)
  io.note("`tagsmith list` shows existing tags, sorted and validated:");
  await runList(cwd, {});

  // Step 3 — next (read-only preview)
  io.note("`tagsmith next` previews the next tag without creating it:");
  await runNext(cwd, {});

  // Step 4 — create (explained only; we never create here)
  io.note(
    "When you're ready, `tagsmith create -l patch` creates that tag. " +
      "Add `--push` to publish it. (The guide won't create anything.)",
  );

  io.outro("You're set. Try `tagsmith next` then `tagsmith create`.");
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/guide.test.ts`
Expected: PASS (3 tests).

> Note: `runInit(cwd, {})` with no `--yes` would normally prompt via clack. In the test, the temp dir has no config and the IO confirm returns `true`, so `runInit` runs interactively against a non-TTY. To keep the test deterministic, pass `{ yes: true }` instead in the implementation IF the interactive path hangs under vitest. Prefer `{}` first; if `npm test` hangs on this file, change the `runInit(cwd, {})` call to `runInit(cwd, { yes: true })` and re-run. Document the final choice in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/cli/guide.ts tests/guide.test.ts
git commit -m "feat: [cli] add interactive tagsmith guide walkthrough"
```

---

## Task 5: Register `guide` + help banner and examples

**Files:**
- Modify: `src/cli/index.ts`
- Test: `tests/cli.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/cli.test.ts` (these run against the built `dist/`, so the build step below matters):

```typescript
  it("shows a welcome banner and first step in top-level help", () => {
    const r = run(dir, ["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/tagsmith init/);
    expect(r.stdout).toMatch(/Examples/);
  });

  it("includes an examples block in create --help", () => {
    const r = run(dir, ["create", "--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Examples/);
    expect(r.stdout).toMatch(/tagsmith create/);
  });

  it("registers the guide command", () => {
    const r = run(dir, ["--help"]);
    expect(r.stdout).toMatch(/guide/);
  });
```

- [ ] **Step 2: Build, then run tests to verify they fail**

Run: `npm run build && npm test -- tests/cli.test.ts`
Expected: FAIL — no `Examples` block, no `guide` command yet.

- [ ] **Step 3: Write minimal implementation**

In `src/cli/index.ts`, add the import:

```typescript
import { runGuide } from "./guide.js";
```

After `.version("0.1.0");` (line 16), add a top-level banner and examples:

```typescript
program.addHelpText(
  "beforeAll",
  "\n  Tagsmith — define a tag spec, then safely compute and create git tags.\n" +
    "  First time here? Run `tagsmith init`, or `tagsmith guide` for a walkthrough.\n",
);

program.addHelpText(
  "after",
  `
Examples:
  $ tagsmith init                       Define the tag spec (interactive)
  $ tagsmith guide                      Step-by-step walkthrough
  $ tagsmith list                       Inspect existing tags
  $ tagsmith next --level minor         Preview the next tag
  $ tagsmith create --level minor --push  Create and push the next tag
`,
);
```

Register the `guide` command (place it after the `init` command block so it reads first in help):

```typescript
program
  .command("guide")
  .description("Interactive walkthrough: init → list → next → create")
  .action(async () => {
    process.exitCode = await runGuide(process.cwd());
  });
```

Add a per-command examples block to `create` (after its options, before `.action`, or via `addHelpText`). The simplest is to append after defining the command. Locate the `create` command definition and chain `.addHelpText` onto it. Replace the `create` command block's trailing `.action(...)` so the command object is captured, then add help — or add this immediately after the `program.command("create")...action(...)` chain:

```typescript
program
  .commands.find((c) => c.name() === "create")
  ?.addHelpText(
    "after",
    `
Examples:
  $ tagsmith create                     Create the next patch tag
  $ tagsmith create -l minor -m "..."   Create an annotated minor tag
  $ tagsmith create --set-version 2.0.0 Create an explicit version
  $ tagsmith create --dry-run           Preview without creating
`,
  );
```

> Rationale: using `commands.find(...)` avoids restructuring the existing fluent `create` block. It runs at module load, before `parseAsync`, so the help text is attached in time.

- [ ] **Step 4: Build, then run tests to verify they pass**

Run: `npm run build && npm test -- tests/cli.test.ts`
Expected: PASS, including the pre-existing CLI lifecycle tests.

- [ ] **Step 5: Commit**

```bash
git add src/cli/index.ts tests/cli.test.ts
git commit -m "feat: [cli] register guide command and add help examples"
```

---

## Task 6: Full suite, coverage, and README

**Files:**
- Modify: `README.md` (mention `tagsmith guide` in 快速開始)
- Verify: whole test suite + coverage threshold (80%)

- [ ] **Step 1: Run the full suite + coverage**

Run: `npm run build && npm run coverage`
Expected: All tests PASS; coverage ≥ 80% (the project threshold). If `guidance.ts` or `guide.ts` drag coverage down, add targeted unit tests (e.g., the `pushed: true` branch of `printNextStepsAfterCreate`, the "config already exists" branch of `runGuide`) before proceeding.

- [ ] **Step 2: Add a guide mention to README**

In `README.md`, under `## 快速開始`, add after the `tagsmith init` line:

```markdown
# 不熟指令?走一次互動式導覽
tagsmith guide
```

- [ ] **Step 3: Verify README renders the snippet correctly**

Run: `git diff README.md`
Expected: the new two lines appear inside the 快速開始 code block.

- [ ] **Step 4: Final full run**

Run: `npm run build && npm test`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: [tagsmith] mention guide command in quick start"
```

---

## Self-Review Notes

- **Spec coverage:** first-run hint (Tasks 2,3), next-step suggestions (Tasks 1,3), help+examples (Task 5), `guide` command (Task 4), `--json` silence (Tasks 1,3), tests + 80% coverage (Task 6) — all mapped.
- **Output discipline:** every guidance helper takes `json` and returns early; `next`/`list` suppress the first-run hint under `--json`. `create`/`list`/`next` keep stdout/stderr separation.
- **No core regressions:** `core/plan.ts` and model `bump`/`parse` are untouched; only `config.ts` gains a subclass that preserves the existing `tagsmith init` message string.
- **Type consistency:** helper names (`printFirstRunHint`, `printNextStepsAfterInit/Next/Create`), `GuideIO`, `clackIO`, `runGuide(cwd, io)`, and `MissingConfigError` are used identically across tasks.
