import { compositionDependency, compositionTypes, VISUAL_IR_V1 } from "@hypit/composition";
import { compositableSurfaceSchema, mediaDependency, mediaTypes } from "@hypit/media";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { timelineDependency, timelineTypes } from "@hypit/timeline";

export const htmlProgramModuleRef = { name: "@hypit/html-program", version: "1" } as const;
export const htmlProgramTypes = {
  program: { module: htmlProgramModuleRef, name: "HtmlProgram" },
  frameImages: { module: htmlProgramModuleRef, name: "FrameImages" },
  /** Absolute z window a render pass may paint; `maxExclusive` is one past the last z. */
  zBand: { module: htmlProgramModuleRef, name: "PresentZBand" },
} satisfies Record<string, TypeRef>;
export const htmlProgramCapabilities = {
  rasterizeVisual: { module: htmlProgramModuleRef, name: "rasterize-visual" },
  rasterizeFrames: { module: htmlProgramModuleRef, name: "rasterize-frames" },
} satisfies Record<string, CapabilityRef>;
export const htmlProgramProducers = {
  compile: { module: htmlProgramModuleRef, name: "compile-composition" },
  compileBand: { module: htmlProgramModuleRef, name: "compile-composition-band" },
  requestVisual: { module: htmlProgramModuleRef, name: "request-visual" },
  requestVisualRange: { module: htmlProgramModuleRef, name: "request-visual-range" },
} satisfies Record<string, ProducerRef>;

const resource = { kind: "string", minLength: 5, maxLength: 256 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const nonNegativeInteger = { kind: "number", integer: true, minimum: 0 } as const;
export const htmlProgramSchema: ValueSchema = {
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
        artifact: { schema: { kind: "object", fields: {
          kind: { schema: { kind: "literal", value: "blob" } },
          resource: { schema: resource },
          size: { schema: nonNegativeInteger },
          mediaType: { schema: { kind: "string", minLength: 1 } },
        } } },
        usage: { schema: { kind: "oneOf", variants: [
          { kind: "object", fields: { kind: { schema: { kind: "literal", value: "always" } } } },
          { kind: "object", fields: {
            kind: { schema: { kind: "literal", value: "frames" } },
            spans: { schema: { kind: "array", minItems: 1, items: { kind: "object", fields: {
              startFrame: { schema: nonNegativeInteger },
              endFrameExclusive: { schema: positiveInteger },
            } } } },
          } },
        ] } },
      },
    } } },
    surfaces: { schema: { kind: "array", items: compositableSurfaceSchema } },
    frameSources: { schema: { kind: "array", items: { kind: "object", fields: {
      id: { schema: { kind: "string", minLength: 1 } },
      resource: { schema: resource },
      startFrame: { schema: nonNegativeInteger },
      endFrameExclusive: { schema: positiveInteger },
      sourceFrame: { schema: { kind: "object", fields: {
        numerator: { schema: nonNegativeInteger }, denominator: { schema: positiveInteger },
      } } },
      sourceRate: { schema: { kind: "object", fields: {
        numerator: { schema: { kind: "number", integer: true } }, denominator: { schema: positiveInteger },
      } } },
      sourceFrameRate: { schema: { kind: "object", fields: {
        numerator: { schema: positiveInteger }, denominator: { schema: positiveInteger },
      } } },
    } } } },
    html: { schema: { kind: "string", minLength: 1 } },
  },
};

export const htmlProgramManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: htmlProgramModuleRef.name,
  version: htmlProgramModuleRef.version,
  dependencies: [compositionDependency, mediaDependency, timelineDependency],
  types: [
    { name: htmlProgramTypes.program.name },
    { name: htmlProgramTypes.frameImages.name },
    { name: htmlProgramTypes.zBand.name },
  ],
  capabilities: [
    { name: htmlProgramCapabilities.rasterizeVisual.name, returns: mediaTypes.timelineVisual },
    { name: htmlProgramCapabilities.rasterizeFrames.name, returns: htmlProgramTypes.frameImages },
  ],
  producers: [{
    name: htmlProgramProducers.compileBand.name,
    inputs: [
      { name: "composition", type: compositionTypes.composition },
      { name: "timeline", type: timelineTypes.timeline },
      { name: "band", type: htmlProgramTypes.zBand },
    ],
    outputs: [{ name: "program", type: htmlProgramTypes.program }],
    needs: [],
  }, {
    name: htmlProgramProducers.compile.name,
    inputs: [
      { name: "composition", type: compositionTypes.composition },
      { name: "timeline", type: timelineTypes.timeline },
    ],
    outputs: [{ name: "program", type: htmlProgramTypes.program }],
    needs: [],
  }, {
    name: htmlProgramProducers.requestVisual.name,
    inputs: [{ name: "program", type: htmlProgramTypes.program }], outputs: [],
    needs: [{ name: "visual", capability: htmlProgramCapabilities.rasterizeVisual, returns: mediaTypes.timelineVisual }],
  }, {
    name: htmlProgramProducers.requestVisualRange.name,
    inputs: [{ name: "program", type: htmlProgramTypes.program }, { name: "range", type: mediaTypes.frameRange }], outputs: [],
    needs: [{ name: "visual", capability: htmlProgramCapabilities.rasterizeVisual, returns: mediaTypes.timelineVisual }],
  }],
};
