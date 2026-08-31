import type { BumpLevel, TagLine, VersionModel } from "../types.js";
import { compilePattern } from "./pattern.js";
import { analyzeTags, type Analysis } from "./analyze.js";
import { assertValidGitTagName } from "./git-tag.js";

export interface NextPlan {
  /** The full next tag name, e.g. "v1.2.4". */
  tag: string;
  /** The next version string (without pattern), e.g. "1.2.4". */
  version: string;
  /** The version this was derived from, or null when starting fresh. */
  fromVersion: string | null;
  /** Whether the initialVersion was used (no prior conforming tag). */
  fresh: boolean;
  analysis: Analysis;
}

export class PlanError extends Error {}

/**
 * Compute the next tag for the repo given existing tags. Guarantees the result
 * is strictly greater than the current highest conforming version.
 */
export function planNext(
  line: TagLine,
  model: VersionModel,
  existingTags: readonly string[],
  level: BumpLevel = "patch",
): NextPlan {
  const pattern = compilePattern(line.pattern);
  const analysis = analyzeTags(existingTags, pattern, model);

  if (analysis.latest === null) {
    const initial = model.initial(line.initialVersion);
    const tag = pattern.render(model.format(initial));
    assertValidGitTagName(tag);
    return {
      tag,
      version: model.format(initial),
      fromVersion: null,
      fresh: true,
      analysis,
    };
  }

  const current = analysis.latest.version;
  const next = model.bump(current, level);
  if (model.compare(next, current) <= 0) {
    throw new PlanError(
      `Bumping ${model.format(current)} by "${level}" did not increase the version.`,
    );
  }

  const tag = pattern.render(model.format(next));
  assertValidGitTagName(tag);
  return {
    tag,
    version: model.format(next),
    fromVersion: model.format(current),
    fresh: false,
    analysis,
  };
}

export interface ValidateOptions {
  allowOutOfOrder?: boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Validate that an explicit version is safe to create: it must parse, render
 * to a tag that does not already exist, and (unless overridden) be strictly
 * greater than the current highest conforming version.
 */
export function validateExplicit(
  line: TagLine,
  model: VersionModel,
  explicitVersion: string,
  existingTags: readonly string[],
  opts: ValidateOptions = {},
): ValidationResult {
  const pattern = compilePattern(line.pattern);
  const errors: string[] = [];

  const parsed = model.parse(explicitVersion);
  if (parsed === null) {
    errors.push(
      `Version "${explicitVersion}" is not valid for the ${model.type} model.`,
    );
    return { ok: false, errors };
  }

  const tagName = pattern.render(model.format(parsed));
  if (existingTags.includes(tagName)) {
    errors.push(`Tag "${tagName}" already exists.`);
  }

  const analysis = analyzeTags(existingTags, pattern, model);
  if (analysis.latest !== null && !opts.allowOutOfOrder) {
    if (model.compare(parsed, analysis.latest.version) <= 0) {
      errors.push(
        `Version "${model.format(parsed)}" is not greater than the latest "${model.format(analysis.latest.version)}". Use --allow-out-of-order to override.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
