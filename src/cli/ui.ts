import pc from "picocolors";

/** Print an error to stderr in a consistent, friendly format. */
export function printError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${pc.red("✖")} ${message}\n`);
}

export function info(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

export function success(msg: string): void {
  process.stdout.write(`${pc.green("✔")} ${msg}\n`);
}

export function warn(msg: string): void {
  process.stdout.write(`${pc.yellow("!")} ${msg}\n`);
}

export const color = pc;
