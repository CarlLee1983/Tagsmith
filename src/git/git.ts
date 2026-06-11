import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitError extends Error {}

export interface GitOptions {
  /** Working directory for git commands. */
  cwd: string;
}

async function git(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new GitError(
      `git ${args.join(" ")} failed: ${(e.stderr ?? e.message ?? "unknown error").trim()}`,
    );
  }
}

/** Throw a friendly error when cwd is not inside a git work tree. */
export async function ensureRepo(opts: GitOptions): Promise<void> {
  try {
    await git(["rev-parse", "--is-inside-work-tree"], opts.cwd);
  } catch {
    throw new GitError(
      `Not a git repository: ${opts.cwd}. Run \`git init\` first.`,
    );
  }
}

/** List all tag names in the repo. */
export async function listTags(opts: GitOptions): Promise<string[]> {
  const out = await git(["tag", "--list"], opts.cwd);
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export interface CreateTagOptions extends GitOptions {
  name: string;
  /** When provided, creates an annotated tag with this message. */
  message?: string;
  /** Target ref/commit; defaults to HEAD. */
  ref?: string;
}

export async function createTag(opts: CreateTagOptions): Promise<void> {
  const args = ["tag"];
  if (opts.message !== undefined) {
    args.push("-a", opts.name, "-m", opts.message);
  } else {
    args.push(opts.name);
  }
  if (opts.ref !== undefined) args.push(opts.ref);
  await git(args, opts.cwd);
}

export interface PushTagOptions extends GitOptions {
  name: string;
  remote?: string;
}

export async function pushTag(opts: PushTagOptions): Promise<void> {
  await git(["push", opts.remote ?? "origin", opts.name], opts.cwd);
}

// --- merge-policy helpers ---

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
