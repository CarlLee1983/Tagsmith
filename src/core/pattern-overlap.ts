import type { TagLine } from "../types.js";
import { compilePattern, type CompiledPattern } from "./pattern.js";

export type OverlapVerdict = "disjoint" | "overlapping";

/**
 * How a witness was obtained. `line-version` means one of the lines really
 * renders this tag today, so the collision is certain; `constructed` means the
 * languages intersect but only through a string no line is known to produce.
 */
export type WitnessSource = "line-version" | "constructed";

export interface OverlapPair {
  /** Line declared first in the configuration. */
  a: string;
  b: string;
  verdict: OverlapVerdict;
  /** Present on every `overlapping` pair; verified against both patterns. */
  witness?: string;
  witnessSource?: WitnessSource;
  /** The line and version that render the witness, for `line-version` only. */
  witnessOrigin?: { line: string; version: string };
}

export interface PatternOverlapReport {
  /** Every unordered line pair, in configuration declaration order. */
  pairs: OverlapPair[];
}

/** Thrown when an `overlapping` verdict cannot produce a verifiable witness. */
export class PatternOverlapInvariantError extends Error {}

/** Separates the two literal ends so a constructed witness is never empty. */
const FILLER = "0";

/**
 * Decide statically whether two tag lines can ever accept the same tag name,
 * before any conflicting tag exists.
 *
 * A pattern accepts exactly the strings that start with its prefix, end with
 * its suffix, and leave at least one character in between. Two such languages
 * intersect if and only if one prefix is a prefix of the other and one suffix
 * is a suffix of the other: necessary because a shared string must begin and
 * end with both literals, sufficient because `longerPrefix + FILLER +
 * longerSuffix` then belongs to both. The decision is therefore exact — no
 * pair is ever left undecided — and every positive verdict carries a witness
 * that is re-checked against both patterns before it is returned.
 *
 * Membership is pattern-only, exactly like `assignTagsToLines`: a witness need
 * not parse under either version model, or audit would disagree with the
 * assignment it reports on.
 *
 * Realizable witnesses come from each line's `initialVersion` alone. Observed
 * tag history cannot add anything: a line's conforming tags are by definition
 * the ones no other line matched, and re-rendering their extracted version
 * reproduces the very same tag. Bumped versions are excluded on purpose — the
 * CalVer model would have to be given a clock, and this module stays pure.
 */
export function analyzePatternOverlap(
  lines: readonly TagLine[],
): PatternOverlapReport {
  const compiled = lines.map((line) => compilePattern(line.pattern));
  const pairs: OverlapPair[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      pairs.push(
        evaluatePair(lines[i]!, compiled[i]!, lines[j]!, compiled[j]!),
      );
    }
  }

  return { pairs };
}

function evaluatePair(
  lineA: TagLine,
  a: CompiledPattern,
  lineB: TagLine,
  b: CompiledPattern,
): OverlapPair {
  const base = { a: lineA.name, b: lineB.name };

  if (!sharePrefix(a.prefix, b.prefix) || !shareSuffix(a.suffix, b.suffix)) {
    return { ...base, verdict: "disjoint" };
  }

  const realized =
    findRealizedWitness(lineA, a, b) ?? findRealizedWitness(lineB, b, a);
  if (realized !== null) {
    return {
      ...base,
      verdict: "overlapping",
      witness: realized.witness,
      witnessSource: "line-version",
      witnessOrigin: realized.origin,
    };
  }

  const witness = longer(a.prefix, b.prefix) + FILLER + longer(a.suffix, b.suffix);
  if (!matchesBoth(witness, a, b)) {
    throw new PatternOverlapInvariantError(
      `Patterns "${a.template}" and "${b.template}" were judged overlapping but "${witness}" does not match both.`,
    );
  }
  return { ...base, verdict: "overlapping", witness, witnessSource: "constructed" };
}

/** Find a tag `producer` really renders that the other pattern also accepts. */
function findRealizedWitness(
  producer: TagLine,
  producerPattern: CompiledPattern,
  other: CompiledPattern,
): { witness: string; origin: { line: string; version: string } } | null {
  const version = producer.initialVersion;
  const witness = producerPattern.render(version);
  if (!matchesBoth(witness, producerPattern, other)) return null;
  return { witness, origin: { line: producer.name, version } };
}

function matchesBoth(
  tag: string,
  a: CompiledPattern,
  b: CompiledPattern,
): boolean {
  return a.extract(tag) !== null && b.extract(tag) !== null;
}

function sharePrefix(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}

function shareSuffix(a: string, b: string): boolean {
  return a.endsWith(b) || b.endsWith(a);
}

function longer(a: string, b: string): string {
  return a.length >= b.length ? a : b;
}
