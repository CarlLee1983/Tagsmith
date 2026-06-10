import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseConfig,
  loadConfig,
  ConfigError,
  MissingConfigError,
} from "../src/core/config.js";

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

describe("loadConfig error types", () => {
  it("throws MissingConfigError when the file is absent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tagsmith-cfg-"));
    try {
      await expect(loadConfig(dir)).rejects.toBeInstanceOf(MissingConfigError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws plain ConfigError on invalid JSON (not MissingConfigError)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tagsmith-cfg-"));
    try {
      await writeFile(path.join(dir, ".tagsmith.json"), "{ not json", "utf8");
      const err = await loadConfig(dir).catch((e) => e);
      expect(err).toBeInstanceOf(ConfigError);
      expect(err).not.toBeInstanceOf(MissingConfigError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
