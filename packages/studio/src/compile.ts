import type { NodeCompiledSourceClosure } from "@hypit/compiler-node";
import type { ArtifactAttachment } from "@hypit/workspace";

import type { Observations } from "./observe.js";

export type ServedFile = {
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly source?: string;
};

export type CompiledSource = {
  readonly compiled: NodeCompiledSourceClosure;
  readonly observations: Observations;
  readonly served: ReadonlyMap<string, ServedFile>;
  readonly exports: readonly { readonly name: string; readonly type: string; readonly ref: string }[];
};

/**
 * Attach Studio's observations to the exact Author compilation a Run was
 * resolved against. Keeping this conversion separate lets the Run compiler and
 * Studio share one Author graph instead of compiling two look-alike graphs.
 */
export async function observedCompiledSource(
  compiled: NodeCompiledSourceClosure,
  observations: Observations,
): Promise<CompiledSource> {
  const served = new Map<string, ServedFile>();
  for (const attachment of compiled.attachments) {
    served.set(attachment.artifact.digest, {
      mediaType: attachment.artifact.mediaType,
      bytes: await bytesOf(attachment),
    });
  }
  return {
    compiled,
    observations,
    served,
    exports: compiled.exports.flatMap((item) => {
      if (!("id" in item.ref)) return [];
      return [{ name: item.name, type: item.type.name, ref: item.ref.id }];
    }),
  };
}

async function bytesOf(attachment: ArtifactAttachment): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of await attachment.open()) {
    const copy = Uint8Array.from(chunk);
    chunks.push(copy);
    size += copy.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
