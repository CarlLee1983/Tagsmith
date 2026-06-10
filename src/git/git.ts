import { execFile } from "node:child_process";
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
