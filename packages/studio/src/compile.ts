import { readFileSync } from "node:fs";

import type { NodeCompiledSourceClosure } from "@hypit/compiler-node";
import type { ArtifactAttachment } from "@hypit/workspace";

import type { StudioDomain } from "./domain.js";
import type { Observations } from "./observe.js";
import { createObserver } from "./observe.js";

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

export class CompileFailure extends Error {
  readonly range: { readonly start: number; readonly end: number } | undefined;

  constructor(message: string, range?: { readonly start: number; readonly end: number }) {
    super(message);
    this.name = "CompileFailure";
    this.range = range;
  }
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

/**
 * Compile once through the official Node compiler. The observer wraps the
 * selected Markup Surfaces only to retain source-to-output provenance.
 */
export async function compileSource(entryPath: string, domain: StudioDomain): Promise<CompiledSource> {
  const observer = createObserver(domain.surfaces, (request) => {
    const found = domain.resolveModule(request.from);
    if (found === undefined) throw new CompileFailure(`No selected Source package satisfies ${request.from}.`);
    return found;
  });
  const compiler = domain.createCompiler(observer.surfaces);
  let compiled: NodeCompiledSourceClosure;
  try {
    compiled = await compiler.compileFile(entryPath);
  } catch (error) {
    const held = error as { readonly message?: string; readonly range?: { start: number; end: number } };
    const last = observer.observations().placements.at(-1);
    throw new CompileFailure(held.message ?? String(error), held.range ?? last?.range);
  }
  const served = new Map<string, ServedFile>();
  for (const attachment of compiled.attachments) {
    served.set(attachment.artifact.digest, {
      mediaType: attachment.artifact.mediaType,
      bytes: await bytesOf(attachment),
    });
  }
  return {
    compiled,
    observations: observer.observations(),
    served,
    exports: compiled.exports.flatMap((item) => {
      if (!("id" in item.ref)) return [];
      return [{ name: item.name, type: item.type.name, ref: item.ref.id }];
    }),
  };
}

export function sourceText(path: string): string {
  return readFileSync(path, "utf8");
}
