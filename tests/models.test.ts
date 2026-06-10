import { describe, it, expect } from "vitest";
import {
  createSemverModel,
  createCalverModel,
  createBuildModel,
  createModel,
} from "../src/core/models/index.js";

describe("semver model", () => {
  const m = createSemverModel();

  it("parses valid semver and rejects junk", () => {
    expect(m.parse("1.2.3")?.value).toBe("1.2.3");
    expect(m.parse("1.2.3-rc.1")?.value).toBe("1.2.3-rc.1");
    expect(m.parse("not-a-version")).toBeNull();
    expect(m.parse("1.2")).toBeNull();
  });

  it("rejects prerelease when disallowed", () => {
    const strict = createSemverModel({ allowPrerelease: false });
    expect(strict.parse("1.2.3")?.value).toBe("1.2.3");
    expect(strict.parse("1.2.3-rc.1")).toBeNull();
  });

  it("compares by precedence", () => {
    expect(m.compare(m.parse("1.0.0")!, m.parse("2.0.0")!)).toBeLessThan(0);
    expect(m.compare(m.parse("1.2.3")!, m.parse("1.2.3")!)).toBe(0);
    expect(m.compare(m.parse("1.2.4")!, m.parse("1.2.3")!)).toBeGreaterThan(0);
    expect(
      m.compare(m.parse("1.0.0-rc.1")!, m.parse("1.0.0")!),
    ).toBeLessThan(0);
  });

  it("bumps each level", () => {
    expect(m.format(m.bump(m.parse("1.2.3")!, "patch"))).toBe("1.2.4");
    expect(m.format(m.bump(m.parse("1.2.3")!, "minor"))).toBe("1.3.0");
    expect(m.format(m.bump(m.parse("1.2.3")!, "major"))).toBe("2.0.0");
    expect(m.format(m.bump(m.parse("1.2.3")!, "auto"))).toBe("1.2.4");
    expect(m.format(m.bump(m.parse("1.2.3")!, "prerelease"))).toBe("1.2.4-0");
  });

  it("builds initial and rejects invalid initial", () => {
    expect(m.format(m.initial("0.1.0"))).toBe("0.1.0");
    expect(() => m.initial("bad")).toThrow();
  });
});

describe("calver model", () => {
  const now = new Date(2026, 5, 10); // 2026-06-10 (month is 0-based)
  const m = createCalverModel({ format: "YYYY.MM.MICRO", now });

  it("parses and formats", () => {
    const v = m.parse("2026.06.3");
    expect(v).toEqual({ year: 2026, month: 6, day: 0, micro: 3 });
    expect(m.format(v!)).toBe("2026.06.3");
  });

  it("rejects non-matching strings", () => {
    expect(m.parse("v1.2.3")).toBeNull();
    expect(m.parse("2026.13.0")).toBeNull(); // month > 12
  });

  it("increments MICRO on same date, resets on new date", () => {
    const same = m.bump(m.parse("2026.06.5")!, "auto");
    expect(m.format(same)).toBe("2026.06.6");
    const older = m.bump(m.parse("2025.01.9")!, "auto");
    expect(m.format(older)).toBe("2026.06.0");
  });

  it("supports YY and DD tokens", () => {
    const ymd = createCalverModel({ format: "YY.MM.DD", now });
    const v = ymd.parse("26.06.10");
    expect(v).toEqual({ year: 2026, month: 6, day: 10, micro: 0 });
    expect(ymd.format(v!)).toBe("26.06.10");
  });

  it("throws when no MICRO and date already used", () => {
    const noMicro = createCalverModel({ format: "YYYY.MM.DD", now });
    expect(() => noMicro.bump(noMicro.parse("2026.06.10")!, "auto")).toThrow();
  });

  it("splits adjacent numeric tokens at fixed widths", () => {
    const packed = createCalverModel({ format: "YYYYMM.MICRO", now });
    const v = packed.parse("202606.0");
    expect(v).toEqual({ year: 2026, month: 6, day: 0, micro: 0 });
    expect(packed.format(v!)).toBe("202606.0");
    // Wrong width must not parse.
    expect(packed.parse("20260.6.0")).toBeNull();
  });

  it("rejects non-canonical (unpadded / leading-zero) versions", () => {
    expect(m.parse("2026.6.7")).toBeNull(); // MM not zero-padded
    expect(m.parse("2026.06.007")).toBeNull(); // MICRO leading zeros
    expect(m.parse("2026.06.7")).not.toBeNull();
  });

  it("stays monotonic when the latest tag is future-dated", () => {
    const next = m.bump(m.parse("2099.01.4")!, "auto");
    // now (2026-06) is before the tag's date → keep date, bump micro.
    expect(m.format(next)).toBe("2099.01.5");
    expect(m.compare(next, m.parse("2099.01.4")!)).toBeGreaterThan(0);
  });
});

describe("build model", () => {
  const m = createBuildModel({ padding: 4 });

  it("parses, pads, bumps", () => {
    expect(m.parse("42")?.n).toBe(42);
    expect(m.parse("x")).toBeNull();
    expect(m.format(m.parse("42")!)).toBe("0042");
    expect(m.format(m.bump(m.parse("42")!, "auto"))).toBe("0043");
  });

  it("formats without padding by default", () => {
    const plain = createBuildModel();
    expect(plain.format({ n: 7 })).toBe("7");
  });

  it("rejects build numbers that exceed safe-integer precision", () => {
    expect(m.parse("9".repeat(16))).toBeNull();
    expect(m.parse("999999999999999")).not.toBeNull(); // 15 digits ok
  });
});

describe("createModel factory", () => {
  it("constructs each model type", () => {
    expect(createModel({ type: "semver" }).type).toBe("semver");
    expect(createModel({ type: "calver", format: "YYYY.MM" }).type).toBe("calver");
    expect(createModel({ type: "build" }).type).toBe("build");
  });
});
