import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { TagLine, TagsmithConfig, ModelConfig } from "../types.js";

export const CONFIG_FILENAME = ".tagsmith.json";

const semverModelSchema = z.object({
  type: z.literal("semver"),
  allowPrerelease: z.boolean().optional(),
});

const calverModelSchema = z.object({
  type: z.literal("calver"),
  format: z.string().min(1),
});

const buildModelSchema = z.object({
  type: z.literal("build"),
  padding: z.number().int().min(0).optional(),
});

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

const lineSchema = z.object({
  name: z.string().min(1),
  pattern: patternSchema,
  model: modelSchema,
  initialVersion: z.string().min(1),
  push: z.boolean().default(false),
});

const multiConfigSchema = z.object({
  tags: z.array(lineSchema).min(1),
  default: z.string().optional(),
});

const legacyConfigSchema = z.object({
  pattern: patternSchema,
  model: modelSchema,
  initialVersion: z.string().min(1),
  push: z.boolean().default(false),
});

export class ConfigError extends Error {}
/** Thrown by loadConfig when no config file exists (vs. a malformed one). */
export class MissingConfigError extends ConfigError {}

/** Parse, normalise and validate a raw config. Throws ConfigError on failure. */
export function parseConfig(raw: unknown): TagsmithConfig {
  const isMulti =
    typeof raw === "object" && raw !== null && "tags" in (raw as object);

  if (isMulti) {
    const result = multiConfigSchema.safeParse(raw);
    if (!result.success) throw configError(result.error);
    return finalizeMulti(result.data.tags as TagLine[], result.data.default);
  }

  const result = legacyConfigSchema.safeParse(raw);
  if (!result.success) throw configError(result.error);
  const line: TagLine = {
    name: "default",
    pattern: result.data.pattern,
    model: result.data.model as ModelConfig,
    initialVersion: result.data.initialVersion,
    push: result.data.push,
  };
  return { lines: [line], default: "default" };
}

function finalizeMulti(lines: TagLine[], def: string | undefined): TagsmithConfig {
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
  return { lines, default: resolvedDefault };
}

function configError(error: z.ZodError): ConfigError {
  const issues = error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
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
    })),
    default: config.default,
  };
  // Never persist a broken config: validate the on-disk shape first.
  parseConfig(fileShape);
  const body = JSON.stringify(fileShape, null, 2);
  await writeFile(file, `${body}\n`, "utf8");
}
