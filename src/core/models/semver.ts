import semver from "semver";
import type { BumpLevel, VersionModel } from "../../types.js";

export interface SemverValue {
  /** Canonical semver string, e.g. "1.2.3" or "1.2.3-rc.1". */
  value: string;
}

export interface SemverOptions {
  allowPrerelease?: boolean;
}

/**
 * SemVer model backed by the `semver` package. Comparison and bumping follow
 * standard SemVer precedence, including prerelease handling.
 */
export function createSemverModel(opts: SemverOptions = {}): VersionModel<SemverValue> {
  const allowPrerelease = opts.allowPrerelease ?? true;

  return {
    type: "semver",

    parse(raw: string): SemverValue | null {
      const cleaned = semver.valid(raw, { loose: false });
      if (cleaned === null) return null;
      if (!allowPrerelease && semver.prerelease(cleaned) !== null) return null;
      return { value: cleaned };
    },

    compare(a: SemverValue, b: SemverValue): number {
      return semver.compare(a.value, b.value);
    },

    format(v: SemverValue): string {
      return v.value;
    },

    bump(v: SemverValue, level: BumpLevel): SemverValue {
      const release = toReleaseType(level);
      const next = semver.inc(v.value, release);
      if (next === null) {
        throw new Error(`Cannot bump semver "${v.value}" by "${level}".`);
      }
      return { value: next };
    },

    initial(raw: string): SemverValue {
      const parsed = this.parse(raw);
      if (parsed === null) {
        throw new Error(`initialVersion "${raw}" is not a valid semver.`);
      }
      return parsed;
    },
  };
}

function toReleaseType(level: BumpLevel): semver.ReleaseType {
  switch (level) {
    case "major":
      return "major";
    case "minor":
      return "minor";
    case "prerelease":
      return "prerelease";
    case "patch":
    case "auto":
      return "patch";
    default: {
      const exhaustive: never = level;
      throw new Error(`Unsupported semver bump level: ${String(exhaustive)}`);
    }
  }
}
