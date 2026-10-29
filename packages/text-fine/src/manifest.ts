import { frameSpanSchema, timelineTypes, timelineDependency } from "@hypit/timeline";

import {
  compositionDependency,
  compositionTypes,
  visualTextDocumentSchema,
  visualTextFlowSchema,
  visualTextPaintSchema,
  visualTextSequenceSchema,
  visualTextTypographySchema,
} from "@hypit/composition";
import {
  spatialDependency,
  spatialFrameSchema,
  spatialPathSchema,
  spatialPointSchema,
  spatialTypes,
} from "@hypit/spatial";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { textDependency, textTypes } from "@hypit/hypit/text";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal";

export const textFineModuleRef = { name: "@hypit/text-fine", version: "1" } as const;
export const textFineTypes = {
  style: { module: textFineModuleRef, name: "TextStyle" },
  motion: { module: textFineModuleRef, name: "TextMotion" },
  pathMotion: { module: textFineModuleRef, name: "TextPathMotion" },
  flowPlacementPolicy: { module: textFineModuleRef, name: "TextFlowPlacementPolicy" },
  pointPlacementPolicy: { module: textFineModuleRef, name: "TextPointPlacementPolicy" },
  pathPlacementPolicy: { module: textFineModuleRef, name: "TextPathPlacementPolicy" },
  placement: { module: textFineModuleRef, name: "TextPlacement" },
  occurrence: { module: textFineModuleRef, name: "FineTextOccurrence" },
  itemSpec: { module: textFineModuleRef, name: "TextItemSpec" },
  plainItemSpec: { module: textFineModuleRef, name: "PlainTextItemSpec" },
  maskSpec: { module: textFineModuleRef, name: "TextMaskSpec" },
} satisfies Record<string, TypeRef>;

export const textFineProducers = {
  bindPoint: { module: textFineModuleRef, name: "bind-point-placement" },
  bindArea: { module: textFineModuleRef, name: "bind-area-placement" },
  bindPath: { module: textFineModuleRef, name: "bind-path-placement" },
  materializePlainItem: { module: textFineModuleRef, name: "materialize-plain-text-item" },
  createOccurrence: { module: textFineModuleRef, name: "create-fine-text-occurrence" },
  renderOccurrence: { module: textFineModuleRef, name: "render-fine-text-occurrence" },
  renderOccurrenceMask: { module: textFineModuleRef, name: "render-fine-text-mask" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const enumString = (values: readonly string[]): ValueSchema => ({ kind: "string", enum: values });

// Item motion is implemented by this package's HTML Programme. Composition does not
// publish a renderer-wide CSS vocabulary; the HTML owner validates declarations while lowering.
const styleDeclaration: ValueSchema = object({
  name: { schema: string },
  value: { schema: { kind: "oneOf", variants: [{ kind: "string" }, { kind: "number" }] } },
});
const visualKeyframe = object({
  atFrame: { schema: integer },
  easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]), optional: true },
  style: { schema: { kind: "array", minItems: 1, items: styleDeclaration } },
});
const visualAnimation = object({ keyframes: { schema: { kind: "array", minItems: 2, items: visualKeyframe } } });

const areaFlow = (() => {
  const schema = visualTextFlowSchema;
  if (schema.kind !== "object") throw new Error("Visual Text flow schema must be an object.");
  const { form: _form, ...fields } = schema.fields;
  return object(fields);
})();

export const textStyleSchema: ValueSchema = object({
  id: { schema: string },
  typography: { schema: visualTextTypographySchema },
  paints: { schema: { kind: "array", items: visualTextPaintSchema } },
});

export const textMotionSchema: ValueSchema = object({
  id: { schema: string },
  item: { schema: visualAnimation, optional: true },
  sequences: { schema: { kind: "array", items: visualTextSequenceSchema } },
});

export const textPathMotionSchema: ValueSchema = object({
  id: { schema: string },
  keyframes: { schema: { kind: "array", items: object({
    atFrame: { schema: integer }, startMarginPx: { schema: { kind: "number", minimum: 0 } },
    easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]), optional: true },
  }) } },
});

export const textFlowPlacementPolicySchema: ValueSchema = object({
  flow: { schema: areaFlow },
});
export const textPointPlacementPolicySchema: ValueSchema = object({
  anchorInline: { schema: enumString(["start", "center", "end"]) },
  anchorBlock: { schema: enumString(["start", "center", "end"]) },
});
export const textPathPlacementPolicySchema: ValueSchema = object({
  side: { schema: enumString(["left", "right"]) },
  orientation: { schema: enumString(["follow", "upright"]) },
  startMarginPx: { schema: { kind: "number", minimum: 0 } }, endMarginPx: { schema: { kind: "number", minimum: 0 } },
  align: { schema: enumString(["start", "center", "end"]) }, reverse: { schema: { kind: "boolean" } },
  overflow: { schema: enumString(["visible", "clip"]) },
});
export const textPlacementSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "flow" } }, frame: { schema: spatialFrameSchema }, flow: { schema: areaFlow } }),
  object({ kind: { schema: { kind: "literal", value: "point" } }, point: { schema: spatialPointSchema }, anchorInline: { schema: enumString(["start", "center", "end"]) }, anchorBlock: { schema: enumString(["start", "center", "end"]) } }),
  object({ kind: { schema: { kind: "literal", value: "path" } }, path: { schema: spatialPathSchema }, side: { schema: enumString(["left", "right"]) }, orientation: { schema: enumString(["follow", "upright"]) }, startMarginPx: { schema: { kind: "number", minimum: 0 } }, endMarginPx: { schema: { kind: "number", minimum: 0 } }, align: { schema: enumString(["start", "center", "end"]) }, reverse: { schema: { kind: "boolean" } }, overflow: { schema: enumString(["visible", "clip"]) }, marginMotion: { schema: textPathMotionSchema, optional: true } }),
] };
export const textItemSpecSchema: ValueSchema = object({
  id: { schema: string },
  document: { schema: visualTextDocumentSchema },
});
export const plainTextItemSpecSchema: ValueSchema = object({
  id: { schema: string },
});
export const fineTextOccurrenceSchema: ValueSchema = object({
  timelineId: { schema: string },
  id: { schema: string }, span: { schema: frameSpanSchema }, placement: { schema: textPlacementSchema },
  document: { schema: visualTextDocumentSchema }, style: { schema: textStyleSchema }, motion: { schema: textMotionSchema },
});


export const textFineManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: textFineModuleRef.name,
  version: textFineModuleRef.version,
  dependencies: [timelineDependency, spatialDependency, mediaDependency, compositionDependency, textDependency, temporalDependency],
  types: [
    textFineTypes.style.name,
    textFineTypes.motion.name,
    textFineTypes.pathMotion.name,
    textFineTypes.flowPlacementPolicy.name,
    textFineTypes.pointPlacementPolicy.name,
    textFineTypes.pathPlacementPolicy.name,
    textFineTypes.placement.name,
    textFineTypes.occurrence.name,
    textFineTypes.itemSpec.name,
    textFineTypes.plainItemSpec.name,
    textFineTypes.maskSpec.name,
  ],
  capabilities: [],
  producers: [
    { name: textFineProducers.materializePlainItem.name, inputs: [{ name: "spec", type: textFineTypes.plainItemSpec }, { name: "content", type: textTypes.text }], result: { kind: "output" as const, name: "spec", type: textFineTypes.itemSpec } },
    { name: textFineProducers.bindPoint.name, inputs: [{ name: "point", type: spatialTypes.point }, { name: "policy", type: textFineTypes.pointPlacementPolicy }], result: { kind: "output" as const, name: "placement", type: textFineTypes.placement } },
    { name: textFineProducers.bindArea.name, inputs: [{ name: "frame", type: spatialTypes.frame }, { name: "policy", type: textFineTypes.flowPlacementPolicy }], result: { kind: "output" as const, name: "placement", type: textFineTypes.placement } },
    { name: textFineProducers.bindPath.name, inputs: [{ name: "path", type: spatialTypes.path }, { name: "policy", type: textFineTypes.pathPlacementPolicy }, { name: "marginMotion", type: textFineTypes.pathMotion }], result: { kind: "output" as const, name: "placement", type: textFineTypes.placement } },
    { name: textFineProducers.createOccurrence.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "placement", type: textFineTypes.placement }, { name: "spec", type: textFineTypes.itemSpec }, { name: "style", type: textFineTypes.style }, { name: "motion", type: textFineTypes.motion }, { name: "window", type: temporalTypes.window }], result: { kind: "output" as const, name: "occurrence", type: textFineTypes.occurrence } },
    { name: textFineProducers.renderOccurrence.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "occurrence", type: textFineTypes.occurrence }], result: { kind: "output" as const, name: "visual", type: compositionTypes.visualTrack } },
    { name: textFineProducers.renderOccurrenceMask.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "occurrence", type: textFineTypes.occurrence }, { name: "material", type: mediaTypes.compositableSurface }, { name: "spec", type: textFineTypes.maskSpec }], result: { kind: "output" as const, name: "visual", type: compositionTypes.visualTrack } },
  ],
};
