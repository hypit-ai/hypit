import { blobTypes } from "@hypit/hypit/blob";
import { sealGraphFragment } from "@hypit/hypit/author";
import { generationProducers } from "@hypit/generation";
import { exactModelMediaInputNames } from "@hypit/generation/model";
import type { ExactModelEndpoint } from "@hypit/generation/model";
import { samCutoutProducers } from "./index.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * Keep the remote GeneratedVideoSet atomic, then expose two ordinary Blobs from it:
 * `video` is the primary artifact and `alternate` is the compatibility copy the provider may have
 * encoded alongside it. Selecting both in one fragment is what makes a second artifact reachable —
 * a set entry nobody selects is never materialized.
 */
export function createSamCutoutFragment(endpoint: ExactModelEndpoint) {
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
      {
        id: "select-primary-video",
        producer: generationProducers.primaryVideo,
        inputs: { set: operation("generate") },
        result: { kind: "output", name: "video" },
      },
      {
        id: "select-alternate-video",
        producer: samCutoutProducers.alternate,
        inputs: { set: operation("generate") },
        result: { kind: "output", name: "alternate" },
      },
    ],
    exports: [
      { name: "video", type: blobTypes.blob, root: operation("select-primary-video") },
      { name: "alternate", type: blobTypes.blob, root: operation("select-alternate-video") },
    ],
  });
}
