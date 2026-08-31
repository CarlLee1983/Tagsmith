import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type {
  ArtifactConfig,
  CommitPolicy,
  ModelConfig,
  TagLine,
  TagsmithConfig,
} from "../types.js";
import { DEFAULT_SEMVER_LINE } from "./defaults.js";
import { CONFIG_FILENAME } from "./constants.js";
import { hasConformingTag, inferPattern } from "./infer.js";
import { createModel } from "./models/index.js";
import { releasePolicySchema } from "./release-policy/schema.js";
import { commitPolicySchema } from "./commit-policy/schema.js";
import { mergePolicySchema } from "./merge-policy/schema.js";
import { assertValidGitTagName } from "./git-tag.js";
import { compilePattern } from "./pattern.js";

export { CONFIG_FILENAME } from "./constants.js";

const semverModelSchema = z.object({
  type: z.literal("semver"),
  allowPrerelease: z.boolean().optional(),
}).strict();

const calverModelSchema = z.object({
  type: z.literal("calver"),
  format: z.string().min(1),
}).strict();

const buildModelSchema = z.object({
  type: z.literal("build"),
  padding: z.number().int().min(0).optional(),
}).strict();

const modelSchema = z.discriminatedUnion("type", [
  semverModelSchema,
  calverModelSchema,
  buildModelSchema,
]);

const patternSchema = z
  .string()
  .refine((p) => p.includes("{version}"), {
    message: "pattern must contain the {version} placeholder",
  });

const workspaceSchema = z
  .string()
  .min(1)
  .refine(isSafeWorkspacePath, {
    message: "workspace must be a relative path inside the repository",
  });

const artifactSchema = z.object({
  type: z.literal("package-json"),
}).strict();

const lineSchema = z.object({
  name: z.string().min(1),
  pattern: patternSchema,
  model: modelSchema,
  initialVersion: z.string().min(1),
  push: z.boolean().default(false),
  workspace: workspaceSchema.optional(),
  artifact: artifactSchema.optional(),
}).strict();

const multiConfigSchema = z.object({
  $schema: z.string().optional(),
  tags: z.array(lineSchema).min(1),
  default: z.string().optional(),
  mergePolicy: mergePolicySchema.optional(),
  releasePolicy: releasePolicySchema.optional(),
  commitPolicy: commitPolicySchema.optional(),
}).strict();

const legacyConfigSchema = z.object({
  $schema: z.string().optional(),
  pattern: patternSchema,
  model: modelSchema,
  initialVersion: z.string().min(1),
  push: z.boolean().default(false),
  workspace: workspaceSchema.optional(),
  artifact: artifactSchema.optional(),
  mergePolicy: mergePolicySchema.optional(),
  releasePolicy: releasePolicySchema.optional(),
  commitPolicy: commitPolicySchema.optional(),
}).strict();

export class ConfigError extends Error {}
/** Thrown by loadConfig when no config file exists (vs. a malformed one). */
export class MissingConfigError extends ConfigError {}

export type ConfigSource = "file" | "inferred" | "default";

export interface ResolvedConfig {
  config: TagsmithConfig;
  source: ConfigSource;
}

/** Build semver defaults, inferring pattern from existing tag names when possible. */
export function buildImplicitConfig(tags: readonly string[]): ResolvedConfig {
  const model = createModel(DEFAULT_SEMVER_LINE.model);
  const pattern = inferPattern(tags, model);
  const line: TagLine = { ...DEFAULT_SEMVER_LINE, pattern };
  const config: TagsmithConfig = { lines: [line], default: "default" };
  const source: ConfigSource =
    tags.length > 0 && hasConformingTag(tags, pattern, model)
      ? "inferred"
      : "default";
  return { config, source };
}

/** Parse, normalise and validate a raw config. Throws ConfigError on failure. */
export function parseConfig(raw: unknown): TagsmithConfig {
  const isMulti =
    typeof raw === "object" &&
    raw !== null &&
    Array.isArray((raw as Record<string, unknown>)["tags"]);

  if (isMulti) {
    const result = multiConfigSchema.safeParse(raw);
    if (!result.success) throw configError(result.error);
    return finalizeMulti(
      result.data.tags as TagLine[],
      result.data.default,
      result.data.releasePolicy,
      result.data.commitPolicy as CommitPolicy | undefined,
    );
  }

  const result = legacyConfigSchema.safeParse(raw);
  if (!result.success) throw configError(result.error);
  const line: TagLine = {
    name: "default",
    pattern: result.data.pattern,
    model: result.data.model as ModelConfig,
    initialVersion: result.data.initialVersion,
    push: result.data.push,
    workspace: result.data.workspace,
    artifact: result.data.artifact as ArtifactConfig | undefined,
  };
  assertInitialCandidate(line);
  return {
    lines: [line],
    default: "default",
    ...(result.data.releasePolicy === undefined
      ? {}
      : { releasePolicy: result.data.releasePolicy }),
    ...(result.data.commitPolicy === undefined
      ? {}
      : { commitPolicy: result.data.commitPolicy as CommitPolicy }),
  };
}

function finalizeMulti(
  lines: TagLine[],
  def: string | undefined,
  releasePolicy: TagsmithConfig["releasePolicy"],
  commitPolicy: TagsmithConfig["commitPolicy"],
): TagsmithConfig {
  for (const line of lines) assertInitialCandidate(line);
  const names = lines.map((l) => l.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) {
    throw new ConfigError(
      `Invalid ${CONFIG_FILENAME}:\n  - tags: duplicate line name(s): ${[...new Set(dupes)].join(", ")}`,
    );
  }
  // names is guaranteed non-empty because the zod schema has .min(1).
  const resolvedDefault = def ?? names[0]!;
  if (!names.includes(resolvedDefault)) {
    throw new ConfigError(
      `Invalid ${CONFIG_FILENAME}:\n  - default: "${resolvedDefault}" does not match any line name (${names.join(", ")})`,
    );
  }
  return {
    lines,
    default: resolvedDefault,
    ...(releasePolicy === undefined ? {} : { releasePolicy }),
    ...(commitPolicy === undefined ? {} : { commitPolicy }),
  };
}

function assertInitialCandidate(line: TagLine): void {
  const model = createModel(line.model);
  const initial = model.initial(line.initialVersion);
  assertValidGitTagName(compilePattern(line.pattern).render(model.format(initial)));
}

function isSafeWorkspacePath(workspace: string): boolean {
  if (path.isAbsolute(workspace) || path.win32.isAbsolute(workspace)) return false;
  return !workspace.split(/[\\/]+/).includes("..");
}

function configError(error: z.ZodError): ConfigError {
  const issues = error.issues
    .flatMap((issue) => {
      if (issue.code === "unrecognized_keys") {
        return issue.keys.map((key) =>
          `  - ${[...issue.path, key].join(".")}: ${issue.message}`
        );
      }
      return [`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`];
    })
    .join("\n");
  return new ConfigError(`Invalid ${CONFIG_FILENAME}:\n${issues}`);
}

export function configPath(cwd: string): string {
  return path.join(cwd, CONFIG_FILENAME);
}

export async function configExists(cwd: string): Promise<boolean> {
  try {
    await access(configPath(cwd));
    return true;
  } catch {
    return false;
  }
}

/** Load and validate the config from `cwd`. Throws ConfigError when missing. */
export async function loadConfig(cwd: string): Promise<TagsmithConfig> {
  const file = configPath(cwd);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new MissingConfigError(
      `No ${CONFIG_FILENAME} found in ${cwd}. Run \`tagsmith init\` first.`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new ConfigError(
      `${CONFIG_FILENAME} is not valid JSON: ${(err as Error).message}`,
    );
  }
  return parseConfig(json);
}

export async function writeConfig(
  cwd: string,
  config: TagsmithConfig,
): Promise<void> {
  const file = configPath(cwd);
  const fileShape = {
    tags: config.lines.map((l) => ({
      name: l.name,
      pattern: l.pattern,
      model: l.model,
      initialVersion: l.initialVersion,
      push: l.push,
      ...(l.workspace === undefined ? {} : { workspace: l.workspace }),
      ...(l.artifact === undefined ? {} : { artifact: l.artifact }),
    })),
    default: config.default,
    ...(config.releasePolicy === undefined
      ? {}
      : { releasePolicy: config.releasePolicy }),
    ...(config.commitPolicy === undefined
      ? {}
      : { commitPolicy: config.commitPolicy }),
  };
  // Never persist a broken config: validate the on-disk shape first.
  parseConfig(fileShape);
  const body = JSON.stringify(fileShape, null, 2);
  await writeFile(file, `${body}\n`, "utf8");
}
