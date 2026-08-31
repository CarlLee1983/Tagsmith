import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import { parseConfig } from "../src/core/config.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("JSON schema", () => {
  it("matches runtime acceptance for strict keys and Git tag patterns", async () => {
    const schema = JSON.parse(await readFile(path.join(root, "schema.json"), "utf8"));
    const validate = new Ajv({ strict: false }).compile(schema);
    const configs = [
      {
        $schema: "./schema.json",
        pattern: "v{version}",
        model: { type: "semver", allowPrerelease: true },
        initialVersion: "0.1.0",
        mergePolicy: {
          protectedBranches: { main: { allow: ["feat/*"] } },
          onUnknownSource: "block",
        },
      },
      {
        tags: [{
          name: "release",
          pattern: "release/{version}",
          model: { type: "calver", format: "YYYY.MM.MICRO" },
          initialVersion: "2026.08.0",
          artifact: { type: "package-json" },
        }],
        commitPolicy: { rules: [{ type: "feat", release: "minor" }] },
      },
      {
        pattern: "v{version}",
        model: { type: "semver", allowPrereleasee: true },
        initialVersion: "0.1.0",
      },
      {
        tags: [{
          name: "app",
          pattern: "v{version}",
          model: { type: "semver" },
          initialVersion: "0.1.0",
          pussh: true,
        }],
      },
      {
        pattern: "v{version}\nhas-releases=false",
        model: { type: "semver" },
        initialVersion: "0.1.0",
      },
      {
        pattern: "v{version}-{version}",
        model: { type: "semver" },
        initialVersion: "0.1.0",
      },
      {
        pattern: "v{version}",
        model: { type: "semver" },
        initialVersion: "",
      },
      {
        pattern: "release/{version}",
        model: { type: "calver", format: "" },
        initialVersion: "2026.08.0",
      },
    ];

    for (const config of configs) {
      const schemaAccepts = validate(config);
      let runtimeAccepts = true;
      try {
        parseConfig(config);
      } catch {
        runtimeAccepts = false;
      }
      expect(runtimeAccepts, JSON.stringify(config)).toBe(schemaAccepts);
    }
  });

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
    expect(multi.properties.commitPolicy.$ref).toBe("#/definitions/commitPolicy");
    expect(legacy.properties.commitPolicy.$ref).toBe("#/definitions/commitPolicy");
    expect(schema.definitions.tagLine.properties.artifact.$ref).toBe("#/definitions/artifact");
    expect(legacy.properties.artifact.$ref).toBe("#/definitions/artifact");
    expect(schema.definitions.artifact.properties.type.const).toBe("package-json");
    expect(schema.definitions.commitPolicy.properties.rules.minItems).toBe(1);
    expect(schema.definitions.releasePolicy.properties.signature.enum).toEqual([
      "optional", "required",
    ]);
    expect(schema.definitions.releasePolicy.properties.requireArtifactVersion.default).toBe(false);
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
    expect(schema.definitions.diagnostic.properties.path.type).toBe("string");
  });
});
