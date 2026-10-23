/** Provider-authored diagnostic text suitable for users; never credentials or request bodies. */
export type ExecutionDiagnostic = {
  readonly level: "info" | "warning" | "error";
  readonly message: string;
  readonly stream?: "stdout" | "stderr";
};

export type ExecutionLogEvent = { readonly endpoint: string } & (
  | { readonly kind: "started" | "completed" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "phase"; readonly phase: string }
  | ({ readonly kind: "diagnostic" } & ExecutionDiagnostic)
);

export type ExecutionLogRecord = ExecutionLogEvent & {
  readonly format: "hypit.execution-log@1";
  readonly time: number;
  readonly command: string;
};

export type ExecutionLogView = {
  readonly records: readonly ExecutionLogRecord[];
  readonly total: number;
};

function logObject(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Execution log record must be an object");
  }
  return value as Readonly<Record<string, unknown>>;
}

function logText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Execution log ${field} must be a non-empty string`);
  return value;
}

function decodeExecutionLogRecord(value: unknown): ExecutionLogRecord {
  const item = logObject(value);
  if (item.format !== "hypit.execution-log@1") throw new Error("Unsupported execution log format");
  if (typeof item.time !== "number" || !Number.isSafeInteger(item.time) || item.time < 0) {
    throw new Error("Execution log time must be a non-negative integer");
  }
  const evidence = {
    format: "hypit.execution-log@1" as const,
    time: item.time,
    endpoint: logText(item.endpoint, "endpoint"),
    command: logText(item.command, "command"),
  };
  if (item.kind === "started" || item.kind === "completed") return { ...evidence, kind: item.kind };
  if (item.kind === "failed") return { ...evidence, kind: "failed", message: logText(item.message, "message") };
  if (item.kind === "phase") return { ...evidence, kind: "phase", phase: logText(item.phase, "phase") };
  if (item.kind === "diagnostic") {
    if (item.level !== "info" && item.level !== "warning" && item.level !== "error") {
      throw new Error("Execution log diagnostic level is invalid");
    }
    if (item.stream !== undefined && item.stream !== "stdout" && item.stream !== "stderr") {
      throw new Error("Execution log diagnostic stream is invalid");
    }
    return {
      ...evidence,
      kind: "diagnostic",
      level: item.level,
      message: logText(item.message, "message"),
      ...(item.stream === undefined ? {} : { stream: item.stream }),
    };
  }
  throw new Error("Execution log kind is invalid");
}

/** Read a bounded tail without loading the whole log. Storage and transport remain caller-owned. */
export async function readExecutionLog(chunks: AsyncIterable<Uint8Array>, limit: number): Promise<ExecutionLogView> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Log line count must be a positive integer");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const records: ExecutionLogRecord[] = [];
  let pending = "";
  let total = 0;
  const consume = (line: string) => {
    if (!line.trim()) return;
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch (error) {
      throw new Error(`Execution log line is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const record = decodeExecutionLogRecord(value);
    records[total % limit] = record;
    total++;
  };
  for await (const chunk of chunks) {
    pending += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = pending.indexOf("\n")) >= 0) {
      consume(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
    }
  }
  // A running writer may still be appending its last record; only complete lines are visible.
  const offset = total > limit ? total % limit : 0;
  return { records: [...records.slice(offset), ...records.slice(0, offset)], total };
}
