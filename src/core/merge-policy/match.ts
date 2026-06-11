// src/core/merge-policy/match.ts

/** Convert a branch glob (`*`, `?`) into an anchored RegExp. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}

/** True when `branch` matches the glob `pattern`. */
export function matchSource(pattern: string, branch: string): boolean {
  return globToRegExp(pattern).test(branch);
}
