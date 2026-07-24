import { describe, it, expect } from "vitest";
import { analyzePatternOverlap } from "../src/core/pattern-overlap.js";
import { compilePattern } from "../src/core/pattern.js";
import type { TagLine } from "../src/types.js";

function line(name: string, pattern: string, initialVersion = "0.1.0"): TagLine {
  return { name, pattern, model: { type: "semver" }, initialVersion, push: false };
}

/** The single pair produced by a two-line configuration. */
function pairOf(a: TagLine, b: TagLine) {
  const { pairs } = analyzePatternOverlap([a, b]);
  expect(pairs).toHaveLength(1);
  return pairs[0]!;
}

describe("analyzePatternOverlap", () => {
  it("reports disjoint lines when prefixes cannot agree", () => {
    expect(pairOf(line("app", "v{version}"), line("rel", "release/{version}")))
      .toEqual({ a: "app", b: "rel", verdict: "disjoint" });
  });

  it("reports disjoint lines for sibling workspace prefixes", () => {
    expect(pairOf(line("api", "app/v{version}"), line("web", "web/v{version}")).verdict)
      .toBe("disjoint");
  });

  it("reports disjoint lines when suffixes cannot agree", () => {
    expect(pairOf(line("rc", "v{version}-rc"), line("st", "v{version}-stable")).verdict)
      .toBe("disjoint");
  });

  it("proves a prerelease suffix line collides with its base line", () => {
    expect(pairOf(line("app", "v{version}"), line("rc", "v{version}-rc"))).toEqual({
      a: "app",
      b: "rc",
      verdict: "overlapping",
      witness: "v0.1.0-rc",
      witnessSource: "line-version",
      witnessOrigin: { line: "rc", version: "0.1.0" },
    });
  });

  it("proves a bare pattern swallows every other line", () => {
    expect(pairOf(line("app", "v{version}"), line("bare", "{version}"))).toEqual({
      a: "app",
      b: "bare",
      verdict: "overlapping",
      witness: "v0.1.0",
      witnessSource: "line-version",
      witnessOrigin: { line: "app", version: "0.1.0" },
    });
  });

  it("proves two identical patterns collide", () => {
    const pair = pairOf(line("a", "v{version}"), line("b", "v{version}"));
    expect(pair.verdict).toBe("overlapping");
    expect(pair.witnessSource).toBe("line-version");
    expect(pair.witness).toBe("v0.1.0");
  });

  it("falls back to a constructed witness when neither line renders a collision", () => {
    expect(pairOf(line("a", "v{version}"), line("b", "{version}v"))).toEqual({
      a: "a",
      b: "b",
      verdict: "overlapping",
      witness: "v0v",
      witnessSource: "constructed",
    });
  });

  it("constructs a witness across crossed literals", () => {
    expect(pairOf(line("a", "{version}-rc"), line("b", "rc-{version}"))).toEqual({
      a: "a",
      b: "b",
      verdict: "overlapping",
      witness: "rc-0-rc",
      witnessSource: "constructed",
    });
  });

  it("keeps a longer initialVersion out of the way of the verdict", () => {
    // A CalVer line and a SemVer line still collide purely by pattern shape.
    const calver: TagLine = {
      name: "date",
      pattern: "v{version}",
      model: { type: "calver", format: "YYYY.MM.MICRO" },
      initialVersion: "2026.07.0",
      push: false,
    };
    const pair = pairOf(calver, line("sem", "v{version}-rc"));
    expect(pair.verdict).toBe("overlapping");
    expect(pair.witness).toBe("v0.1.0-rc");
  });

  it("produces no pairs for a single-line configuration", () => {
    expect(analyzePatternOverlap([line("app", "v{version}")])).toEqual({ pairs: [] });
    expect(analyzePatternOverlap([])).toEqual({ pairs: [] });
  });

  it("emits every pair once, in declaration order", () => {
    const { pairs } = analyzePatternOverlap([
      line("a", "a/{version}"),
      line("b", "b/{version}"),
      line("c", "c/{version}"),
    ]);
    expect(pairs.map((p) => [p.a, p.b])).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ]);
  });
});

describe("overlap witness invariant", () => {
  const cases: Array<[string, string]> = [
    ["v{version}", "v{version}-rc"],
    ["v{version}", "{version}"],
    ["v{version}", "v{version}"],
    ["v{version}", "{version}v"],
    ["{version}-rc", "rc-{version}"],
    ["release/{version}", "release/{version}-hotfix"],
    ["v.{version}", "{version}"],
    ["{version}", "{version}"],
  ];

  it.each(cases)("%s vs %s yields a witness both patterns accept", (pa, pb) => {
    const pair = pairOf(line("a", pa), line("b", pb));
    expect(pair.verdict).toBe("overlapping");
    expect(pair.witness).toBeTypeOf("string");
    expect(compilePattern(pa).extract(pair.witness!)).not.toBeNull();
    expect(compilePattern(pb).extract(pair.witness!)).not.toBeNull();
  });
});

// Only pairs with short literals can be searched exhaustively: a candidate must
// be at least |prefix| + |suffix| + 1 characters before either pattern can match
// it, so long-prefix pairs such as "release/{version}" would make the search
// vacuous rather than convincing. Those rely on the verdict assertions above.
describe("disjoint verdicts survive exhaustive search", () => {
  const MAX_LENGTH = 5;
  const cases: Array<[string, string]> = [
    ["v{version}", "r{version}"],
    ["a/{version}", "b/{version}"],
    ["{version}-a", "{version}-b"],
    ["a{version}b", "b{version}a"],
  ];

  it.each(cases)(`%s and %s share no tag up to ${MAX_LENGTH} chars`, (pa, pb) => {
    const a = compilePattern(pa);
    const b = compilePattern(pb);
    expect(pairOf(line("a", pa), line("b", pb)).verdict).toBe("disjoint");

    // Guard against a silently vacuous search: the space must be able to hold
    // strings long enough for each pattern to match something.
    for (const p of [a, b]) {
      expect(p.prefix.length + p.suffix.length + 1).toBeLessThanOrEqual(MAX_LENGTH);
    }

    const alphabet = [
      ...new Set([...pa.replace("{version}", ""), ...pb.replace("{version}", ""), "0"]),
    ];
    let matchedEither = 0;
    for (const candidate of stringsUpTo(alphabet, MAX_LENGTH)) {
      const inA = a.extract(candidate) !== null;
      const inB = b.extract(candidate) !== null;
      expect(inA && inB, `"${candidate}" matched both patterns`).toBe(false);
      if (inA || inB) matchedEither += 1;
    }
    expect(matchedEither).toBeGreaterThan(0);
  });
});

/** Every non-empty string over `alphabet` up to `maxLength` characters. */
function* stringsUpTo(
  alphabet: readonly string[],
  maxLength: number,
): Generator<string> {
  let level = [""];
  for (let length = 1; length <= maxLength; length += 1) {
    const next: string[] = [];
    for (const stem of level) {
      for (const char of alphabet) {
        const candidate = stem + char;
        next.push(candidate);
        yield candidate;
      }
    }
    level = next;
  }
}
