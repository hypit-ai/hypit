import type { NodeCompiledSourceClosure } from "@hypit/compiler-node";
import type { AuthorElementProvenance, AuthorValueRef } from "@hypit/elaborator";
import type { ArtifactAttachment } from "@hypit/workspace";
import type { TypeRef } from "@hypit/protocol";

import type { Observations } from "./observe.js";
import type { Placement } from "./observe.js";

export type ServedFile = {
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly source?: string;
};

export type CompiledSource = {
  readonly compiled: NodeCompiledSourceClosure;
  readonly observations: Observations;
  readonly served: ReadonlyMap<string, ServedFile>;
  readonly exports: readonly {
    readonly name: string;
    readonly type: string;
    readonly typeRef: TypeRef;
    readonly ref: string;
  }[];
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
  const normalized = normalizeObservations(compiled, observations);
  const names = new Map(compiled.provenance.elements.flatMap((element) =>
    element.outputs.map((output) => [output.id, output.local] as const)));
  return {
    compiled,
    observations: normalized,
    served,
    exports: compiled.graph.outputs.map((item) => ({
      name: compiled.exports.find((candidate) => "id" in candidate.ref && candidate.ref.id === item.id)?.name
        ?? names.get(item.id)
        ?? item.id,
      type: item.type.name,
      typeRef: item.type,
      ref: item.id,
    })),
  };
}

function sameRange(
  left: { readonly start: number; readonly end: number },
  right: { readonly start: number; readonly end: number },
): boolean {
  return left.start === right.start && left.end === right.end;
}

function exactElement(
  compiled: NodeCompiledSourceClosure,
  sourcePath: string,
  range: { readonly start: number; readonly end: number },
): AuthorElementProvenance | undefined {
  return compiled.provenance.elements.find((element) =>
    element.sourceName === sourcePath && sameRange(element.range, range));
}

function resolvedRef(compiled: NodeCompiledSourceClosure, ref: AuthorValueRef): string | undefined {
  if (ref.kind === "record") return ref.id;
  return compiled.provenance.elements.flatMap((element) => element.outputs)
    .find((output) => output.component === ref.component && output.name === ref.output)?.id;
}

function decorate(
  compiled: NodeCompiledSourceClosure,
  sourcePath: string,
  range: { readonly start: number; readonly end: number },
): {
  readonly element?: AuthorElementProvenance;
  readonly records: ReadonlyMap<string, string>;
  readonly outputs: ReadonlyMap<string, string>;
  readonly references: Readonly<Record<string, string>>;
  readonly endpoints: Readonly<Record<string, string>>;
} {
  const element = exactElement(compiled, sourcePath, range);
  if (element === undefined) {
    return { records: new Map(), outputs: new Map(), references: {}, endpoints: {} };
  }
  return {
    element,
    records: new Map(element.records.map((record) => [record.local, record.id] as const)),
    outputs: new Map(element.outputs.map((output) => [output.local, output.id] as const)),
    references: Object.fromEntries(element.inputs.flatMap((input) => {
      if (input.ref === undefined) return [];
      const ref = resolvedRef(compiled, input.ref);
      return ref === undefined ? [] : [[input.name, ref]];
    })),
    endpoints: Object.fromEntries(element.inputs.map((input) => [input.name, input.id])),
  };
}

/** Join Studio presentation to compiler-owned identities without re-matching authored names. */
function normalizeObservations(
  compiled: NodeCompiledSourceClosure,
  observations: Observations,
): Observations {
  const placements: Placement[] = observations.placements.map((placement) => {
    const own = decorate(compiled, placement.sourcePath, placement.range);
    return {
      ...placement,
      ...(own.element === undefined ? {} : {
        authorElement: own.element.id,
        authorEndpoints: own.endpoints,
        resolvedReferenceAttributes: own.references,
        records: placement.records.map((id) => own.records.get(id) ?? id),
        outputs: placement.outputs.map((id) => own.outputs.get(id) ?? id),
        outputPorts: placement.outputPorts.map((port) => ({
          ...port,
          ref: own.outputs.get(port.ref) ?? port.ref,
        })),
        values: placement.values.map((value) => ({ ...value, id: own.records.get(value.id) ?? value.id })),
      }),
      children: placement.children.map((child) => {
        const held = decorate(compiled, child.sourcePath, child.range);
        return {
          ...child,
          ...(held.element === undefined ? {} : {
            authorElement: held.element.id,
            authorEndpoints: held.endpoints,
            resolvedReferenceAttributes: held.references,
            records: [...held.records.values()],
            outputs: [...held.outputs.values()],
            values: child.values.map((value) => ({ ...value, id: held.records.get(value.id) ?? value.id })),
          }),
        };
      }),
    };
  });
  return { placements, sourceMaps: observations.sourceMaps };
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
