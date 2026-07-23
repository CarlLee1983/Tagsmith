import { describe, expect, it } from "vitest";
import { evaluateArtifactVersion, packageJsonPath } from "../src/core/artifact.js";
import { createModel } from "../src/core/models/index.js";
import type { TagLine } from "../src/types.js";

const line: TagLine = {
  name: "api",
  workspace: "packages/api",
  pattern: "api/v{version}",
  model: { type: "semver" },
  initialVersion: "0.1.0",
  push: false,
  artifact: { type: "package-json" },
};
const model = createModel(line.model);

describe("package.json artifact evaluation", () => {
  it("uses the workspace manifest and passes matching canonical versions", () => {
    const report = evaluateArtifactVersion(
      line,
      model,
      "api/v1.2.3",
      "1.2.3",
      '{"name":"api","version":"1.2.3"}',
    );

    expect(packageJsonPath(line)).toBe("packages/api/package.json");
    expect(report).toMatchObject({
      configured: true,
      status: "pass",
      actualVersion: "1.2.3",
      diagnostics: [],
    });
  });

  it.each([
    [null, "artifact-package-json-missing"],
    ["{ nope", "artifact-package-json-malformed"],
    ["{}", "artifact-version-missing"],
    ['{"version":"not-a-version"}', "artifact-version-invalid"],
    ['{"version":"1.2.4"}', "artifact-version-mismatch"],
  ] as const)("reports %s as %s", (contents, code) => {
    const report = evaluateArtifactVersion(line, model, "api/v1.2.3", "1.2.3", contents);
    expect(report.status).toBe("fail");
    expect(report.diagnostics[0]?.code).toBe(code);
  });

  it("does not manufacture an artifact check for a line without one", () => {
    expect(evaluateArtifactVersion(
      { ...line, artifact: undefined },
      model,
      "api/v1.2.3",
      "1.2.3",
      null,
    )).toMatchObject({ configured: false, status: "not-configured" });
  });
});
