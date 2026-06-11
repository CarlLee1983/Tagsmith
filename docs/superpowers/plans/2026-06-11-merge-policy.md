# Merge Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable "protected-branch merge policy" feature to tagsmith so any repo can install git hooks that block disallowed merges, replacing per-repo shell scripts.

**Architecture:** A new decoupled module `src/core/merge-policy/` holds pure logic (zod schema, glob matching, decision) plus git-source resolution. Two new CLI commands — `merge-check` (called by hooks) and `hooks install/uninstall` (writes the hooks) — wire it into the existing commander program. The `mergePolicy` block lives in the existing `.tagsmith.json` but is loaded independently of the tag-line config, so it is fully optional and backward compatible.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), commander, zod, vitest. Node ≥18. git invoked via `execFile` wrappers in `src/git/git.ts`.

---

## Spec reference

`docs/superpowers/specs/2026-06-11-merge-policy-design.md`

## File Structure

```
src/core/merge-policy/
  schema.ts     # MergePolicy types + zod schema + parseMergePolicy + loadMergePolicy
  match.ts      # matchSource(pattern, branch) — glob → RegExp
  validate.ts   # validateMerge(policy, current, source) → Decision (pure)
  resolve.ts    # resolveFromMergeHead / resolveFfSource (git side effects)
src/cli/
  merge-check.ts  # runMergeCheck(cwd, flags) → exit code
  hooks.ts        # runHooksInstall / runHooksUninstall → exit code
src/git/git.ts    # MODIFY: add branch/merge git helpers
src/cli/index.ts  # MODIFY: register `merge-check` and `hooks` commands
schema.json       # MODIFY: add mergePolicy property
package.json      # MODIFY: version 0.2.1 → 0.3.0
README.md, CHANGELOG.md  # MODIFY: document the feature
```

Tests:
```
tests/merge-policy.match.test.ts      # glob matching (unit)
tests/merge-policy.validate.test.ts   # decision logic (unit)
tests/merge-policy.schema.test.ts     # config parsing (unit)
tests/merge-policy.integration.test.ts# resolve + merge-check + hooks install in a real temp repo
```

---

### Task 1: Merge-policy types + zod schema + loader

**Files:**
- Create: `src/core/merge-policy/schema.ts`
- Test: `tests/merge-policy.schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/merge-policy.schema.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseMergePolicy,
  loadMergePolicy,
  MergePolicyError,
} from "../src/core/merge-policy/schema.js";

describe("parseMergePolicy", () => {
  it("returns null when the mergePolicy key is absent", () => {
    expect(parseMergePolicy({ pattern: "v{version}" })).toBeNull();
  });

  it("parses allow / deny rules and defaults onUnknownSource to block", () => {
    const policy = parseMergePolicy({
      mergePolicy: {
        protectedBranches: {
          develop: { allow: ["main"] },
          main: { deny: ["develop", "feature/*"] },
        },
      },
    });
    expect(policy).not.toBeNull();
    expect(policy!.onUnknownSource).toBe("block");
    expect(policy!.protectedBranches.develop).toEqual({ allow: ["main"] });
    expect(policy!.protectedBranches.main).toEqual({
      deny: ["develop", "feature/*"],
    });
  });

  it("rejects a branch rule that sets both allow and deny", () => {
    expect(() =>
      parseMergePolicy({
        mergePolicy: {
          protectedBranches: { develop: { allow: ["main"], deny: ["x"] } },
        },
      }),
    ).toThrow(MergePolicyError);
  });

  it("rejects a branch rule that sets neither allow nor deny", () => {
    expect(() =>
      parseMergePolicy({
        mergePolicy: { protectedBranches: { develop: {} } },
      }),
    ).toThrow(MergePolicyError);
  });

  it("honours an explicit onUnknownSource: allow", () => {
    const policy = parseMergePolicy({
      mergePolicy: {
        protectedBranches: { main: { deny: ["develop"] } },
        onUnknownSource: "allow",
      },
    });
    expect(policy!.onUnknownSource).toBe("allow");
  });
});

describe("loadMergePolicy", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tagsmith-mp-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null when no .tagsmith.json exists", async () => {
    expect(await loadMergePolicy(dir)).toBeNull();
  });

  it("returns null when the file has no mergePolicy block", async () => {
    await writeFile(
      path.join(dir, ".tagsmith.json"),
      JSON.stringify({ pattern: "v{version}" }),
    );
    expect(await loadMergePolicy(dir)).toBeNull();
  });

  it("loads the mergePolicy block from disk", async () => {
    await writeFile(
      path.join(dir, ".tagsmith.json"),
      JSON.stringify({
        pattern: "v{version}",
        mergePolicy: { protectedBranches: { develop: { allow: ["main"] } } },
      }),
    );
    const policy = await loadMergePolicy(dir);
    expect(policy!.protectedBranches.develop).toEqual({ allow: ["main"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/merge-policy.schema.test.ts`
Expected: FAIL — cannot resolve `../src/core/merge-policy/schema.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/merge-policy/schema.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export class MergePolicyError extends Error {}

export interface BranchRule {
  allow?: string[];
  deny?: string[];
}

export interface MergePolicy {
  protectedBranches: Record<string, BranchRule>;
  onUnknownSource: "block" | "allow";
}

const branchRuleSchema = z
  .object({
    allow: z.array(z.string().min(1)).optional(),
    deny: z.array(z.string().min(1)).optional(),
  })
  .refine((r) => (r.allow === undefined) !== (r.deny === undefined), {
    message: "set exactly one of allow / deny",
  });

const mergePolicySchema = z.object({
  protectedBranches: z.record(z.string().min(1), branchRuleSchema),
  onUnknownSource: z.enum(["block", "allow"]).default("block"),
});

/** Extract & validate the optional `mergePolicy` key from a raw config object. */
export function parseMergePolicy(raw: unknown): MergePolicy | null {
  if (typeof raw !== "object" || raw === null) return null;
  const block = (raw as Record<string, unknown>)["mergePolicy"];
  if (block === undefined) return null;
  const result = mergePolicySchema.safeParse(block);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new MergePolicyError(`Invalid mergePolicy:\n${issues}`);
  }
  return result.data;
}

/** Read `.tagsmith.json` from cwd and return its mergePolicy, or null. */
export async function loadMergePolicy(cwd: string): Promise<MergePolicy | null> {
  let text: string;
  try {
    text = await readFile(path.join(cwd, ".tagsmith.json"), "utf8");
  } catch {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new MergePolicyError(
      `.tagsmith.json is not valid JSON: ${(err as Error).message}`,
    );
  }
  return parseMergePolicy(json);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/merge-policy.schema.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/core/merge-policy/schema.ts tests/merge-policy.schema.test.ts
git commit -m "feat: [merge-policy] config schema + loader"
```

---

### Task 2: Glob source matching

**Files:**
- Create: `src/core/merge-policy/match.ts`
- Test: `tests/merge-policy.match.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/merge-policy.match.test.ts
import { describe, it, expect } from "vitest";
import { matchSource } from "../src/core/merge-policy/match.js";

describe("matchSource", () => {
  it("matches an exact branch name", () => {
    expect(matchSource("main", "main")).toBe(true);
    expect(matchSource("main", "develop")).toBe(false);
  });

  it("matches a trailing wildcard across path segments", () => {
    expect(matchSource("feature/*", "feature/login")).toBe(true);
    expect(matchSource("feature/*", "feature/a/b")).toBe(true);
    expect(matchSource("feature/*", "hotfix/x")).toBe(false);
  });

  it("treats ? as a single character", () => {
    expect(matchSource("rc?", "rc1")).toBe(true);
    expect(matchSource("rc?", "rc12")).toBe(false);
  });

  it("escapes regex-special characters in the pattern", () => {
    expect(matchSource("release.1", "release.1")).toBe(true);
    expect(matchSource("release.1", "releaseX1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/merge-policy.match.test.ts`
Expected: FAIL — cannot resolve `../src/core/merge-policy/match.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/merge-policy/match.ts

/** Convert a branch glob (`*`, `?`) into an anchored RegExp. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}

/** True when `branch` matches the glob `pattern`. */
export function matchSource(pattern: string, branch: string): boolean {
  return globToRegExp(pattern).test(branch);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/merge-policy.match.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/merge-policy/match.ts tests/merge-policy.match.test.ts
git commit -m "feat: [merge-policy] glob source matching"
```

---

### Task 3: Policy decision (validateMerge)

**Files:**
- Create: `src/core/merge-policy/validate.ts`
- Test: `tests/merge-policy.validate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/merge-policy.validate.test.ts
import { describe, it, expect } from "vitest";
import { validateMerge } from "../src/core/merge-policy/validate.js";
import type { MergePolicy } from "../src/core/merge-policy/schema.js";

const policy: MergePolicy = {
  protectedBranches: {
    develop: { allow: ["main"] },
    main: { deny: ["develop", "feature/*"] },
  },
  onUnknownSource: "block",
};

describe("validateMerge", () => {
  it("allows merges into a non-protected branch", () => {
    expect(validateMerge(policy, "feature/x", "develop").ok).toBe(true);
  });

  it("allow-list: permits a listed source", () => {
    expect(validateMerge(policy, "develop", "main").ok).toBe(true);
  });

  it("allow-list: blocks an unlisted source", () => {
    const d = validateMerge(policy, "develop", "feature/x");
    expect(d.ok).toBe(false);
  });

  it("deny-list: blocks a listed source (incl. glob)", () => {
    expect(validateMerge(policy, "main", "develop").ok).toBe(false);
    expect(validateMerge(policy, "main", "feature/login").ok).toBe(false);
  });

  it("deny-list: permits an unlisted source", () => {
    expect(validateMerge(policy, "main", "hotfix/x").ok).toBe(true);
  });

  it("unknown source blocks when onUnknownSource = block", () => {
    expect(validateMerge(policy, "develop", null).ok).toBe(false);
  });

  it("unknown source passes when onUnknownSource = allow", () => {
    const p: MergePolicy = { ...policy, onUnknownSource: "allow" };
    expect(validateMerge(p, "develop", null).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/merge-policy.validate.test.ts`
Expected: FAIL — cannot resolve `../src/core/merge-policy/validate.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/merge-policy/validate.ts
import type { MergePolicy } from "./schema.js";
import { matchSource } from "./match.js";

export type Decision = { ok: true } | { ok: false; reason: string };

/**
 * Decide whether merging `source` into `current` is permitted.
 * `source === null` means the source branch could not be resolved.
 */
export function validateMerge(
  policy: MergePolicy,
  current: string,
  source: string | null,
): Decision {
  const rule = policy.protectedBranches[current];
  if (!rule) return { ok: true };

  if (source === null) {
    return policy.onUnknownSource === "allow"
      ? { ok: true }
      : { ok: false, reason: "could not resolve merge source" };
  }

  if (rule.allow) {
    const ok = rule.allow.some((p) => matchSource(p, source));
    return ok
      ? { ok: true }
      : { ok: false, reason: `${current} may only merge: ${rule.allow.join(", ")}` };
  }

  const denied = rule.deny!.some((p) => matchSource(p, source));
  return denied
    ? { ok: false, reason: `${current} must not merge ${source}` }
    : { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/merge-policy.validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/merge-policy/validate.ts tests/merge-policy.validate.test.ts
git commit -m "feat: [merge-policy] validateMerge decision logic"
```

---

### Task 4: Extend git.ts with branch/merge helpers

**Files:**
- Modify: `src/git/git.ts` (append new exported functions after `pushTag`)
- Test: covered by Task 6 integration test (these are thin git wrappers; integration exercises them against a real repo)

- [ ] **Step 1: Add the helpers**

Append to `src/git/git.ts`. Note the private `git()` helper throws `GitError` on non-zero exit; for commands where a non-zero exit is a meaningful "no" (verify, is-ancestor) we call `execFileAsync` semantics via a local `tryGit`.

```typescript
// --- merge-policy helpers (append to src/git/git.ts) ---

import { execFile } from "node:child_process"; // already imported at top — do NOT duplicate
// (The import above is illustrative; reuse the existing execFileAsync defined at the top of the file.)

/** Run git, returning { code, stdout } without throwing on non-zero exit. */
async function tryGit(
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { code?: number; stdout?: string };
    return { code: typeof e.code === "number" ? e.code : 1, stdout: e.stdout ?? "" };
  }
}

/** Current branch name, or "" when in detached HEAD. */
export async function currentBranch(opts: GitOptions): Promise<string> {
  const { stdout } = await tryGit(["branch", "--show-current"], opts.cwd);
  return stdout.trim();
}

/** Resolve a ref to a full SHA, or null when it does not exist. */
export async function revParseVerify(
  opts: GitOptions,
  ref: string,
): Promise<string | null> {
  const { code, stdout } = await tryGit(["rev-parse", "-q", "--verify", ref], opts.cwd);
  return code === 0 ? stdout.trim() : null;
}

/** Resolve a ref to a full SHA (throws via GitError when invalid). */
export async function revParse(opts: GitOptions, ref: string): Promise<string> {
  return (await git(["rev-parse", ref], opts.cwd)).trim();
}

/** Read the MERGE_MSG file contents, or null when it is absent. */
export async function mergeMsg(opts: GitOptions): Promise<string | null> {
  const { code, stdout } = await tryGit(
    ["rev-parse", "--git-path", "MERGE_MSG"],
    opts.cwd,
  );
  if (code !== 0) return null;
  const file = path.join(opts.cwd, stdout.trim());
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** Branch short-names (local + remote) that point at `ref`. */
export async function branchesPointingAt(
  opts: GitOptions,
  ref: string,
): Promise<string[]> {
  const { stdout } = await tryGit(
    ["branch", "-a", "--points-at", ref, "--format=%(refname:short)"],
    opts.cwd,
  );
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** `git name-rev` short name for `ref`, or null when undefined. */
export async function nameRev(opts: GitOptions, ref: string): Promise<string | null> {
  const { code, stdout } = await tryGit(
    ["name-rev", "--name-only", "--exclude=tags/*", ref],
    opts.cwd,
  );
  const name = stdout.trim();
  if (code !== 0 || name === "" || name === "undefined") return null;
  return name;
}

/** True when `ancestor` is an ancestor of `descendant`. */
export async function isAncestor(
  opts: GitOptions,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  const { code } = await tryGit(
    ["merge-base", "--is-ancestor", ancestor, descendant],
    opts.cwd,
  );
  return code === 0;
}

/** Number of parents of `ref` (2 = normal merge, >2 = octopus). */
export async function parentCount(opts: GitOptions, ref: string): Promise<number> {
  const { stdout } = await tryGit(["rev-list", "--parents", "-1", ref], opts.cwd);
  const words = stdout.trim().split(/\s+/).filter((w) => w.length > 0);
  return Math.max(0, words.length - 1);
}

/** Hard-reset the working tree to `ref`. */
export async function resetHard(opts: GitOptions, ref: string): Promise<void> {
  await git(["reset", "--hard", ref], opts.cwd);
}
```

Also add these imports at the TOP of `src/git/git.ts` (next to the existing imports):

```typescript
import { readFile } from "node:fs/promises";
import path from "node:path";
```

- [ ] **Step 2: Type-check to verify the file compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). Fix any duplicate-import error by ensuring `execFileAsync` and `git` from the existing top of the file are reused (do not redeclare them).

- [ ] **Step 3: Commit**

```bash
git add src/git/git.ts
git commit -m "feat: [git] add branch/merge helpers for merge policy"
```

---

### Task 5: Resolve merge source (resolve.ts)

**Files:**
- Create: `src/core/merge-policy/resolve.ts`
- Test: covered by Task 6 integration test (resolution needs a real repo with MERGE_HEAD/ORIG_HEAD state)

- [ ] **Step 1: Write the implementation**

```typescript
// src/core/merge-policy/resolve.ts
import type { GitOptions } from "../../git/git.js";
import {
  branchesPointingAt,
  mergeMsg,
  nameRev,
  revParse,
  revParseVerify,
} from "../../git/git.js";

/** Strip remote prefixes and ^/~ suffixes from a ref name. */
export function normalizeBranch(name: string): string {
  return name
    .replace(/^remotes\/origin\//, "")
    .replace(/^origin\//, "")
    .replace(/[\^~].*$/, "");
}

function parseMergeMsg(msg: string): string | null {
  for (const line of msg.split("\n")) {
    let m = line.match(/^Merge (?:remote-tracking )?branch '([^']+)'/);
    if (m) return normalizeBranch(m[1]!);
  }
  return null;
}

/** Resolve the source branch of an in-progress merge (MERGE_HEAD present). */
export async function resolveFromMergeHead(
  opts: GitOptions,
  current: string,
): Promise<string | null> {
  const msg = await mergeMsg(opts);
  if (msg) {
    const parsed = parseMergeMsg(msg);
    if (parsed) return parsed;
  }

  const tip = await revParseVerify(opts, "MERGE_HEAD");
  if (tip) {
    const named = (await branchesPointingAt(opts, tip))
      .map(normalizeBranch)
      .filter((n) => n !== current);
    if (named.length > 0) return named.sort()[0]!;

    const nr = await nameRev(opts, tip);
    if (nr) return normalizeBranch(nr);
  }

  return null;
}

/** Resolve the source branch of a fast-forward merge (post-merge). */
export async function resolveFfSource(
  opts: GitOptions,
  current: string,
): Promise<string | null> {
  const newHead = await revParse(opts, "HEAD");
  const candidates = (await branchesPointingAt(opts, newHead))
    .map(normalizeBranch)
    .filter((n) => n !== current);
  // Prefer well-known integration branches, else first alphabetical.
  for (const preferred of ["main", "develop", "testing"]) {
    if (candidates.includes(preferred)) return preferred;
  }
  return candidates.length > 0 ? candidates.sort()[0]! : null;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (Behaviour is verified in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add src/core/merge-policy/resolve.ts
git commit -m "feat: [merge-policy] resolve merge source from git state"
```

---

### Task 6: merge-check command + integration test

**Files:**
- Create: `src/cli/merge-check.ts`
- Modify: `src/cli/index.ts` (register the command)
- Test: `tests/merge-policy.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/merge-policy.integration.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runMergeCheck } from "../src/cli/merge-check.js";

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir }).toString();
}

function initRepo(dir: string): void {
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["commit", "--allow-empty", "-q", "-m", "init"]);
}

async function writePolicy(dir: string): Promise<void> {
  await writeFile(
    path.join(dir, ".tagsmith.json"),
    JSON.stringify({
      pattern: "v{version}",
      mergePolicy: {
        protectedBranches: {
          develop: { allow: ["main"] },
          main: { deny: ["develop"] },
        },
      },
    }),
  );
}

async function silence(fn: () => Promise<number>): Promise<number> {
  const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  try {
    return await fn();
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}

describe("runMergeCheck", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tagsmith-mc-"));
    initRepo(dir);
    await writePolicy(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns 0 when there is no config", async () => {
    await rm(path.join(dir, ".tagsmith.json"));
    const code = await silence(() =>
      runMergeCheck(dir, { mode: "merge-head" }),
    );
    expect(code).toBe(0);
  });

  it("returns 0 on a non-protected branch", async () => {
    git(dir, ["checkout", "-q", "-b", "feature/x"]);
    const code = await silence(() =>
      runMergeCheck(dir, { mode: "merge-head" }),
    );
    expect(code).toBe(0);
  });

  it("blocks a disallowed fast-forward merge and rolls back", async () => {
    // develop only allows main. Create develop, then fast-forward it to a
    // commit that lives on feature/x → disallowed.
    git(dir, ["checkout", "-q", "-b", "feature/x"]);
    git(dir, ["commit", "--allow-empty", "-q", "-m", "work"]);
    const featureTip = git(dir, ["rev-parse", "HEAD"]).trim();
    git(dir, ["checkout", "-q", "main"]);
    git(dir, ["checkout", "-q", "-b", "develop"]);
    const before = git(dir, ["rev-parse", "HEAD"]).trim();
    // simulate a fast-forward merge: move develop to featureTip, set ORIG_HEAD
    git(dir, ["update-ref", "ORIG_HEAD", before]);
    git(dir, ["merge", "-q", "--ff-only", featureTip]);
    const code = await silence(() =>
      runMergeCheck(dir, { mode: "post-merge" }),
    );
    expect(code).toBe(1);
    // rolled back to pre-merge HEAD
    expect(git(dir, ["rev-parse", "HEAD"]).trim()).toBe(before);
  });

  it("allows a fast-forward merge from an allowed source", async () => {
    // develop allows main. Advance main, then ff develop to main.
    git(dir, ["checkout", "-q", "-b", "develop"]);
    git(dir, ["checkout", "-q", "main"]);
    git(dir, ["commit", "--allow-empty", "-q", "-m", "main work"]);
    const mainTip = git(dir, ["rev-parse", "HEAD"]).trim();
    git(dir, ["checkout", "-q", "develop"]);
    const before = git(dir, ["rev-parse", "HEAD"]).trim();
    git(dir, ["update-ref", "ORIG_HEAD", before]);
    git(dir, ["merge", "-q", "--ff-only", mainTip]);
    const code = await silence(() =>
      runMergeCheck(dir, { mode: "post-merge" }),
    );
    expect(code).toBe(0);
    expect(git(dir, ["rev-parse", "HEAD"]).trim()).toBe(mainTip);
  });

  it("honours TAGSMITH_SKIP=1", async () => {
    git(dir, ["checkout", "-q", "-b", "develop"]);
    const prev = process.env.TAGSMITH_SKIP;
    process.env.TAGSMITH_SKIP = "1";
    try {
      const code = await silence(() =>
        runMergeCheck(dir, { mode: "post-merge" }),
      );
      expect(code).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.TAGSMITH_SKIP;
      else process.env.TAGSMITH_SKIP = prev;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/merge-policy.integration.test.ts`
Expected: FAIL — cannot resolve `../src/cli/merge-check.js`.

- [ ] **Step 3: Write the command**

```typescript
// src/cli/merge-check.ts
import { loadMergePolicy } from "../core/merge-policy/schema.js";
import { validateMerge } from "../core/merge-policy/validate.js";
import {
  resolveFfSource,
  resolveFromMergeHead,
} from "../core/merge-policy/resolve.js";
import {
  currentBranch,
  isAncestor,
  parentCount,
  resetHard,
  revParse,
  revParseVerify,
} from "../git/git.js";
import { color, info, printError } from "./ui.js";

export interface MergeCheckFlags {
  mode?: "merge-head" | "post-merge";
}

function skipRequested(): boolean {
  return process.env.HUSKY === "0" || process.env.TAGSMITH_SKIP === "1";
}

export async function runMergeCheck(
  cwd: string,
  flags: MergeCheckFlags,
): Promise<number> {
  if (skipRequested()) return 0;
  try {
    const policy = await loadMergePolicy(cwd);
    if (!policy) return 0;

    const mode = flags.mode ?? "merge-head";
    const current = await currentBranch({ cwd });

    if (current === "") {
      printError(
        "merge-policy: detached HEAD — refusing merge on a protected branch.",
      );
      return 1;
    }
    if (!(current in policy.protectedBranches)) return 0;

    let source: string | null;
    let rollback: string | null = null;

    if (mode === "post-merge") {
      rollback = await revParseVerify({ cwd }, "ORIG_HEAD");
      if ((await parentCount({ cwd }, "HEAD")) > 2) return 0; // octopus
      const newHead = await revParse({ cwd }, "HEAD");
      if (!rollback || rollback === newHead) return 0;
      if (!(await isAncestor({ cwd }, rollback, newHead))) return 0; // not ff
      source = await resolveFfSource({ cwd }, current);
    } else {
      if (!(await revParseVerify({ cwd }, "MERGE_HEAD"))) return 0;
      source = await resolveFromMergeHead({ cwd }, current);
    }

    const decision = validateMerge(policy, current, source);
    if (decision.ok) return 0;

    if (rollback) await resetHard({ cwd }, rollback);

    info("");
    printError(`merge-policy: merge blocked by branch policy.`);
    info(`  target:  ${color.cyan(current)}`);
    info(`  source:  ${color.cyan(source ?? "(unknown)")}`);
    info(`  reason:  ${decision.reason}`);
    info(
      rollback
        ? "  branch reset to pre-merge state."
        : "  run: git merge --abort",
    );
    info("  TAGSMITH_SKIP=1 git merge ...   # skip hook (emergency only)");
    return 1;
  } catch (err) {
    printError(err);
    return 1;
  }
}
```

- [ ] **Step 4: Register the command in `src/cli/index.ts`**

Add the import near the other command imports:

```typescript
import { runMergeCheck } from "./merge-check.js";
```

Add the command registration before `program.parseAsync(...)`:

```typescript
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/merge-policy.integration.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/cli/merge-check.ts src/cli/index.ts tests/merge-policy.integration.test.ts
git commit -m "feat: [merge-policy] merge-check command"
```

---

### Task 7: hooks install / uninstall command

**Files:**
- Create: `src/cli/hooks.ts`
- Modify: `src/cli/index.ts` (register the `hooks` command group)
- Test: append to `tests/merge-policy.integration.test.ts`

- [ ] **Step 1: Write the failing test (append to the integration test file)**

```typescript
// append to tests/merge-policy.integration.test.ts
import { mkdir, readFile, stat } from "node:fs/promises";
import { runHooksInstall, runHooksUninstall } from "../src/cli/hooks.js";

describe("runHooksInstall", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tagsmith-hooks-"));
    initRepo(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes husky hooks when a .husky directory exists", async () => {
    await mkdir(path.join(dir, ".husky"));
    const code = await silence(() => runHooksInstall(dir, {}));
    expect(code).toBe(0);
    const pre = await readFile(
      path.join(dir, ".husky", "prepare-commit-msg"),
      "utf8",
    );
    expect(pre).toContain("tagsmith merge-check --mode merge-head");
    const post = await readFile(
      path.join(dir, ".husky", "post-merge"),
      "utf8",
    );
    expect(post).toContain("tagsmith merge-check --mode post-merge");
  });

  it("writes .git/hooks (executable) when husky is absent", async () => {
    const code = await silence(() => runHooksInstall(dir, {}));
    expect(code).toBe(0);
    const hookPath = path.join(dir, ".git", "hooks", "post-merge");
    const post = await readFile(hookPath, "utf8");
    expect(post).toContain("tagsmith merge-check --mode post-merge");
    const mode = (await stat(hookPath)).mode;
    expect(mode & 0o100).toBeTruthy(); // owner-executable
  });

  it("refuses to overwrite a non-tagsmith hook without --force", async () => {
    const hookPath = path.join(dir, ".git", "hooks", "post-merge");
    await writeFile(hookPath, "#!/bin/sh\necho custom\n");
    const code = await silence(() => runHooksInstall(dir, {}));
    expect(code).toBe(1);
    expect(await readFile(hookPath, "utf8")).toContain("echo custom");
  });

  it("uninstall removes tagsmith-managed hooks", async () => {
    await silence(() => runHooksInstall(dir, {}));
    const code = await silence(() => runHooksUninstall(dir));
    expect(code).toBe(0);
    await expect(
      stat(path.join(dir, ".git", "hooks", "post-merge")),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/merge-policy.integration.test.ts`
Expected: FAIL — cannot resolve `../src/cli/hooks.js`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/cli/hooks.ts
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { revParse } from "../git/git.js";
import { info, printError, success, warn } from "./ui.js";

const MARKER = "# tagsmith-merge-policy (managed)";

interface HookSpec {
  name: string;
  body: string;
}

const HOOKS: HookSpec[] = [
  {
    name: "prepare-commit-msg",
    body: [
      "#!/usr/bin/env sh",
      MARKER,
      'case "$2" in',
      "  merge) npx --no-install tagsmith merge-check --mode merge-head || exit $? ;;",
      "esac",
      "",
    ].join("\n"),
  },
  {
    name: "post-merge",
    body: [
      "#!/usr/bin/env sh",
      MARKER,
      "npx --no-install tagsmith merge-check --mode post-merge || exit $?",
      "",
    ].join("\n"),
  },
];

export interface HooksInstallFlags {
  force?: boolean;
}

async function hooksDir(cwd: string): Promise<{ dir: string; husky: boolean }> {
  if (existsSync(path.join(cwd, ".husky"))) {
    return { dir: path.join(cwd, ".husky"), husky: true };
  }
  // .git/hooks (respect a custom git dir / worktree layout)
  const gitHooks = (await revParse({ cwd }, "--git-path")).trim();
  // `git rev-parse --git-path hooks` returns the hooks dir
  const dir = path.join(cwd, gitHooks);
  return { dir, husky: false };
}

async function existsFile(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function runHooksInstall(
  cwd: string,
  flags: HooksInstallFlags,
): Promise<number> {
  try {
    const husky = existsSync(path.join(cwd, ".husky"));
    const dir = husky
      ? path.join(cwd, ".husky")
      : path.join(cwd, (await revParse({ cwd }, "--git-path=hooks")).trim());
    await mkdir(dir, { recursive: true });

    for (const hook of HOOKS) {
      const file = path.join(dir, hook.name);
      if (await existsFile(file)) {
        const current = await readFile(file, "utf8");
        if (!current.includes(MARKER) && !flags.force) {
          printError(
            `${hook.name} already exists and is not tagsmith-managed. Re-run with --force to overwrite.`,
          );
          return 1;
        }
      }
      await writeFile(file, hook.body, "utf8");
      await chmod(file, 0o755);
      success(`installed ${path.relative(cwd, file)}`);
    }
    info("");
    info("merge-policy hooks installed. Configure rules under `mergePolicy` in .tagsmith.json.");
    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}

export async function runHooksUninstall(cwd: string): Promise<number> {
  try {
    const husky = existsSync(path.join(cwd, ".husky"));
    const dir = husky
      ? path.join(cwd, ".husky")
      : path.join(cwd, (await revParse({ cwd }, "--git-path=hooks")).trim());
    for (const hook of HOOKS) {
      const file = path.join(dir, hook.name);
      if (!(await existsFile(file))) continue;
      const current = await readFile(file, "utf8");
      if (current.includes(MARKER)) {
        await rm(file);
        success(`removed ${path.relative(cwd, file)}`);
      } else {
        warn(`skipped ${hook.name} (not tagsmith-managed)`);
      }
    }
    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}
```

NOTE on `revParse` git-path: `git rev-parse --git-path=hooks` resolves the hooks directory (relative to cwd). The existing `revParse(opts, ref)` runs `git rev-parse <ref>`; passing `--git-path=hooks` as the single arg works. Verify in Step 5; if the wrapper double-quotes oddly, fall back to constructing `path.join(cwd, ".git", "hooks")` after confirming `.git` is a directory.

- [ ] **Step 4: Register the `hooks` command group in `src/cli/index.ts`**

Add imports:

```typescript
import { runHooksInstall, runHooksUninstall } from "./hooks.js";
```

Add the command group before `program.parseAsync(...)`:

```typescript
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/merge-policy.integration.test.ts`
Expected: PASS. If the `.git/hooks` path resolution fails, apply the fallback noted in Step 3.

- [ ] **Step 6: Commit**

```bash
git add src/cli/hooks.ts src/cli/index.ts tests/merge-policy.integration.test.ts
git commit -m "feat: [merge-policy] hooks install/uninstall command"
```

---

### Task 8: schema.json, docs, version bump

**Files:**
- Modify: `schema.json`
- Modify: `package.json` (version)
- Modify: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Add `mergePolicy` to `schema.json`**

Add this property inside the top-level `properties` object (keep `additionalProperties` as-is; the existing schema does not set it at root, so adding a property is sufficient):

```json
"mergePolicy": {
  "type": "object",
  "description": "Protected-branch merge restrictions enforced by `tagsmith merge-check` hooks.",
  "required": ["protectedBranches"],
  "additionalProperties": false,
  "properties": {
    "protectedBranches": {
      "type": "object",
      "description": "Map of protected branch name → merge rule.",
      "additionalProperties": {
        "type": "object",
        "additionalProperties": false,
        "oneOf": [
          { "required": ["allow"] },
          { "required": ["deny"] }
        ],
        "properties": {
          "allow": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Only these sources (glob ok) may merge in; all others blocked."
          },
          "deny": {
            "type": "array",
            "items": { "type": "string" },
            "description": "These sources (glob ok) are blocked; all others allowed."
          }
        }
      }
    },
    "onUnknownSource": {
      "enum": ["block", "allow"],
      "description": "Behaviour when the merge source cannot be resolved (default: block)."
    }
  }
}
```

- [ ] **Step 2: Bump the version**

In `package.json`, change `"version": "0.2.1"` to `"version": "0.3.0"`.

- [ ] **Step 3: Document in README.md**

Add a new section after the existing usage docs:

````markdown
## Merge policy (protected branches)

Tagsmith can enforce which branches may be merged into your protected branches,
via local git hooks. Add a `mergePolicy` block to `.tagsmith.json`:

```jsonc
{
  "pattern": "v{version}",
  "model": { "type": "semver" },
  "initialVersion": "0.1.0",
  "mergePolicy": {
    "protectedBranches": {
      "develop": { "allow": ["main"] },
      "main":    { "deny":  ["develop", "testing", "feature/*"] }
    },
    "onUnknownSource": "block"
  }
}
```

- Each protected branch sets **exactly one** of `allow` (whitelist) or `deny` (blacklist).
- Source names support `*` / `?` globs (e.g. `feature/*`).
- `onUnknownSource` (default `block`) decides what happens when the merge source can't be resolved.

Install the hooks (auto-detects husky, else `.git/hooks`):

```bash
npx tagsmith hooks install      # add --force to overwrite foreign hooks
npx tagsmith hooks uninstall
```

Bypass in an emergency with `TAGSMITH_SKIP=1 git merge ...`.
````

- [ ] **Step 4: Add a CHANGELOG entry**

Add at the top of `CHANGELOG.md` under a new `## 0.3.0` heading:

```markdown
## 0.3.0

### Added
- `mergePolicy` config block: restrict which branches may merge into protected branches.
- `tagsmith merge-check` command (used by git hooks) enforcing allow/deny rules with glob support.
- `tagsmith hooks install` / `hooks uninstall`: install merge-policy hooks (husky or `.git/hooks`).
```

- [ ] **Step 5: Full build + test + typecheck**

Run: `npm run build && npm run typecheck && npm test`
Expected: build succeeds, no type errors, all tests pass (including the new merge-policy suites). Coverage stays ≥ 80%.

- [ ] **Step 6: Commit**

```bash
git add schema.json package.json README.md CHANGELOG.md
git commit -m "feat: [merge-policy] schema, docs, bump to 0.3.0"
```

---

## Self-Review notes

- **Spec coverage:** §2 config → Task 1 + Task 8 (schema.json); allow/deny oneOf → Task 1; glob → Task 2; `merge-check` + rollback/exit semantics → Task 6; `hooks install/uninstall` husky-or-.git detection → Task 7; source resolution (both paths) → Task 5; HUSKY/TAGSMITH_SKIP + detached HEAD + octopus/non-ff skips → Task 6; tests ≥80% → Tasks 1-3, 6, 7; versioning/README/CHANGELOG → Task 8. All spec sections mapped.
- **Naming consistency:** `loadMergePolicy`, `parseMergePolicy`, `matchSource`, `validateMerge`, `resolveFromMergeHead`, `resolveFfSource`, `runMergeCheck`, `runHooksInstall`, `runHooksUninstall` are used identically across producing and consuming tasks.
- **Known risk flagged inline:** `.git/hooks` path resolution via `git rev-parse --git-path=hooks` (Task 7, Step 3/5) has a documented fallback.
- **Follow-up (out of scope):** migrate arcade-report's `check-merge-policy.sh` to `tagsmith hooks install` after 0.3.0 ships.
