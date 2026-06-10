import * as p from "@clack/prompts";
import {
  CONFIG_FILENAME,
  configExists,
  parseConfig,
  writeConfig,
} from "../core/config.js";
import type { ModelConfig, TagsmithConfig } from "../types.js";
import { printError, success } from "./ui.js";
import { printNextStepsAfterInit } from "./guidance.js";

export interface InitFlags {
  pattern?: string;
  model?: string;
  initialVersion?: string;
  push?: boolean;
  force?: boolean;
  yes?: boolean;
  hints?: boolean;
}

/** Run the `init` command. Returns the process exit code. */
export async function runInit(cwd: string, flags: InitFlags): Promise<number> {
  if ((await configExists(cwd)) && flags.force !== true) {
    printError(`${CONFIG_FILENAME} already exists. Use --force to overwrite.`);
    return 1;
  }

  const config = flags.yes
    ? buildFromFlags(flags)
    : await promptForConfig(flags);

  if (config === null) {
    printError("Aborted.");
    return 1;
  }

  // Validate before writing so we never persist a broken config.
  const validated = parseConfig(config);
  await writeConfig(cwd, validated);
  success(`Wrote ${CONFIG_FILENAME}`);
  if (flags.hints !== false) printNextStepsAfterInit({});
  return 0;
}

function buildFromFlags(flags: InitFlags): TagsmithConfig {
  const modelType = (flags.model ?? "semver") as ModelConfig["type"];
  return {
    pattern: flags.pattern ?? "v{version}",
    model: defaultModel(modelType),
    initialVersion: flags.initialVersion ?? defaultInitial(modelType),
    push: flags.push ?? false,
  };
}

async function promptForConfig(flags: InitFlags): Promise<TagsmithConfig | null> {
  p.intro("tagsmith init");

  const pattern = await p.text({
    message: "Tag pattern (must contain {version})",
    initialValue: flags.pattern ?? "v{version}",
    validate: (v) =>
      v.includes("{version}") ? undefined : "Must contain {version}",
  });
  if (p.isCancel(pattern)) return null;

  const modelType = (await p.select({
    message: "Version model",
    initialValue: (flags.model ?? "semver") as ModelConfig["type"],
    options: [
      { value: "semver", label: "SemVer (1.2.3)" },
      { value: "calver", label: "CalVer (2026.06.0)" },
      { value: "build", label: "Build number (42)" },
    ],
  })) as ModelConfig["type"];
  if (p.isCancel(modelType)) return null;

  const model = await promptModelDetails(modelType);
  if (model === null) return null;

  const initialVersion = await p.text({
    message: "Initial version (used when no tag exists yet)",
    initialValue: flags.initialVersion ?? defaultInitial(modelType),
  });
  if (p.isCancel(initialVersion)) return null;

  const push = await p.confirm({
    message: "Push tags by default on create?",
    initialValue: flags.push ?? false,
  });
  if (p.isCancel(push)) return null;

  p.outro("Configured.");
  return { pattern, model, initialVersion, push };
}

async function promptModelDetails(
  type: ModelConfig["type"],
): Promise<ModelConfig | null> {
  if (type === "semver") {
    const allowPrerelease = await p.confirm({
      message: "Allow prerelease versions (e.g. 1.2.3-rc.1)?",
      initialValue: true,
    });
    if (p.isCancel(allowPrerelease)) return null;
    return { type: "semver", allowPrerelease };
  }
  if (type === "calver") {
    const format = await p.text({
      message: "CalVer format (tokens: YYYY YY MM DD MICRO)",
      initialValue: "YYYY.MM.MICRO",
    });
    if (p.isCancel(format)) return null;
    return { type: "calver", format };
  }
  const padding = await p.text({
    message: "Zero-pad build number to width (0 = none)",
    initialValue: "0",
    validate: (v) => (/^\d+$/.test(v) ? undefined : "Must be a number"),
  });
  if (p.isCancel(padding)) return null;
  return { type: "build", padding: Number(padding) };
}

function defaultModel(type: ModelConfig["type"]): ModelConfig {
  switch (type) {
    case "semver":
      return { type: "semver", allowPrerelease: true };
    case "calver":
      return { type: "calver", format: "YYYY.MM.MICRO" };
    case "build":
      return { type: "build", padding: 0 };
  }
}

function defaultInitial(type: ModelConfig["type"]): string {
  switch (type) {
    case "semver":
      return "0.1.0";
    case "calver":
      return "2026.06.0";
    case "build":
      return "1";
  }
}
