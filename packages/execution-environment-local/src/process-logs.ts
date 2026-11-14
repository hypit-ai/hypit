import { open } from "node:fs/promises";

/** PowerShell redirects a process's two streams to separate files. */
export function processErrorLogPath(logPath: string): string {
  return `${logPath.replace(/\.log$/u, "")}.err.log`;
}

async function readTail(path: string, maxBytes: number): Promise<string> {
  let file;
  try {
    file = await open(path, "r");
    const metadata = await file.stat();
    const length = Math.min(metadata.size, maxBytes);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, metadata.size - length);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
    throw error;
  } finally {
    await file?.close();
  }
}

/** Preserve stream identity; separate files do not establish an interleaved event order. */
export async function readProcessLogs(logPath: string, maxBytes: number): Promise<string> {
  const [output, errors] = await Promise.all([
    readTail(logPath, maxBytes),
    readTail(processErrorLogPath(logPath), maxBytes),
  ]);
  if (errors.length === 0) return output;
  return `${output}${output.length > 0 && !output.endsWith("\n") ? "\n" : ""}[stderr]\n${errors}`;
}
