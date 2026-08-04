import {
  contractTypes,
  contractsManifestDigest,
  contractsModuleRef,
} from "@svml/contracts";
import { digestOf } from "@svml/core";
import type { ModuleManifest, ProducerRef } from "@svml/protocol";

export const captionModuleRef = { name: "@svml/caption", version: "0.0.0-dev" } as const;
export const captionProducers = {
  temporalize: { module: captionModuleRef, name: "temporalize-caption" },
} satisfies Record<string, ProducerRef>;
export const captionImplementationDigest = digestOf("@svml/caption/temporalize@1");

export const captionManifest: ModuleManifest = {
  format: "svml.module@0",
  name: captionModuleRef.name,
  version: captionModuleRef.version,
  dependencies: [{ module: contractsModuleRef, digest: contractsManifestDigest }],
  types: [],
  capabilities: [],
  surfaces: [],
  producers: [{
    name: captionProducers.temporalize.name,
    inputs: [
      { name: "narrative", type: contractTypes.narrative },
      { name: "map", type: contractTypes.completeSemanticMap },
    ],
    outputs: [{
      name: "caption",
      type: contractTypes.timedCaptionProjection,
      affinity: [
        { resultPointer: "/semanticIndexDigest", input: "narrative", inputPointer: "/semanticIndex/digest" },
        { resultPointer: "/speechTimeMapDigest", input: "map", inputPointer: "/mapDigest" },
      ],
    }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "@svml/caption/temporalize",
      digest: captionImplementationDigest,
    },
  }],
};
