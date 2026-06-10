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
  let outSpy: ReturnType<typeof vi.spyOn<typeof process.stdout, "write">>;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tagsmith-guide-"));
    gitInit(dir);
    outSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    outSpy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it("runs init when the user agrees, then previews", async () => {
    const io = fakeIO([true]);
    const code = await runGuide(dir, io);
    expect(code).toBe(0);
    expect(await configExists(dir)).toBe(true);
    expect(io.notes.join("\n")).toMatch(/next|create/i);
  });

  it("skips init when the user declines and still finishes cleanly", async () => {
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

  it("exits cleanly with code 0 when the user cancels", async () => {
    const cancelSymbol = Symbol("cancel");
    const io: GuideIO & { notes: string[] } = {
      notes: [],
      intro: () => {},
      outro: () => {},
      note: (msg: string) => { io.notes.push(msg); },
      cancel: (msg: string) => { io.notes.push(msg); },
      confirm: async () => cancelSymbol,
      isCancel: (v: unknown) => v === cancelSymbol,
    };
    const code = await runGuide(dir, io);
    expect(code).toBe(0);
    expect(await configExists(dir)).toBe(false);
    expect(io.notes.join("\n")).toMatch(/cancel/i);
  });
});
