import { loadConfig } from "../core/config.js";
import { compilePattern } from "../core/pattern.js";
import { createModel } from "../core/models/index.js";
import { analyzeTags } from "../core/analyze.js";
import { ensureRepo, listTags } from "../git/git.js";
import { color, info, printError, warn } from "./ui.js";

export interface ListFlags {
  json?: boolean;
}

export async function runList(cwd: string, flags: ListFlags): Promise<number> {
  try {
    const config = await loadConfig(cwd);
    await ensureRepo({ cwd });
    const pattern = compilePattern(config.pattern);
    const model = createModel(config.model);
    const tags = await listTags({ cwd });
    const analysis = analyzeTags(tags, pattern, model);

    if (flags.json) {
      info(
        JSON.stringify(
          {
            conforming: analysis.conforming.map((t) => ({
              tag: t.raw,
              version: t.versionString,
            })),
            anomalies: analysis.anomalies.map((t) => ({
              tag: t.raw,
              reason: t.anomaly,
            })),
            latest: analysis.latest?.raw ?? null,
          },
          null,
          2,
        ),
      );
      return 0;
    }

    if (analysis.conforming.length === 0 && analysis.anomalies.length === 0) {
      info("No tags found.");
      return 0;
    }

    info(color.bold("Conforming tags (newest first):"));
    if (analysis.conforming.length === 0) {
      info("  (none)");
    }
    analysis.conforming.forEach((t, i) => {
      const marker = i === 0 ? color.green(" ← latest") : "";
      info(`  ${color.cyan(t.raw)}${marker}`);
    });

    if (analysis.anomalies.length > 0) {
      info("");
      warn(`${analysis.anomalies.length} non-conforming tag(s):`);
      for (const t of analysis.anomalies) {
        info(`  ${color.yellow(t.raw)} ${color.dim(`(${t.anomaly})`)}`);
      }
    }
    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}
