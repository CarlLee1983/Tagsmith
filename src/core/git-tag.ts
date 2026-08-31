const FORBIDDEN = /[\x00-\x20\x7f~^:?*\[\\]/u;

export class InvalidGitTagError extends Error {
  readonly diagnosticCode = "invalid-git-tag" as const;
}

/** Match Git's tag-ref rules plus the `git tag` leading-dash restriction. */
export function isValidGitTagName(name: string): boolean {
  if (
    name === "" ||
    name.startsWith("-") ||
    name.startsWith("/") ||
    name.endsWith("/") ||
    name.endsWith(".") ||
    name.includes("//") ||
    name.includes("..") ||
    name.includes("@{") ||
    FORBIDDEN.test(name)
  ) {
    return false;
  }
  return name.split("/").every((part) =>
    !part.startsWith(".") && !part.endsWith(".lock")
  );
}

export function assertValidGitTagName(name: string): void {
  if (!isValidGitTagName(name)) {
    throw new InvalidGitTagError(`${JSON.stringify(name)} is not a valid Git tag name.`);
  }
}
