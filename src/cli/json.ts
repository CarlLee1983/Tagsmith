import {
  DIAGNOSTIC_CODES,
  type DiagnosticCode,
  type DiagnosticSeverity,
} from "../core/diagnostics.js";
import { info } from "./ui.js";

export const JSON_SCHEMA_VERSION = 1 as const;

export type JsonCommand = "list" | "check" | "next" | "audit" | "plan";
export type JsonDiagnosticSeverity = DiagnosticSeverity;

/** A stable, machine-readable explanation that never requires parsing text. */
export interface JsonDiagnostic {
  code: DiagnosticCode;
  severity: JsonDiagnosticSeverity;
  message: string;
  tag?: string;
  line?: string;
  lines?: string[];
  matches?: string[];
  path?: string;
}

export interface JsonEnvelope<T> {
  schemaVersion: typeof JSON_SCHEMA_VERSION;
  command: JsonCommand;
  /** False when diagnostics contain an error severity. */
  ok: boolean;
  data: T;
  diagnostics: JsonDiagnostic[];
}

/** Build the complete contract before output so tests and callers share one Interface. */
export function jsonEnvelope<T>(
  command: JsonCommand,
  data: T,
  diagnostics: readonly JsonDiagnostic[] = [],
): JsonEnvelope<T> {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    command,
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    data,
    diagnostics: [...diagnostics],
  };
}

/** Emit exactly one JSON document to stdout for automation callers. */
export function emitJson<T>(
  command: JsonCommand,
  data: T,
  diagnostics: readonly JsonDiagnostic[] = [],
): void {
  info(JSON.stringify(jsonEnvelope(command, data, diagnostics), null, 2));
}

/** Preserve the JSON-only invariant even when a command cannot complete. */
export function emitJsonError(command: JsonCommand, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  emitJson(command, null, [{
    code: diagnosticCode(err),
    severity: "error",
    message,
  }]);
}

function diagnosticCode(err: unknown): DiagnosticCode {
  if (typeof err !== "object" || err === null || !("diagnosticCode" in err)) {
    return "command-error";
  }
  const code = err.diagnosticCode;
  return (DIAGNOSTIC_CODES as readonly unknown[]).includes(code)
    ? code as DiagnosticCode
    : "command-error";
}
