import { describe, it, expect } from "vitest";
import { parseConfig, ConfigError } from "../src/core/config.js";

describe("parseConfig", () => {
  it("accepts a valid semver config", () => {
    const cfg = parseConfig({
      pattern: "v{version}",
      model: { type: "semver", allowPrerelease: true },
      initialVersion: "0.1.0",
      push: false,
    });
    expect(cfg.pattern).toBe("v{version}");
    expect(cfg.model.type).toBe("semver");
  });

  it("defaults push to false", () => {
    const cfg = parseConfig({
      pattern: "v{version}",
      model: { type: "semver" },
      initialVersion: "0.1.0",
    });
    expect(cfg.push).toBe(false);
  });

  it("rejects a pattern without placeholder", () => {
    expect(() =>
      parseConfig({
        pattern: "vX",
        model: { type: "semver" },
        initialVersion: "0.1.0",
      }),
    ).toThrow(ConfigError);
  });

  it("rejects an unknown model type", () => {
    expect(() =>
      parseConfig({
        pattern: "v{version}",
        model: { type: "bogus" },
        initialVersion: "0.1.0",
      }),
    ).toThrow(ConfigError);
  });

  it("requires calver format", () => {
    expect(() =>
      parseConfig({
        pattern: "{version}",
        model: { type: "calver" },
        initialVersion: "2026.06.0",
      }),
    ).toThrow(ConfigError);
  });
});
