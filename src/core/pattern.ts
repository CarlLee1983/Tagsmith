const PLACEHOLDER = "{version}";

export class PatternError extends Error {}

/**
 * A tag pattern is a template containing exactly one `{version}` placeholder,
 * e.g. "v{version}" or "release/{version}". This compiles it into a matcher
 * that can extract the version substring and re-render full tag names.
 */
export interface CompiledPattern {
  readonly template: string;
  /** Literal text before the placeholder; a tag must start with it. */
  readonly prefix: string;
  /** Literal text after the placeholder; a tag must end with it. */
  readonly suffix: string;
  /** Extract the version substring from a tag name, or null if it doesn't match. */
  extract(tag: string): string | null;
  /** Render a full tag name from a version string. */
  render(version: string): string;
}

export function compilePattern(template: string): CompiledPattern {
  const first = template.indexOf(PLACEHOLDER);
  if (first === -1) {
    throw new PatternError(
      `Pattern "${template}" must contain the ${PLACEHOLDER} placeholder.`,
    );
  }
  if (template.indexOf(PLACEHOLDER, first + PLACEHOLDER.length) !== -1) {
    throw new PatternError(
      `Pattern "${template}" must contain ${PLACEHOLDER} exactly once.`,
    );
  }

  const prefix = template.slice(0, first);
  const suffix = template.slice(first + PLACEHOLDER.length);
  // The version capture is non-greedy-safe because prefix/suffix are anchored.
  const regex = new RegExp(
    `^${escapeRegex(prefix)}(.+)${escapeRegex(suffix)}$`,
  );

  return {
    template,
    prefix,
    suffix,
    extract(tag: string): string | null {
      const m = regex.exec(tag);
      return m === null ? null : (m[1] ?? null);
    },
    render(version: string): string {
      return `${prefix}${version}${suffix}`;
    },
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
