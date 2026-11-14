import type { BuildResultFileRef } from "./types.js";

/** Execution evidence is a Result file, not an authored Output or generated asset. */
export async function preserveExecutionLog(
  chunks: AsyncIterable<Uint8Array> | undefined,
  write: (path: string, chunks: AsyncIterable<Uint8Array>, mediaType: string) => Promise<void>,
): Promise<BuildResultFileRef | undefined> {
  if (chunks === undefined) return undefined;
  let size = 0;
  const counted = (async function* () {
    for await (const chunk of chunks) { size += chunk.byteLength; yield chunk; }
  })();
  const path = "execution.jsonl";
  const mediaType = "application/x-ndjson";
  await write(path, counted, mediaType);
  return { kind: "build-file", path, size, mediaType };
}
