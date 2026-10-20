import type { TypeRef, TypedRecord } from "@hypit/protocol";
import type { StudioPlacement } from "@hypit/studio-companion";

import type { CompiledSource } from "../src/compile.js";

export function compiledSourceScenario(input: {
  readonly placements: readonly StudioPlacement[];
  readonly exports: readonly { readonly name: string; readonly ref: string; readonly type: TypeRef }[];
  readonly records?: readonly TypedRecord[];
  readonly recordNames?: readonly { readonly local: string; readonly id: string }[];
}): CompiledSource {
  const provenance = input.recordNames?.length ? [{
    id: "scenario::element",
    source: "main.svml",
    sourceName: "main.svml",
    frontend: "scenario.frontend@1",
    range: { start: 0, end: 1 },
    records: input.recordNames,
    components: [],
    outputs: [],
    inputs: [],
  }] : [];
  return {
    compiled: {
      closure: { entry: "main.svml", units: [] },
      program: { closure: { format: "hypit.closure@1", modules: [] }, records: input.records ?? [] },
      graph: {
        format: "hypit.graph@1",
        candidates: [],
        operations: [],
        outputs: input.exports.map((output) => ({
          id: output.ref,
          type: output.type,
          primary: `${output.ref}:candidate`,
        })),
      },
      exports: input.exports.map((output) => ({
        name: output.name,
        type: output.type,
        ref: { kind: "logical-output" as const, id: output.ref },
      })),
      provenance: { format: "hypit.author-provenance@1", elements: provenance },
      attachments: [],
    },
    observations: { placements: input.placements, temporalDomains: [] },
    served: new Map(),
    exports: input.exports.map((output) => ({
      name: output.name,
      ref: output.ref,
      type: output.type.name,
      typeRef: output.type,
    })),
  };
}
