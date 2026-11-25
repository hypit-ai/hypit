import { blobTypes } from "@hypit/hypit/blob";
import { sealGraphFragment } from "@hypit/hypit/author";
import { exactModelMediaInputNames } from "@hypit/generation/model";
import type { ExactModelEndpoint } from "@hypit/generation/model";
import { samSegmentProducers } from "./index.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * Segment N authored objects from one clip.
 *
 * The endpoint returns a mask video per object, in the authored order. Each object is selected by
 * its own ordinal-specific producer, so the fragment exports one Blob per concept: `person` is the
 * first mask, `ball` the second, and none of them is "the primary mask of a clip that contains
 * several objects". A mask nobody selects is never materialized, exactly as with the cutout's
 * compatibility copy.
 */
export function createSamSegmentFragment(endpoint: ExactModelEndpoint, slugs: readonly string[]) {
  if (slugs.length === 0) throw new Error("SAM segment fragment needs at least one object");
  const names = exactModelMediaInputNames("source");
  return sealGraphFragment({
    inputs: [
      { name: "draft", type: endpoint.draftType },
      { name: names.binding, type: endpoint.mediaBindings.source!.type },
      { name: names.artifact, type: blobTypes.blob },
    ],
    operations: [
      {
        id: "bind:0001:source",
        producer: endpoint.mediaBindings.source!.producer,
        inputs: {
          draft: input("draft"),
          binding: input(names.binding),
          artifact: input(names.artifact),
        },
        result: { kind: "output", name: "draft" },
      },
      {
        id: "finalize-request",
        producer: endpoint.finalizeProducer,
        inputs: { draft: operation("bind:0001:source") },
        result: { kind: "output", name: "request" },
      },
      {
        id: "generate",
        producer: endpoint.producer,
        inputs: { request: operation("finalize-request") },
        result: { kind: "need", name: "generation" },
      },
      ...slugs.map((_slug, index) => {
        const ordinal = index + 1;
        return {
          id: `select-mask:${String(ordinal).padStart(4, "0")}`,
          producer: samSegmentProducers.maskAt(ordinal),
          inputs: { set: operation("generate") },
          result: { kind: "output" as const, name: "mask" },
        };
      }),
    ],
    exports: slugs.map((slug, index) => ({
      name: slug,
      type: blobTypes.blob,
      root: operation(`select-mask:${String(index + 1).padStart(4, "0")}`),
    })),
  });
}
