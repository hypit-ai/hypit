import {
  contractTypes,
  videoContractDependencies,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";

import { compileHyperframesImplementationDigest } from "./document.js";

export const hyperframesModuleRef = { name: "@svml/hyperframes", version: "0.0.0-dev" } as const;
export const hyperframesTypes = {
  document: { module: hyperframesModuleRef, name: "HyperframesDocument" },
} satisfies Record<string, TypeRef>;
export const hyperframesProducers = {
  compile: { module: hyperframesModuleRef, name: "compile-composition" },
} satisfies Record<string, ProducerRef>;

const digest = { kind: "string", minLength: 71, maxLength: 71 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
export const hyperframesDocumentSchema: ValueSchema = {
  kind: "object",
  fields: {
    contract: { schema: { kind: "literal", value: "svml.hyperframes-document@2" } },
    digest: { schema: digest },
    compositionDigest: { schema: digest },
    programSpaceDigest: { schema: digest },
    frameRate: { schema: {
      kind: "object",
      fields: {
        numerator: { schema: positiveInteger },
        denominator: { schema: positiveInteger },
      },
    } },
    frameCount: { schema: positiveInteger },
    canvas: { schema: {
      kind: "object",
      fields: {
        width: { schema: positiveInteger },
        height: { schema: positiveInteger },
      },
    } },
    artifactDigests: { schema: { kind: "array", items: digest } },
    html: { schema: { kind: "string", minLength: 1 } },
  },
};

export const hyperframesManifest: ModuleManifest = {
  format: "svml.module@0",
  name: hyperframesModuleRef.name,
  version: hyperframesModuleRef.version,
  dependencies: [videoContractDependencies.composition],
  types: [{ name: hyperframesTypes.document.name, schema: hyperframesDocumentSchema }],
  capabilities: [],
  surfaces: [],
  producers: [{
    name: hyperframesProducers.compile.name,
    inputs: [{ name: "composition", type: contractTypes.composition }],
    outputs: [{
      name: "document",
      type: hyperframesTypes.document,
      affinity: [
        { resultPointer: "/compositionDigest", input: "composition", inputPointer: "/digest" },
        { resultPointer: "/programSpaceDigest", input: "composition", inputPointer: "/programSpace/digest" },
        { resultPointer: "/frameRate/numerator", input: "composition", inputPointer: "/programSpace/frameRate/numerator" },
        { resultPointer: "/frameRate/denominator", input: "composition", inputPointer: "/programSpace/frameRate/denominator" },
        { resultPointer: "/canvas/width", input: "composition", inputPointer: "/canvas/width" },
        { resultPointer: "/canvas/height", input: "composition", inputPointer: "/canvas/height" },
      ],
    }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "@svml/hyperframes/compile",
      digest: compileHyperframesImplementationDigest,
    },
  }],
};

export const hyperframesManifestDigest = digestOf(hyperframesManifest);
