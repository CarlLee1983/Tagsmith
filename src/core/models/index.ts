import type { ModelConfig, VersionModel } from "../../types.js";
import { createSemverModel } from "./semver.js";
import { createCalverModel } from "./calver.js";
import { createBuildModel } from "./build.js";

export { createSemverModel } from "./semver.js";
export { createCalverModel } from "./calver.js";
export { createBuildModel } from "./build.js";

export interface ModelFactoryOptions {
  /** Injected current date for calver; ignored by other models. */
  now?: Date;
}

/** Construct the version model described by a config block. */
export function createModel(
  config: ModelConfig,
  opts: ModelFactoryOptions = {},
): VersionModel {
  switch (config.type) {
    case "semver":
      return createSemverModel({ allowPrerelease: config.allowPrerelease });
    case "calver":
      return createCalverModel({ format: config.format, now: opts.now });
    case "build":
      return createBuildModel({ padding: config.padding });
    default: {
      const exhaustive: never = config;
      throw new Error(`Unknown model type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
