import {
  buildImplicitConfig,
  configExists,
  loadConfig,
  type ResolvedConfig,
} from "../core/config.js";
import { ensureRepo, listTags } from "../git/git.js";

/**
 * Load `.tagsmith.json` when present; otherwise build semver defaults from
 * `hintTags` or the repo's existing tags.
 */
export async function resolveConfig(
  cwd: string,
  hintTags?: readonly string[],
): Promise<ResolvedConfig> {
  if (await configExists(cwd)) {
    return { config: await loadConfig(cwd), source: "file" };
  }
  if (hintTags !== undefined && hintTags.length > 0) {
    return buildImplicitConfig(hintTags);
  }
  await ensureRepo({ cwd });
  return buildImplicitConfig(await listTags({ cwd }));
}
