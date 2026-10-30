import { compositionDependency, compositionTypes } from "@hypit/composition";
import { compositableSurfaceSchema, mediaDependency, mediaTypes, pictureInterpretationSchema, preparedVisualSourceSchema, workingPictureSpecSchema } from "@hypit/media";
import { blobRefSchema } from "@hypit/hypit/protocol";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { frameSpanSchema, timelineDependency, timelineTypes } from "@hypit/timeline";
import { temporalDependency, temporalMapSchema } from "@hypit/temporal";

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
  compile: { module: htmlProgramModuleRef, name: "compile-composition" },
  requestVisual: { module: htmlProgramModuleRef, name: "request-visual" },
  requestVisualRange: { module: htmlProgramModuleRef, name: "request-visual-range" },
} satisfies Record<string, ProducerRef>;

const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const nonNegativeInteger = { kind: "number", integer: true, minimum: 0 } as const;
export const htmlProgramSchema: ValueSchema = {
  kind: "object",
  fields: {
    picture: { schema: workingPictureSpecSchema },
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
    processPasses: { schema: nonNegativeInteger },
    artifacts: { schema: { kind: "array", items: {
      kind: "object",
      fields: {
        id: { schema: { kind: "string", minLength: 1 } },
        artifact: { schema: blobRefSchema() },
        picture: { schema: pictureInterpretationSchema, optional: true },
        usage: { schema: { kind: "oneOf", variants: [
          { kind: "object", fields: { kind: { schema: { kind: "literal", value: "always" } } } },
          { kind: "object", fields: {
            kind: { schema: { kind: "literal", value: "frames" } },
            spans: { schema: { kind: "array", minItems: 1, items: frameSpanSchema } },
          } },
        ] } },
      },
    } } },
    surfaces: { schema: { kind: "array", items: { kind: "object", fields: {
      artifactId: { schema: { kind: "string", minLength: 1 } },
      surface: { schema: compositableSurfaceSchema },
    } } } },
    videoSources: { schema: { kind: "array", items: { kind: "oneOf", variants: [{ kind: "object", fields: {
      id: { schema: { kind: "string", minLength: 1 } },
      documentPath: { schema: { kind: "array", items: { kind: "string", minLength: 1 } } },
      elementId: { schema: { kind: "string", minLength: 1 } },
      kind: { schema: { kind: "literal", value: "media" } },
      ...(frameSpanSchema.kind === "object" ? frameSpanSchema.fields : {}),
      source: { schema: preparedVisualSourceSchema }, sampling: { schema: temporalMapSchema },
      frameSelection: { optional: true, schema: { kind: "object", fields: {
        frameRate: { schema: { kind: "object", fields: {
          numerator: { schema: positiveInteger }, denominator: { schema: positiveInteger },
        } } },
        frames: { schema: { kind: "array", items: { kind: "oneOf", variants: [
          nonNegativeInteger, { kind: "literal", value: null },
        ] } } },
      } } },
    } }, { kind: "object", fields: {
      id: { schema: { kind: "string", minLength: 1 } },
      documentPath: { schema: { kind: "array", items: { kind: "string", minLength: 1 } } },
      elementId: { schema: { kind: "string", minLength: 1 } },
      kind: { schema: { kind: "literal", value: "surface" } },
      artifactId: { schema: { kind: "string", minLength: 1 } },
      ...(frameSpanSchema.kind === "object" ? frameSpanSchema.fields : {}),
      sourceFrame: { schema: { kind: "object", fields: {
        numerator: { schema: nonNegativeInteger }, denominator: { schema: positiveInteger },
      } } },
      sourceRate: { schema: { kind: "object", fields: {
        numerator: { schema: { kind: "number", integer: true } }, denominator: { schema: positiveInteger },
      } } },
      sourceFrameRate: { schema: { kind: "object", fields: {
        numerator: { schema: positiveInteger }, denominator: { schema: positiveInteger },
      } } },
    } }] } } },
    html: { schema: { kind: "string", minLength: 1 } },
  },
};

export const htmlProgramManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: htmlProgramModuleRef.name,
  version: htmlProgramModuleRef.version,
  dependencies: [compositionDependency, mediaDependency, temporalDependency, timelineDependency],
  types: [htmlProgramTypes.program.name, htmlProgramTypes.frameImages.name],
  capabilities: [
    { name: htmlProgramCapabilities.rasterizeVisual.name, returns: mediaTypes.timelineVisual },
    { name: htmlProgramCapabilities.rasterizeFrames.name, returns: htmlProgramTypes.frameImages },
  ],
  producers: [{
    name: htmlProgramProducers.compile.name,
    inputs: [{ name: "composition", type: compositionTypes.composition }],
    result: { kind: "output" as const, name: "program", type: htmlProgramTypes.program },
  }, {
    name: htmlProgramProducers.requestVisual.name,
    inputs: [{ name: "program", type: htmlProgramTypes.program }, { name: "delivery", type: mediaTypes.visualDelivery }], result: { kind: "need" as const, name: "visual", capability: htmlProgramCapabilities.rasterizeVisual },
  }, {
    name: htmlProgramProducers.requestVisualRange.name,
    inputs: [{ name: "program", type: htmlProgramTypes.program }, { name: "delivery", type: mediaTypes.visualDelivery }, { name: "range", type: timelineTypes.frameSpan }], result: { kind: "need" as const, name: "visual", capability: htmlProgramCapabilities.rasterizeVisual },
  }],
};
