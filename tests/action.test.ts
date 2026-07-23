import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("GitHub Action", () => {
  it("builds the checked-out action and runs the complete tag audit", async () => {
    const action = await readFile(path.join(root, "action.yml"), "utf8");

    expect(action).toContain("using: composite");
    expect(action).toContain("npm ci --ignore-scripts");
    expect(action).toContain("npm run build");
    expect(action).toContain("git fetch --tags origin");
    expect(action).toContain('audit --json');
  });
});
