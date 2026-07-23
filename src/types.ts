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

/** The only built-in release artifact source in 0.8. */
export interface PackageJsonArtifact {
  type: "package-json";
}

export type ArtifactConfig = PackageJsonArtifact;

export type CommitReleaseLevel = "major" | "minor" | "patch";

/** One ordered Conventional Commit classification rule. */
export interface CommitPolicyRule {
  /** Optional human label included in recommendation evidence. */
  name?: string;
  /** Exact Conventional Commit type, e.g. feat or docs. */
  type?: string;
  /** Exact Conventional Commit scope, e.g. website. */
  scope?: string;
  /** Match only breaking (`!` or BREAKING CHANGE footer) when specified. */
  breaking?: boolean;
  /** Release level selected by this rule; mutually exclusive with ignore. */
  release?: CommitReleaseLevel;
  /** Explicitly exclude a matching commit from release recommendations. */
  ignore?: true;
}

/** Team-owned Conventional Commit classification, evaluated in declaration order. */
export interface CommitPolicy {
  rules: CommitPolicyRule[];
}

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
  /** Optional repository-relative workspace path for monorepo release checks. */
  workspace?: string;
  /** Optional manifest whose version must agree with this tag line. */
  artifact?: ArtifactConfig;
}

/** Optional local guardrails that decide whether a candidate tag may be created. */
export interface ReleasePolicy {
  /** Branch names (with * and ? glob support) that may create a release. */
  allowedBranches?: string[];
  /** Reject a candidate while any staged, unstaged, or untracked file exists. */
  requireCleanWorktree: boolean;
  /** Require the candidate to be created as an annotated tag. */
  requireAnnotatedTag: boolean;
  /** Require the candidate tag's resolved commit to equal HEAD. */
  requireHeadTag: boolean;
  /** Require Git to create a cryptographically signed tag. */
  signature: "optional" | "required";
  /** Require a configured artifact to agree with a candidate created under policy. */
  requireArtifactVersion: boolean;
}

/** 內部正規化後的設定:一律為多線結構。 */
export interface TagsmithConfig {
  lines: TagLine[];
  /** 預設線名,正規化後一定指向有效的 line.name。 */
  default: string;
  /** Optional release-time guardrails; absent means current behaviour is unchanged. */
  releasePolicy?: ReleasePolicy;
  /** Optional Conventional Commit mapping; absent keeps Tagsmith defaults. */
  commitPolicy?: CommitPolicy;
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
  | "duplicate-version" // another tag resolves to the same version
  | "ambiguous-assignment"; // matches more than one configured tag line
