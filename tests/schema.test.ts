import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("JSON schema", () => {
  it("documents both config shapes and workspace-scoped tag lines", async () => {
    const schema = JSON.parse(await readFile(path.join(root, "schema.json"), "utf8"));

    expect(schema.oneOf).toHaveLength(2);
    const multi = schema.oneOf.find((shape: { required: string[] }) =>
      shape.required.includes("tags"),
    );
    expect(multi.properties.tags.items.$ref).toBe("#/definitions/tagLine");
    const legacy = schema.oneOf.find((shape: { required: string[] }) =>
      shape.required.includes("pattern"),
    );
    for (const workspace of [
      schema.definitions.tagLine.properties.workspace,
      legacy.properties.workspace,
    ]) {
      expect(workspace).toMatchObject({ type: "string", minLength: 1 });
      const relative = new RegExp(workspace.allOf[0].pattern);
      const parentSegment = new RegExp(workspace.allOf[1].not.pattern);
      expect(relative.test("packages/api")).toBe(true);
      expect(relative.test("/tmp/api")).toBe(false);
      expect(relative.test("C:\\repo\\api")).toBe(false);
      expect(parentSegment.test("../outside")).toBe(true);
      expect(parentSegment.test("packages/api")).toBe(false);
    }
    expect(multi.properties.releasePolicy.$ref).toBe("#/definitions/releasePolicy");
    expect(legacy.properties.releasePolicy.$ref).toBe("#/definitions/releasePolicy");
    expect(schema.definitions.releasePolicy.properties.signature.enum).toEqual([
      "optional", "required",
    ]);
  });

  it("publishes the versioned JSON command envelope contract", async () => {
    const schema = JSON.parse(
      await readFile(path.join(root, "json-output.schema.json"), "utf8"),
    );

    expect(schema.required).toEqual([
      "schemaVersion", "command", "ok", "data", "diagnostics",
    ]);
    expect(schema.properties.schemaVersion.const).toBe(1);
    expect(schema.properties.command.enum).toEqual(["list", "check", "next", "audit", "plan"]);
    expect(schema.definitions.diagnostic.required).toEqual(["code", "severity", "message"]);
  });
});
