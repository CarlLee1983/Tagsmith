import { describe, it, expect } from "vitest";
import { createModel } from "../src/core/models/index.js";
import { inferPattern, hasConformingTag } from "../src/core/infer.js";
import { buildImplicitConfig } from "../src/core/config.js";
import { defaultConfig } from "../src/core/defaults.js";

describe("inferPattern", () => {
  const model = createModel({ type: "semver", allowPrerelease: true });

  it("returns v{version} for empty tags", () => {
    expect(inferPattern([], model)).toBe("v{version}");
  });

  it("infers v{version} from v-prefixed semver tags", () => {
    expect(inferPattern(["v0.1.0", "v1.0.0"], model)).toBe("v{version}");
  });

  it("infers {version} from bare semver tags", () => {
    expect(inferPattern(["0.1.0", "1.0.0"], model)).toBe("{version}");
  });

  it("infers release/{version} from release tags", () => {
    expect(inferPattern(["release/2.0.0", "release/2.1.0"], model)).toBe(
      "release/{version}",
    );
  });

  it("prefers the pattern that matches the most tags", () => {
    expect(inferPattern(["v1.0.0", "1.0.0"], model)).toBe("{version}");
  });

  it("breaks equal scores by candidate order (v{version} first)", () => {
    expect(inferPattern(["v1.0.0", "v2.0.0"], model)).toBe("v{version}");
  });
});

describe("buildImplicitConfig", () => {
  it("uses default source for empty tags", () => {
    const r = buildImplicitConfig([]);
    expect(r.source).toBe("default");
    expect(r.config.lines[0]?.pattern).toBe("v{version}");
    expect(r.config.lines[0]?.initialVersion).toBe("0.1.0");
  });

  it("uses inferred source when tags match", () => {
    const r = buildImplicitConfig(["0.1.0"]);
    expect(r.source).toBe("inferred");
    expect(r.config.lines[0]?.pattern).toBe("{version}");
  });

  it("falls back to default when no tag matches candidates", () => {
    const r = buildImplicitConfig(["junk", "nightly"]);
    expect(r.source).toBe("default");
    expect(r.config.lines[0]?.pattern).toBe("v{version}");
  });

  it("matches hard defaultConfig shape", () => {
    expect(buildImplicitConfig([]).config).toEqual(defaultConfig());
  });
});

describe("hasConformingTag", () => {
  const model = createModel({ type: "semver" });

  it("detects conforming tags", () => {
    expect(hasConformingTag(["v1.0.0"], "v{version}", model)).toBe(true);
    expect(hasConformingTag(["junk"], "v{version}", model)).toBe(false);
  });
});

describe("defaultConfig", () => {
  it("returns a single semver line", () => {
    const c = defaultConfig();
    expect(c.default).toBe("default");
    expect(c.lines).toHaveLength(1);
    expect(c.lines[0]?.model.type).toBe("semver");
  });
});
