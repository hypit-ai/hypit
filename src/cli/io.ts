import { createWriteStream } from "node:fs";
import { link, mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";

export async function readJsonInput(path: string): Promise<unknown> {
  try {
    if (path !== "-") return JSON.parse(await readFile(path, "utf8"));
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const value of process.stdin) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      length += chunk.length;
      if (length > 1024 * 1024) throw new Error("Input exceeds one megabyte.");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  catch { throw new Error(`Could not read JSON input from ${path === "-" ? "stdin" : path}.`); }
}

export type CliResult = { readonly value: unknown; readonly text?: string; readonly failed?: boolean };

export async function writeNewFile(
  destination: string, bytes: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, signal: AbortSignal,
): Promise<void> {
  const temporary = await mkdtemp(join(dirname(destination), ".hypit-output-"));
  const file = join(temporary, "output");
  try {
    await pipeline(bytes, createWriteStream(file, { mode: 0o600, flags: "wx" }), { signal });
    signal.throwIfAborted();
    await link(file, destination);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
