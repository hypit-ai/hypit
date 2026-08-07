import {
  contractTypes,
  HYPERFRAMES_VISUAL_IR_V1,
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
const nonNegativeInteger = { kind: "number", integer: true, minimum: 0 } as const;
export const hyperframesDocumentSchema: ValueSchema = {
  kind: "object",
  fields: {
    contract: { schema: { kind: "literal", value: "svml.hyperframes-document@4" } },
    visualIr: { schema: { kind: "literal", value: HYPERFRAMES_VISUAL_IR_V1 } },
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
    artifacts: { schema: { kind: "array", items: {
      kind: "object",
      fields: {
        kind: { schema: { kind: "literal", value: "blob" } },
        digest: { schema: digest },
        size: { schema: nonNegativeInteger },
        mediaType: { schema: { kind: "string", minLength: 1 } },
      },
    } } },
    html: { schema: { kind: "string", minLength: 1 } },
  },
};

export const hyperframesManifest: ModuleManifest = {
  format: "svml.module@0",
  name: hyperframesModuleRef.name,
  version: hyperframesModuleRef.version,
  dependencies: [videoContractDependencies.composition, videoContractDependencies.programSpace],
  types: [{ name: hyperframesTypes.document.name, schema: hyperframesDocumentSchema }],
  capabilities: [],
  surfaces: [],
  producers: [{
    name: hyperframesProducers.compile.name,
    inputs: [
      { name: "composition", type: contractTypes.composition },
      { name: "space", type: contractTypes.programSpace },
    ],
    outputs: [{ name: "document", type: hyperframesTypes.document }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "@svml/hyperframes/compile",
      digest: compileHyperframesImplementationDigest,
    },
  }],
};

export const hyperframesManifestDigest = digestOf(hyperframesManifest);
