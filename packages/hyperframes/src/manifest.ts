import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import { compositableSurfaceSchema, mediaDependency } from "@narratage/media";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { VISUAL_IR_V1 } from "@narratage/visual-ir";

export const hyperframesModuleRef = { name: "@narratage/hyperframes", version: "1" } as const;
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
    visualIr: { schema: { kind: "literal", value: VISUAL_IR_V1 } },
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
    surfaces: { schema: { kind: "array", items: compositableSurfaceSchema } },
    html: { schema: { kind: "string", minLength: 1 } },
  },
};

export const hyperframesManifest: ModuleManifest = {
  format: "narratage.module@1",
  name: hyperframesModuleRef.name,
  version: hyperframesModuleRef.version,
  dependencies: [compositionDependency, mediaDependency, programSpaceDependency],
  types: [{ name: hyperframesTypes.document.name }],
  capabilities: [],
  producers: [{
    name: hyperframesProducers.compile.name,
    inputs: [
      { name: "composition", type: compositionTypes.composition },
      { name: "space", type: programSpaceTypes.programSpace },
    ],
    outputs: [{ name: "document", type: hyperframesTypes.document }],
    needs: [],
  }],
};
