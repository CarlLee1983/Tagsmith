import type { ResolvedConfig } from "../core/config.js";
import { color, info } from "./ui.js";

/** Extra JSON fields when config was inferred rather than loaded from disk. */
export function implicitConfigJson(resolved: ResolvedConfig): Record<string, string> {
  if (resolved.source === "file") return {};
  const line = resolved.config.lines[0]!;
  return {
    configSource: resolved.source,
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
