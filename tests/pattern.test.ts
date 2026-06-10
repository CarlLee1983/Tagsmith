import { describe, it, expect } from "vitest";
import { compilePattern, PatternError } from "../src/core/pattern.js";

describe("compilePattern", () => {
  it("extracts and renders with a prefix", () => {
    const p = compilePattern("v{version}");
    expect(p.extract("v1.2.3")).toBe("1.2.3");
    expect(p.extract("1.2.3")).toBeNull();
    expect(p.render("1.2.3")).toBe("v1.2.3");
  });

  it("supports prefix with slash", () => {
    const p = compilePattern("release/{version}");
    expect(p.extract("release/2.0.0")).toBe("2.0.0");
    expect(p.extract("v2.0.0")).toBeNull();
    expect(p.render("2.0.0")).toBe("release/2.0.0");
  });

  it("supports suffix", () => {
    const p = compilePattern("{version}-stable");
    expect(p.extract("1.0.0-stable")).toBe("1.0.0");
    expect(p.render("1.0.0")).toBe("1.0.0-stable");
  });

  it("rejects patterns without or with duplicate placeholder", () => {
    expect(() => compilePattern("v1.0.0")).toThrow(PatternError);
    expect(() => compilePattern("{version}-{version}")).toThrow(PatternError);
  });

  it("escapes regex special chars in literal parts", () => {
    const p = compilePattern("v.{version}");
    expect(p.extract("v.1.0.0")).toBe("1.0.0");
    expect(p.extract("vX1.0.0")).toBeNull();
  });
});
