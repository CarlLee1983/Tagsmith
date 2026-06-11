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

/** Resolve the directory hooks should be written to: .husky if present, else .git/hooks. */
async function resolveHooksDir(cwd: string): Promise<string> {
  if (existsSync(path.join(cwd, ".husky"))) return path.join(cwd, ".husky");
  // `git rev-parse --git-dir` returns the git dir (relative or absolute).
  const raw = (await revParse({ cwd }, "--git-dir")).trim();
  const gitDir = path.isAbsolute(raw) ? raw : path.join(cwd, raw);
  return path.join(gitDir, "hooks");
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
    const dir = await resolveHooksDir(cwd);
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
    info(
      "merge-policy hooks installed. Configure rules under `mergePolicy` in .tagsmith.json.",
    );
    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}

export async function runHooksUninstall(cwd: string): Promise<number> {
  try {
    const dir = await resolveHooksDir(cwd);
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
