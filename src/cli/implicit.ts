import type { ResolvedConfig } from "../core/config.js";
import { color, info } from "./ui.js";

/** Configuration provenance included in every versioned JSON result. */
export function configMetadata(
  resolved: ResolvedConfig,
): { source: ResolvedConfig["source"]; pattern?: string } {
  if (resolved.source === "file") return { source: "file" };
  const line = resolved.config.lines[0]!;
  return {
    source: resolved.source,
    pattern: line.pattern,
  };
}

/** One-time human notice that implicit semver defaults are in use. */
export function printImplicitConfigNotice(
  resolved: ResolvedConfig,
  json?: boolean,
): void {
  if (json || resolved.source === "file") return;
  const line = resolved.config.lines[0]!;
  const kind = resolved.source === "inferred" ? "inferred" : "default";
  info(
    `${color.dim("ℹ")} No ${color.bold(".tagsmith.json")} — using ${kind} semver defaults (pattern: ${line.pattern}).`,
  );
  info(
    `  ${color.dim("Run `tagsmith init` to customize, or commit .tagsmith.json for the team.")}`,
  );
}
