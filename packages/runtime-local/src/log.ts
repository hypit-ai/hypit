import { createReadStream } from "node:fs";
import { appendFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { readExecutionLog } from "@hypit/runtime";
import type { ExecutionLogEvent, ExecutionLogRecord, ExecutionLogView } from "@hypit/runtime";

export type LocalExecutionLogs = {
  record(build: string, request: ExecutionLogRecord["request"], event: ExecutionLogEvent): Promise<void>;
  open(build: string): Promise<AsyncIterable<Uint8Array> | undefined>;
  read(build: string, lines: number): Promise<ExecutionLogView | undefined>;
};

/** Append-only Build evidence. Queues coordinate writes, not execution or historical lookup. */
export function fileExecutionLogs(workDirectory: (build: string) => string): LocalExecutionLogs {
  const pending = new Map<string, Promise<void>>();
  const failures = new Map<string, unknown>();
  const path = (build: string) => join(workDirectory(build), "execution.jsonl");
  const open = async (build: string): Promise<AsyncIterable<Uint8Array> | undefined> => {
    await pending.get(build);
    if (failures.has(build)) throw new Error(`Build ${build} execution log could not be saved`, { cause: failures.get(build) });
    try { await stat(path(build)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    // Open only when the Repository consumes the stream, so a failed destination opens no source handle.
    return (async function* () { yield* createReadStream(path(build)); })();
  };
  return {
    async record(build, request, event) {
      const record: ExecutionLogRecord = { ...event, format: "hypit.execution-log@1", time: Date.now(), request };
      const write = (pending.get(build) ?? Promise.resolve()).then(async () => {
        await mkdir(workDirectory(build), { recursive: true });
        await appendFile(path(build), `${JSON.stringify(record)}\n`, "utf8");
      }).catch((error) => { failures.set(build, error); });
      pending.set(build, write);
      await write;
      if (pending.get(build) === write) pending.delete(build);
    },
    open,
    async read(build, lines) {
      const chunks = await open(build);
      try { return chunks === undefined ? undefined : await readExecutionLog(chunks, lines); }
      catch (error) {
        // The Result may have finished and cleaned work between opening an active view and reading it.
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
  };
}
