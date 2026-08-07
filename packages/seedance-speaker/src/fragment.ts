import { speechTypes } from "@narratage/speech";
import { artifactTypes } from "@narratage/artifact";
import { sealGraphFragment } from "@narratage/elaborator";
import { generationProducers } from "@narratage/generation";
import type { ExactModelEndpoint } from "@narratage/model-kit";
import type { ProducerRef } from "@narratage/protocol";
import { seedanceTypes } from "@narratage/seedance";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createSeedanceSpeakerTakeFragment(
  endpoint: ExactModelEndpoint,
  compileRequestProducer: ProducerRef,
) {
  return sealGraphFragment({
    name: `@narratage/seedance-speaker/${endpoint.key}-take@1`,
    inputs: [
      { name: "program", type: seedanceTypes.speechSpine },
      { name: "duration", type: speechTypes.duration },
    ],
    operations: [
      {
        id: "compile-request",
        producer: compileRequestProducer,
        inputs: { program: input("program"), duration: input("duration") },
        result: { kind: "output", name: "request" },
      },
      {
        id: "generate",
        producer: endpoint.producer,
        inputs: { request: operation("compile-request") },
        result: { kind: "need", name: "generation", accepts: "exact" },
      },
      {
        id: "select-primary-video",
        producer: generationProducers.primaryVideo,
        inputs: { set: operation("generate") },
        result: { kind: "output", name: "video" },
      },
    ],
    exports: [
      {
        name: "video",
        type: artifactTypes.blob,
        root: operation("select-primary-video"),
        semanticInputs: ["program", "duration"],
        fidelity: "exact",
      },
    ],
  });
}
