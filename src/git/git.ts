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

export interface FetchTagsOptions extends GitOptions {
  /** Remote to synchronise from; defaults to the standard `origin` remote. */
  remote?: string;
}

/** Fetch all tags from a remote before making a release decision. */
export async function fetchTags(opts: FetchTagsOptions): Promise<void> {
  await git(["fetch", "--tags", opts.remote ?? "origin"], opts.cwd);
}

export interface ListCommitMessagesOptions extends GitOptions {
  /** Exclude commits reachable from this ref, such as the latest release tag. */
  from?: string;
  /** Limit history to this repository-relative workspace path. */
  workspace?: string;
}

export interface GitCommitMessage {
  id: string;
  message: string;
}

/** List complete commit messages since a ref, newest first. */
export async function listCommitMessages(
  opts: ListCommitMessagesOptions,
): Promise<GitCommitMessage[]> {
  const range = opts.from === undefined ? "HEAD" : `${opts.from}..HEAD`;
  const args = ["log", "--format=%H%x00%B%x00", range];
  if (opts.workspace !== undefined) {
    args.push("--", workspacePathspec(opts.workspace));
  }
  const out = await git(args, opts.cwd);
  const fields = out.split("\0");
  const commits: GitCommitMessage[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const id = fields[i]?.trim() ?? "";
    if (id === "") continue;
    commits.push({ id, message: fields[i + 1] ?? "" });
  }
  return commits;
}

export interface WorkspaceChangesOptions extends GitOptions {
  /** Workspace path relative to the repository root. */
  workspace: string;
  /** Latest tag for the workspace; omit it to inspect the full history. */
  since?: string | null;
}

export interface CommittedChangesOptions extends GitOptions {
  /** Limit the comparison to a repository-relative workspace path. */
  workspace?: string;
  /** Latest release tag; omit it to determine whether any history exists. */
  since?: string | null;
}

/**
 * Return whether the repository, or one configured workspace, has committed
 * changes since a tag. Worktree-only edits deliberately do not count.
 */
export async function hasCommittedChanges(
  opts: CommittedChangesOptions,
): Promise<boolean> {
  if (opts.since === undefined || opts.since === null) {
    const args = ["log", "-1", "--format=%H"];
    if (opts.workspace !== undefined) args.push("--", workspacePathspec(opts.workspace));
    const result = await tryGit(args, opts.cwd);
    if (result.code !== 0) {
      // `git log` exits non-zero in a freshly initialized repository. That is
      // simply an empty committed history, not an inspection failure.
      const head = await tryGit(["rev-parse", "-q", "--verify", "HEAD"], opts.cwd);
      if (head.code !== 0) return false;
      const scope = opts.workspace === undefined ? "repository" : `workspace "${opts.workspace}"`;
      throw new GitError(`Could not inspect ${scope}.`);
    }
    return result.stdout.trim() !== "";
  }

  const args = ["diff", "--quiet", `${opts.since}..HEAD`];
  if (opts.workspace !== undefined) args.push("--", workspacePathspec(opts.workspace));
  const result = await tryGit(args, opts.cwd);
  if (result.code === 0) return false;
  if (result.code === 1) return true;
  const scope = opts.workspace === undefined ? "repository" : `workspace "${opts.workspace}"`;
  throw new GitError(`Could not inspect ${scope} since "${opts.since}".`);
}

/**
 * Return whether a workspace has changed since a tag. A workspace without a
 * prior tag is considered changed once it has any committed history.
 */
export async function hasWorkspaceChanges(
  opts: WorkspaceChangesOptions,
): Promise<boolean> {
  return hasCommittedChanges(opts);
}

/** Keep configured workspace paths rooted at the worktree, not the caller's cwd. */
function workspacePathspec(workspace: string): string {
  return `:(top,literal)${workspace}`;
}

export interface CreateTagOptions extends GitOptions {
  name: string;
  /** When provided, creates an annotated tag with this message. */
  message?: string;
  /** Target ref/commit; defaults to HEAD. */
  ref?: string;
  /** Ask Git to create a signed (and therefore annotated) tag. */
  sign?: boolean;
}

export async function createTag(opts: CreateTagOptions): Promise<void> {
  const args = ["tag"];
  if (opts.sign) {
    args.push("-s");
  } else if (opts.message !== undefined) {
    args.push("-a");
  }
  if (opts.message !== undefined) args.push("-m", opts.message);
  args.push(opts.name);
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

/** True only when no staged, unstaged, or untracked worktree changes exist. */
export async function isWorktreeClean(opts: GitOptions): Promise<boolean> {
  const { stdout } = await tryGit(
    ["status", "--porcelain", "--untracked-files=all"],
    opts.cwd,
  );
  return stdout.trim() === "";
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

/** Resolve a ref to the commit it ultimately denotes, rejecting non-commits. */
export async function revParseCommit(opts: GitOptions, ref: string): Promise<string> {
  return revParse(opts, `${ref}^{commit}`);
}

/** Read the MERGE_MSG file contents, or null when it is absent. */
export async function mergeMsg(opts: GitOptions): Promise<string | null> {
  const { code, stdout } = await tryGit(
    ["rev-parse", "--git-path", "MERGE_MSG"],
    opts.cwd,
  );
  if (code !== 0) return null;
  // `--git-path` returns an absolute path under separate-git-dir / $GIT_DIR
  // setups; resolve relative paths against cwd but keep absolute ones as-is.
  const raw = stdout.trim();
  const file = path.isAbsolute(raw) ? raw : path.join(opts.cwd, raw);
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
