import type { BlobAttachment } from "@hypit/hypit/workspace";

export type MaterialRange = { readonly start: number; readonly endExclusive: number };

/** Preview media stays in its owning Workspace or Result until a consumer requests bytes. */
export type ServedFile = {
  readonly mediaType: string;
  readonly size: number;
  open(range?: MaterialRange): Promise<AsyncIterable<Uint8Array>>;
};

export function attachmentFile(attachment: BlobAttachment): ServedFile {
  return {
    mediaType: attachment.blob.mediaType,
    size: attachment.blob.size,
    async open(range) {
      if (range !== undefined && attachment.openRange !== undefined) return attachment.openRange(range);
      const stream = await attachment.open();
      if (range === undefined) return stream;
      return sliceStream(stream, range);
    },
  };
}

export function bytesFile(mediaType: string, bytes: Uint8Array): ServedFile {
  return {
    mediaType,
    size: bytes.byteLength,
    async open(range) {
      return (async function* () {
        yield range === undefined ? bytes : bytes.subarray(range.start, range.endExclusive);
      })();
    },
  };
}

async function* sliceStream(stream: AsyncIterable<Uint8Array>, range: MaterialRange) {
  let offset = 0;
  for await (const chunk of stream) {
    const start = Math.max(0, range.start - offset);
    const end = Math.min(chunk.byteLength, range.endExclusive - offset);
    if (end > start) yield chunk.subarray(start, end);
    offset += chunk.byteLength;
    if (offset >= range.endExclusive) return;
  }
}

/** Only deterministic Producers that actually consume a resource need its complete bytes. */
export async function materialBytes(file: ServedFile): Promise<Uint8Array> {
  const bytes = new Uint8Array(file.size);
  let offset = 0;
  for await (const chunk of await file.open()) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== file.size) throw new Error(`Studio material has ${offset} bytes, expected ${file.size}.`);
  return bytes;
}
