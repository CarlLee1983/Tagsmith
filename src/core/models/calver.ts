import type { BumpLevel, VersionModel } from "../../types.js";

export interface CalverValue {
  year: number;
  month: number;
  day: number;
  micro: number;
}

export interface CalverOptions {
  format: string;
  /** Injected "today" so the model stays pure and testable. */
  now?: Date;
}

type Token = "YYYY" | "YY" | "MM" | "DD" | "MICRO";
const TOKEN_ORDER: Token[] = ["YYYY", "YY", "MM", "DD", "MICRO"];

/**
 * Calendar versioning. The `format` string is a sequence of tokens
 * (YYYY, YY, MM, DD, MICRO) joined by literal separators, e.g. "YYYY.MM.MICRO".
 * Bumping always rolls to the injected current date; MICRO increments when the
 * date is unchanged and resets otherwise.
 */
export function createCalverModel(opts: CalverOptions): VersionModel<CalverValue> {
  const tokens = parseFormatTokens(opts.format);
  const now = opts.now ?? new Date();

  const model: VersionModel<CalverValue> = {
    type: "calver",

    parse(raw: string): CalverValue | null {
      const { regex } = buildMatcher(opts.format, tokens);
      const m = regex.exec(raw);
      if (m === null || m.groups === undefined) return null;
      const g = m.groups;
      const value: CalverValue = {
        year: g.YYYY !== undefined
          ? Number(g.YYYY)
          : g.YY !== undefined
            ? 2000 + Number(g.YY)
            : 0,
        month: g.MM !== undefined ? Number(g.MM) : 0,
        day: g.DD !== undefined ? Number(g.DD) : 0,
        micro: g.MICRO !== undefined ? Number(g.MICRO) : 0,
      };
      if (value.month > 12 || value.day > 31) return null;
      // Reject anything that does not round-trip to its canonical form (e.g.
      // unpadded "2026.6.7" or leading-zero MICRO "...007"), so a non-canonical
      // tag can never masquerade as — or duplicate — a canonical one.
      if (renderTokens(opts.format, tokens, value) !== raw) return null;
      return value;
    },

    compare(a: CalverValue, b: CalverValue): number {
      return (
        a.year - b.year ||
        a.month - b.month ||
        a.day - b.day ||
        a.micro - b.micro
      );
    },

    format(v: CalverValue): string {
      return renderTokens(opts.format, tokens, v);
    },

    bump(v: CalverValue, _level: BumpLevel): CalverValue {
      const today = dateValue(now, tokens);
      const sameDate =
        today.year === v.year &&
        today.month === v.month &&
        today.day === v.day;
      if (!tokens.includes("MICRO")) {
        if (this.compare(today, v) <= 0) {
          throw new Error(
            `CalVer format "${opts.format}" has no MICRO token; cannot create a second tag for the same date period.`,
          );
        }
        return today;
      }
      // Same date → next MICRO. Future date → reset MICRO. If `today` is not
      // strictly after `v` (clock skew, or a future-dated latest tag), stay on
      // v's date and bump MICRO so the result is always strictly greater.
      if (sameDate) return { ...today, micro: v.micro + 1 };
      return this.compare(today, v) > 0
        ? { ...today, micro: 0 }
        : { ...v, micro: v.micro + 1 };
    },

    initial(raw: string): CalverValue {
      const parsed = this.parse(raw);
      if (parsed === null) {
        throw new Error(
          `initialVersion "${raw}" does not match calver format "${opts.format}".`,
        );
      }
      return parsed;
    },
  };

  return model;
}

function parseFormatTokens(format: string): Token[] {
  const found: Token[] = [];
  let i = 0;
  while (i < format.length) {
    const token = TOKEN_ORDER.find((t) => format.startsWith(t, i));
    if (token !== undefined) {
      found.push(token);
      i += token.length;
    } else {
      i += 1; // literal separator char
    }
  }
  if (found.length === 0) {
    throw new Error(`CalVer format "${format}" contains no recognised tokens.`);
  }
  return found;
}

// Fixed-width matchers prevent a greedy `\d+` from eating across an adjacent
// numeric token (e.g. format "YYYYMM" on "202606" must split 2026|06, not
// 20260|6). MICRO is the only unbounded token.
const TOKEN_REGEX: Record<Token, string> = {
  YYYY: "\\d{4}",
  YY: "\\d{2}",
  MM: "\\d{2}",
  DD: "\\d{2}",
  MICRO: "\\d+",
};

function buildMatcher(format: string, tokens: Token[]): { regex: RegExp } {
  let pattern = "";
  let i = 0;
  const used = new Set<Token>();
  while (i < format.length) {
    const token = tokens.find((t) => format.startsWith(t, i) && !used.has(t))
      ?? TOKEN_ORDER.find((t) => format.startsWith(t, i));
    if (token !== undefined && !used.has(token)) {
      used.add(token);
      pattern += `(?<${token}>${TOKEN_REGEX[token]})`;
      i += token.length;
    } else {
      pattern += escapeRegex(format[i] ?? "");
      i += 1;
    }
  }
  return { regex: new RegExp(`^${pattern}$`) };
}

function renderTokens(format: string, tokens: Token[], v: CalverValue): string {
  let out = "";
  let i = 0;
  const used = new Set<Token>();
  while (i < format.length) {
    const token = tokens.find((t) => format.startsWith(t, i) && !used.has(t));
    if (token !== undefined) {
      used.add(token);
      out += renderToken(token, v);
      i += token.length;
    } else {
      out += format[i] ?? "";
      i += 1;
    }
  }
  return out;
}

function renderToken(token: Token, v: CalverValue): string {
  switch (token) {
    case "YYYY":
      return String(v.year).padStart(4, "0");
    case "YY":
      return String(v.year % 100).padStart(2, "0");
    case "MM":
      return String(v.month).padStart(2, "0");
    case "DD":
      return String(v.day).padStart(2, "0");
    case "MICRO":
      return String(v.micro);
  }
}

function dateValue(now: Date, tokens: Token[]): CalverValue {
  return {
    year: tokens.some((t) => t === "YYYY" || t === "YY") ? now.getFullYear() : 0,
    month: tokens.includes("MM") ? now.getMonth() + 1 : 0,
    day: tokens.includes("DD") ? now.getDate() : 0,
    micro: 0,
  };
}

function escapeRegex(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
