import type { ExecutionResourceSource, InvocationRequest } from "../index.js";
import { identity, integer, object, text } from "./values.js";

export const invocationContentType = "application/vnd.hypit.invocation";
const maxMetadata = 1024 * 1024;
const maxChunk = 64 * 1024;

export async function readExecutionJson(chunks: AsyncIterable<Uint8Array>): Promise<unknown> {
  const buffers: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of chunks) {
    size += chunk.length;
    if (size > maxMetadata) throw new Error("Execution request metadata exceeds one megabyte.");
    buffers.push(chunk);
  }
  return JSON.parse(Buffer.concat(buffers).toString("utf8")) as unknown;
}

function length(size: number): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(size);
  return header;
}

/** A JSON preface followed by each named resource in declaration order, using zero-length end frames. */
export async function* encodeInvocation(
  request: InvocationRequest, invocation: string | undefined, inputs: Readonly<Record<string, ExecutionResourceSource>>,
) {
  const entries = Object.entries(inputs);
  const metadata = Buffer.from(JSON.stringify({ request, invocation, inputs: entries.map(([name, { mediaType, size }]) =>
    ({ name, mediaType, size })) }));
  if (metadata.length > maxMetadata) throw new Error("Execution request metadata exceeds one megabyte.");
  yield length(metadata.length);
  yield metadata;
  for (const [, input] of entries) {
    for await (const bytes of input.bytes) {
      for (let offset = 0; offset < bytes.length; offset += maxChunk) {
        const chunk = bytes.subarray(offset, offset + maxChunk);
        yield length(chunk.length);
        yield chunk;
      }
    }
    yield length(0);
  }
}

class FrameReader {
  #rest: Uint8Array = new Uint8Array();
  constructor(readonly iterator: AsyncIterator<Uint8Array>) {}

  async frame(max: number): Promise<Buffer> {
    const size = (await this.#read(4)).readUInt32BE();
    if (size > max) throw new Error("Execution upload frame exceeds its size limit.");
    return await this.#read(size);
  }

  async #read(size: number): Promise<Buffer> {
    const result = Buffer.allocUnsafe(size);
    let offset = 0;
    while (offset < size) {
      if (this.#rest.length === 0) {
        const next = await this.iterator.next();
        if (next.done === true) throw new Error("Execution upload ended before its declared resources.");
        this.#rest = next.value;
      }
      const count = Math.min(size - offset, this.#rest.length);
      result.set(this.#rest.subarray(0, count), offset);
      this.#rest = this.#rest.subarray(count);
      offset += count;
    }
    return result;
  }

  async finish(): Promise<void> {
    if (this.#rest.length > 0) throw new Error("Unexpected bytes after Execution upload.");
    for (let next = await this.iterator.next(); next.done !== true; next = await this.iterator.next()) {
      if (next.value.length > 0) throw new Error("Unexpected bytes after Execution upload.");
    }
  }
}

export async function readInvocationUpload(iterator: AsyncIterator<Uint8Array>) {
  const reader = new FrameReader(iterator);
  const metadata: unknown = JSON.parse((await reader.frame(maxMetadata)).toString("utf8"));
  const { request, invocation, inputs } = object(metadata, "Execution upload", ["request", "invocation", "inputs"]);
  if (!Array.isArray(inputs)) throw new Error("Execution upload requires resource declarations.");
  const last = inputs.length - 1;
  const names = new Set<string>();
  const sources = Object.fromEntries(inputs.map((raw, index) => {
    const value = object(raw, "Input resource", ["name", "mediaType", "size"]);
    const name = identity(value.name, "Input resource name");
    if (names.has(name)) throw new Error(`Repeated input resource ${name}.`);
    names.add(name);
    const mediaType = text(value.mediaType, "Input media type");
    const size = value.size === undefined ? undefined : integer(value.size, "Input size", 0);
    async function* bytes() {
      for (let chunk = await reader.frame(maxChunk); chunk.length > 0; chunk = await reader.frame(maxChunk)) yield chunk;
      if (index === last) await reader.finish();
    }
    return [name, { mediaType, ...(size === undefined ? {} : { size }), bytes: bytes() } satisfies ExecutionResourceSource];
  }));
  if (inputs.length === 0) await reader.finish();
  return { request: request as InvocationRequest, inputs: sources,
    ...(invocation === undefined ? {} : { invocation: text(invocation, "Invocation id") }) };
}
