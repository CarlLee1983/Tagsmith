import type { BumpLevel, VersionModel } from "../../types.js";

export interface BuildValue {
  n: number;
}

export interface BuildOptions {
  /** Zero-pad to this width (0 = none). */
  padding?: number;
}

/**
 * Monotonic build-number model: a single non-negative integer that only ever
 * increments. Any bump level advances it by one.
 */
export function createBuildModel(opts: BuildOptions = {}): VersionModel<BuildValue> {
  const padding = opts.padding ?? 0;

  return {
    type: "build",

    parse(raw: string): BuildValue | null {
      // Cap digits so the value stays within Number.MAX_SAFE_INTEGER; beyond
      // that, compare/bump lose precision and the monotonic invariant breaks.
      if (!/^\d{1,15}$/.test(raw)) return null;
      return { n: Number(raw) };
    },

    compare(a: BuildValue, b: BuildValue): number {
      return a.n - b.n;
    },

    format(v: BuildValue): string {
      return padding > 0 ? String(v.n).padStart(padding, "0") : String(v.n);
    },

    bump(v: BuildValue, _level: BumpLevel): BuildValue {
      return { n: v.n + 1 };
    },

    initial(raw: string): BuildValue {
      const parsed = this.parse(raw);
      if (parsed === null) {
        throw new Error(`initialVersion "${raw}" is not a valid build number.`);
      }
      return parsed;
    },
  };
}
