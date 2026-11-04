import { mediaDependency, mediaTypes, pictureInterpretationSchema, preparedVisualSourceSchema } from "@hypit/media";
import { blobRefSchema } from "@hypit/hypit/protocol";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { frameSpanSchema, temporalDependency, temporalMapSchema, temporalTypes } from "@hypit/temporal";

export const htmlProgramModuleRef = { name: "@hypit/html-program", version: "1" } as const;
export const htmlProgramTypes = {
  program: { module: htmlProgramModuleRef, name: "HtmlProgram" },
  frameImages: { module: htmlProgramModuleRef, name: "FrameImages" },
} satisfies Record<string, TypeRef>;
export const htmlProgramCapabilities = {
  rasterizeVisual: { module: htmlProgramModuleRef, name: "rasterize-visual" },
  rasterizeFrames: { module: htmlProgramModuleRef, name: "rasterize-frames" },
} satisfies Record<string, CapabilityRef>;
export const htmlProgramProducers = {
  requestVisual: { module: htmlProgramModuleRef, name: "request-visual" },
  requestVisualRange: { module: htmlProgramModuleRef, name: "request-visual-range" },
} satisfies Record<string, ProducerRef>;

const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const frameRateSchema = {
  kind: "object" as const,
  fields: {
    numerator: { schema: positiveInteger },
    denominator: { schema: positiveInteger },
  },
};
export const htmlProgramSchema: ValueSchema = {
  kind: "object",
  fields: {
    frameRate: { schema: frameRateSchema },
    frameCount: { schema: positiveInteger },
    canvas: { schema: {
      kind: "object",
      fields: {
        width: { schema: positiveInteger },
        height: { schema: positiveInteger },
      },
    } },
    artifacts: { schema: { kind: "array", items: { kind: "oneOf", variants: [
      { kind: "object", fields: {
        kind: { schema: { kind: "literal", value: "bytes" } },
        id: { schema: { kind: "string", minLength: 1 } },
        artifact: { schema: blobRefSchema() },
        usage: { schema: { kind: "oneOf", variants: [
          { kind: "object", fields: { kind: { schema: { kind: "literal", value: "never" } } } },
          { kind: "object", fields: { kind: { schema: { kind: "literal", value: "always" } } } },
          { kind: "object", fields: {
            kind: { schema: { kind: "literal", value: "frames" } },
            spans: { schema: { kind: "array", minItems: 1, items: frameSpanSchema } },
          } },
        ] } },
      } },
      { kind: "object", fields: {
        kind: { schema: { kind: "literal", value: "picture" } },
        id: { schema: { kind: "string", minLength: 1 } },
        artifact: { schema: blobRefSchema() },
        picture: { schema: pictureInterpretationSchema },
        usage: { schema: { kind: "oneOf", variants: [
          { kind: "object", fields: { kind: { schema: { kind: "literal", value: "never" } } } },
          { kind: "object", fields: { kind: { schema: { kind: "literal", value: "always" } } } },
          { kind: "object", fields: {
            kind: { schema: { kind: "literal", value: "frames" } },
            spans: { schema: { kind: "array", minItems: 1, items: frameSpanSchema } },
          } },
        ] } },
      } },
    ] } } },
    videoSources: { schema: { kind: "array", items: { kind: "object", fields: {
      id: { schema: { kind: "string", minLength: 1 } },
      elementId: { schema: { kind: "string", minLength: 1 } },
      kind: { schema: { kind: "literal", value: "media" } },
      ...(frameSpanSchema.kind === "object" ? frameSpanSchema.fields : {}),
      usage: { schema: { kind: "oneOf", variants: [
        { kind: "object", fields: { kind: { schema: { kind: "literal", value: "never" } } } },
        { kind: "object", fields: { kind: { schema: { kind: "literal", value: "always" } } } },
        { kind: "object", fields: { kind: { schema: { kind: "literal", value: "frames" } },
          spans: { schema: { kind: "array", minItems: 1, items: frameSpanSchema } } } },
      ] } },
      source: { schema: preparedVisualSourceSchema }, sampling: { schema: temporalMapSchema },
      reconstruction: { schema: { kind: "object", fields: {
        kind: { schema: { kind: "literal", value: "nearest" } },
      } }, optional: true },
    } } } },
    html: { schema: { kind: "string", minLength: 1 } },
  },
};

export const htmlProgramManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: htmlProgramModuleRef.name,
  version: htmlProgramModuleRef.version,
  dependencies: [mediaDependency, temporalDependency],
  types: [htmlProgramTypes.program.name, htmlProgramTypes.frameImages.name],
  capabilities: [
    { name: htmlProgramCapabilities.rasterizeVisual.name, returns: mediaTypes.timelineVisual },
    { name: htmlProgramCapabilities.rasterizeFrames.name, returns: htmlProgramTypes.frameImages },
  ],
  producers: [{
    name: htmlProgramProducers.requestVisual.name,
    inputs: [{ name: "program", type: htmlProgramTypes.program }, { name: "delivery", type: mediaTypes.visualDelivery }], result: { kind: "need" as const, name: "visual", capability: htmlProgramCapabilities.rasterizeVisual },
  }, {
    name: htmlProgramProducers.requestVisualRange.name,
    inputs: [{ name: "program", type: htmlProgramTypes.program }, { name: "delivery", type: mediaTypes.visualDelivery }, { name: "range", type: temporalTypes.frameSpan }], result: { kind: "need" as const, name: "visual", capability: htmlProgramCapabilities.rasterizeVisual },
  }],
};
