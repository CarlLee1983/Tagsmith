import type { ModelConfig, TagLine, TagsmithConfig } from "../types.js";

export const DEFAULT_SEMVER_MODEL: ModelConfig = {
  type: "semver",
  allowPrerelease: true,
};

export const DEFAULT_INITIAL_VERSION = "0.1.0";

export const DEFAULT_SEMVER_LINE: TagLine = {
  name: "default",
  pattern: "v{version}",
  model: DEFAULT_SEMVER_MODEL,
  initialVersion: DEFAULT_INITIAL_VERSION,
  push: false,
};

/** Hard-coded semver defaults when no config file and no inferrable tags exist. */
export function defaultConfig(): TagsmithConfig {
  return { lines: [{ ...DEFAULT_SEMVER_LINE }], default: "default" };
}
