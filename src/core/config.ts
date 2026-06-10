import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { TagsmithConfig } from "../types.js";

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

const configSchema = z.object({
  pattern: z.string().refine((p) => p.includes("{version}"), {
    message: "pattern must contain the {version} placeholder",
  }),
  model: z.discriminatedUnion("type", [
    semverModelSchema,
    calverModelSchema,
    buildModelSchema,
  ]),
  initialVersion: z.string().min(1),
  push: z.boolean().default(false),
});

export class ConfigError extends Error {}

/** Parse and validate a raw config object. Throws ConfigError on failure. */
export function parseConfig(raw: unknown): TagsmithConfig {
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Invalid ${CONFIG_FILENAME}:\n${issues}`);
  }
  return result.data;
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
    throw new ConfigError(
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
  const body = JSON.stringify(config, null, 2);
  await writeFile(file, `${body}\n`, "utf8");
}
