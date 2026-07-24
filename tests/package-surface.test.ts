import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function manifest(): Promise<any> {
  return JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
}

/**
 * Tagsmith publishes a CLI, not a library. The exports map is what keeps that
 * promise enforceable: without it, any dist/ module is importable and internal
 * refactors silently become someone else's breaking change.
 */
describe("published package surface", () => {
  it("exposes the machine-readable schemas and nothing else", async () => {
    const pkg = await manifest();

    expect(Object.keys(pkg.exports).sort()).toEqual([
      "./json-output.schema.json",
      "./package.json",
      "./schema.json",
    ]);
    // No "." entry: importing the package itself is not part of the contract.
    expect(Object.keys(pkg.exports)).not.toContain(".");
    expect(JSON.stringify(pkg.exports)).not.toContain("dist");
  });

  it("ships the CLI entry point and both schemas", async () => {
    const pkg = await manifest();

    expect(pkg.bin).toEqual({ tagsmith: "dist/cli/index.js" });
    for (const asset of ["schema.json", "json-output.schema.json"]) {
      expect(pkg.files).toContain(asset);
      const parsed = JSON.parse(await readFile(path.join(root, asset), "utf8"));
      expect(parsed.$schema).toContain("json-schema.org");
    }
  });

  it("declares a Node range that is still under LTS support", async () => {
    const pkg = await manifest();

    expect(pkg.engines.node).toBe(">=22");
  });

  it("keeps the documented Node version in step with the manifest", async () => {
    const pkg = await manifest();
    const docsentry = JSON.parse(await readFile(path.join(root, ".docsentry.json"), "utf8"));

    const assertion = docsentry.package.assertions.find(
      (item: { evidence: string }) => item.evidence === "/engines/node",
    );
    expect(assertion.value).toBe(pkg.engines.node);
  });
});
