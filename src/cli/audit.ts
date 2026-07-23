import { auditTags } from "../core/audit.js";
import { ensureRepo, listTags } from "../git/git.js";
import { emitJson, emitJsonError } from "./json.js";
import { configMetadata, printImplicitConfigNotice } from "./implicit.js";
import { printError, info, success, warn } from "./ui.js";
import { resolveConfig } from "./resolve-config.js";

export interface AuditFlags {
  json?: boolean;
}

/** Audit all local tags without changing repository or remote state. */
export async function runAudit(cwd: string, flags: AuditFlags): Promise<number> {
  try {
    const resolved = await resolveConfig(cwd);
    await ensureRepo({ cwd });
    const report = auditTags(await listTags({ cwd }), resolved.config.lines);

    if (flags.json) {
      emitJson(
        "audit",
        { config: configMetadata(resolved), ...report },
        report.diagnostics,
      );
      return report.ok ? 0 : 1;
    }

    printImplicitConfigNotice(resolved);
    const errorCount = report.diagnostics.filter((item) => item.severity === "error").length;
    const warningCount = report.diagnostics.length - errorCount;
    for (const line of report.lines) {
      const latest = line.latest === null ? "none" : line.latest;
      info(`${line.line}: ${line.conforming.length} conforming tag(s); latest: ${latest}`);
    }
    for (const diagnostic of report.diagnostics) {
      const prefix = `[${diagnostic.code}] ${diagnostic.message}`;
      if (diagnostic.severity === "error") printError(prefix);
      else warn(prefix);
    }

    if (report.ok) {
      success(`Audit passed${warningCount === 0 ? "." : ` with ${warningCount} warning(s).`}`);
      return 0;
    }
    info(`Audit failed: ${errorCount} error(s), ${warningCount} warning(s).`);
    return 1;
  } catch (err) {
    if (flags.json) emitJsonError("audit", err);
    else printError(err);
    return 1;
  }
}
