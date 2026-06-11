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

describe("parseConfig (legacy flat)", () => {
  it("normalises a legacy flat config into a single default line", () => {
    const cfg = parseConfig({
      pattern: "v{version}",
      model: { type: "semver", allowPrerelease: true },
      initialVersion: "0.1.0",
      push: false,
    });
    expect(cfg.lines).toHaveLength(1);
    expect(cfg.lines[0].name).toBe("default");
    expect(cfg.lines[0].pattern).toBe("v{version}");
    expect(cfg.default).toBe("default");
  });

  it("defaults legacy push to false", () => {
    const cfg = parseConfig({
      pattern: "v{version}",
      model: { type: "semver" },
      initialVersion: "0.1.0",
    });
    expect(cfg.lines[0].push).toBe(false);
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

describe("parseConfig (multi-line)", () => {
  const base = {
    tags: [
      { name: "app", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
      { name: "release", pattern: "release/{version}",
        model: { type: "calver", format: "YYYY.MM.MICRO" },
        initialVersion: "2026.06.0", push: true },
    ],
    default: "app",
  };

  it("parses a multi-line config", () => {
    const cfg = parseConfig(base);
    expect(cfg.lines.map((l) => l.name)).toEqual(["app", "release"]);
    expect(cfg.default).toBe("app");
    expect(cfg.lines[1].push).toBe(true);
  });

  it("defaults push to false per line", () => {
    const cfg = parseConfig(base);
    expect(cfg.lines[0].push).toBe(false);
  });

  it("defaults `default` to the first line when omitted", () => {
    const cfg = parseConfig({ tags: base.tags });
    expect(cfg.default).toBe("app");
  });

  it("rejects duplicate line names", () => {
    expect(() =>
      parseConfig({
        tags: [
          { name: "dup", pattern: "v{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
          { name: "dup", pattern: "r/{version}", model: { type: "semver" }, initialVersion: "0.1.0" },
        ],
      }),
    ).toThrow(ConfigError);
  });

  it("rejects an empty tags array", () => {
    expect(() => parseConfig({ tags: [] })).toThrow(ConfigError);
  });

  it("rejects a default that names no line", () => {
    expect(() => parseConfig({ tags: base.tags, default: "ghost" })).toThrow(ConfigError);
  });

  it("rejects a line pattern without placeholder", () => {
    expect(() =>
      parseConfig({
        tags: [{ name: "x", pattern: "v", model: { type: "semver" }, initialVersion: "0.1.0" }],
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
