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
