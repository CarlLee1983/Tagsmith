/** Bump levels understood by version models. Not every model supports every level. */
export type BumpLevel = "major" | "minor" | "patch" | "prerelease" | "auto";

/**
 * A version model knows how to parse, compare, format and bump a particular
 * versioning scheme (semver, calver, build number…). Implementations are pure:
 * no IO, no clock access (the current date is injected where needed).
 */
export interface VersionModel<V = unknown> {
  readonly type: string;
  /** Parse a raw version string; return null when it does not conform. */
  parse(raw: string): V | null;
  /** Standard comparator: negative if a<b, 0 if equal, positive if a>b. */
  compare(a: V, b: V): number;
  /** Render a parsed version back to its canonical string. */
  format(v: V): string;
  /** Produce the next version for the given level. */
  bump(v: V, level: BumpLevel): V;
  /** Build the starting version from the config's initialVersion. */
  initial(raw: string): V;
}

export type ModelType = "semver" | "calver" | "build";

export interface SemverModelConfig {
  type: "semver";
  allowPrerelease?: boolean;
}

export interface CalverModelConfig {
  type: "calver";
  /** Format tokens: YYYY, YY, MM, DD, MICRO. e.g. "YYYY.MM.MICRO". */
  format: string;
}

export interface BuildModelConfig {
  type: "build";
  /** Zero-pad the number to this width (0 = no padding). */
  padding?: number;
}

export type ModelConfig =
  | SemverModelConfig
  | CalverModelConfig
  | BuildModelConfig;

/** 一條獨立的 tag 線:有自己的 pattern、版本模型、起始版本與 push 設定。 */
export interface TagLine {
  /** 線名,唯一,用於 CLI 選線。 */
  name: string;
  /** Tag 模板;MUST 含且僅含一個 `{version}`。 */
  pattern: string;
  model: ModelConfig;
  /** 無對應 tag 時的起始版本。 */
  initialVersion: string;
  /** 建立時是否預設 push。 */
  push: boolean;
}

/** 內部正規化後的設定:一律為多線結構。 */
export interface TagsmithConfig {
  lines: TagLine[];
  /** 預設線名,正規化後一定指向有效的 line.name。 */
  default: string;
}

/** A tag parsed against the configured pattern + model. */
export interface ParsedTag {
  /** Raw git tag name. */
  raw: string;
  /** Version substring extracted by the pattern, when it matched. */
  versionString: string | null;
  /** Parsed version value (model-specific), when parseable. */
  version: unknown | null;
  /** Why a tag is considered non-conforming, if so. */
  anomaly: TagAnomaly | null;
}

export type TagAnomaly =
  | "pattern-mismatch" // does not match the configured pattern
  | "unparseable-version" // matched pattern but version could not be parsed
  | "duplicate-version"; // another tag resolves to the same version
