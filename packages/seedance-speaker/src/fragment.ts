import { artifactTypes } from "@svml/artifact";
import { contractTypes } from "@svml/contracts";
import { sealGraphFragment } from "@svml/elaborator";
import { generationProducers } from "@svml/generation";
import type { ExactModelEndpoint } from "@svml/model-kit";
import type { ProducerRef } from "@svml/protocol";
import { seedanceTypes } from "@svml/seedance";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createSeedanceSpeakerTakeFragment(
  endpoint: ExactModelEndpoint,
  compileRequestProducer: ProducerRef,
) {
  return sealGraphFragment({
    name: `@svml/seedance-speaker/${endpoint.key}-take@1`,
    inputs: [
      { name: "program", type: seedanceTypes.speechProgram },
      { name: "duration", type: contractTypes.speechDuration },
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
        affinity: [{
          resultPointer: "/digest",
          source: operation("generate"),
          sourcePointer: "/videos/0/digest",
        }],
        fidelity: "exact",
      },
    ],
  });
}
