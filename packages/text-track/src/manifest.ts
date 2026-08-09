import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import {
  compositionDependency,
  compositionTypes,
  visualTextDocumentSchema,
  visualTextFlowSchema,
  visualTextPaintSchema,
  visualTextSequenceSchema,
  visualTextTypographySchema,
} from "@narratage/composition";
import {
  spatialDependency,
  spatialFrameSchema,
  spatialPathSchema,
  spatialPointSchema,
  spatialTypes,
} from "@narratage/spatial";
import { VISUAL_STYLE_ENUM_VALUES_V1, VISUAL_STYLE_NAMES_V1 } from "@narratage/visual-ir";
import { mediaDependency, mediaTypes } from "@narratage/media";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";

import {
  appendMomentTextItemImplementationDigest,
  appendProgramTextItemImplementationDigest,
  appendSelectionTextItemImplementationDigest,
  bindAreaTextPlacementImplementationDigest,
  bindPathTextPlacementImplementationDigest,
  bindPointTextPlacementImplementationDigest,
  createTextTrackSetImplementationDigest,
  finalizeTextTrackImplementationDigest,
  renderTextTrackImplementationDigest,
  renderTextMaskTrackImplementationDigest,
} from "./program.js";

export const textTrackModuleRef = { name: "@narratage/text-track", version: "1" } as const;
export const textTrackTypes = {
  style: { module: textTrackModuleRef, name: "TextStyle" },
  motion: { module: textTrackModuleRef, name: "TextMotion" },
  placement: { module: textTrackModuleRef, name: "TextPlacement" },
  program: { module: textTrackModuleRef, name: "TextTrackProgram" },
  header: { module: textTrackModuleRef, name: "TextTrackHeader" },
  itemSpec: { module: textTrackModuleRef, name: "TextItemSpec" },
  set: { module: textTrackModuleRef, name: "TextTrackSet" },
  maskSpec: { module: textTrackModuleRef, name: "TextMaskSpec" },
} satisfies Record<string, TypeRef>;

export const textTrackProducers = {
  bindPoint: { module: textTrackModuleRef, name: "bind-point-placement" },
  bindArea: { module: textTrackModuleRef, name: "bind-area-placement" },
  bindPath: { module: textTrackModuleRef, name: "bind-path-placement" },
  createSet: { module: textTrackModuleRef, name: "create-text-track-set" },
  appendProgram: { module: textTrackModuleRef, name: "append-program-text-item" },
  appendSelection: { module: textTrackModuleRef, name: "append-selection-text-item" },
  appendMoment: { module: textTrackModuleRef, name: "append-moment-text-item" },
  finalize: { module: textTrackModuleRef, name: "finalize-text-track" },
  render: { module: textTrackModuleRef, name: "render-text-track" },
  renderMask: { module: textTrackModuleRef, name: "render-text-mask-track" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const positive = { kind: "number", minimum: 0.000001 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const signedInteger = { kind: "number", integer: true } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const enumString = (values: readonly string[]): ValueSchema => ({ kind: "string", enum: values });

const duration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: number } }),
  object({ unit: { schema: { kind: "literal", value: "seconds" } }, numerator: { schema: signedInteger }, denominator: { schema: positiveInteger } }),
] };
const point: ValueSchema = { kind: "oneOf", variants: [
  ...["program.start", "program.end", "selection.start", "selection.end", "moment.cue"].map((ref) => object({ ref: { schema: { kind: "literal", value: ref } }, offset: { schema: duration, optional: true } })),
  object({ ref: { schema: { kind: "literal", value: "absolute" } }, at: { schema: duration } }),
] };
const projection = object({ start: { schema: point }, end: { schema: point } });
const expansion: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "one" } } }),
  object({ kind: { schema: { kind: "literal", value: "each" } } }),
] };

const styleDeclaration: ValueSchema = { kind: "oneOf", variants: VISUAL_STYLE_NAMES_V1.map((name) => object({
  name: { schema: { kind: "literal", value: name } },
  value: { schema: Object.hasOwn(VISUAL_STYLE_ENUM_VALUES_V1, name)
    ? { kind: "string", enum: VISUAL_STYLE_ENUM_VALUES_V1[name as keyof typeof VISUAL_STYLE_ENUM_VALUES_V1] }
    : { kind: "oneOf", variants: [{ kind: "string" }, { kind: "number" }] } },
})) };
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
  contract: { schema: { kind: "literal", value: "svml.text-style@1" } },
  id: { schema: string }, stackingOrder: { schema: signedInteger },
  typography: { schema: visualTextTypographySchema },
  paints: { schema: { kind: "array", items: visualTextPaintSchema } },
  area: { schema: areaFlow },
  point: { schema: object({ anchorInline: { schema: enumString(["start", "center", "end"]) }, anchorBlock: { schema: enumString(["start", "center", "end"]) } }) },
  path: { schema: object({
    side: { schema: enumString(["left", "right"]) }, orientation: { schema: enumString(["follow", "upright"]) },
    startMarginPx: { schema: { kind: "number", minimum: 0 } }, endMarginPx: { schema: { kind: "number", minimum: 0 } },
    align: { schema: enumString(["start", "center", "end"]) }, reverse: { schema: { kind: "boolean" } },
    overflow: { schema: enumString(["visible", "clip"]) },
  }) },
});

export const textMotionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-motion@1" } }, id: { schema: string },
  item: { schema: visualAnimation, optional: true },
  sequences: { schema: { kind: "array", items: visualTextSequenceSchema } },
  pathMargin: { schema: object({ keyframes: { schema: { kind: "array", minItems: 2, items: object({
    atFrame: { schema: integer }, startMarginPx: { schema: { kind: "number", minimum: 0 } },
    easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]), optional: true },
  }) } } }), optional: true },
});

const geometry: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "point" } }, point: { schema: spatialPointSchema } }),
  object({ kind: { schema: { kind: "literal", value: "area" } }, frame: { schema: spatialFrameSchema } }),
  object({ kind: { schema: { kind: "literal", value: "path" } }, path: { schema: spatialPathSchema } }),
] };
export const textPlacementSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-placement@1" } }, geometry: { schema: geometry },
});
export const textItemSpecSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-item-spec@1" } }, id: { schema: string },
  document: { schema: visualTextDocumentSchema },
  projection: { schema: projection }, expansion: { schema: expansion },
});
const span = object({ startFrame: { schema: integer }, endFrameExclusive: { schema: positiveInteger } });
const item = object({
  id: { schema: string }, sourceOccurrenceId: { schema: string }, span: { schema: span }, geometry: { schema: geometry },
  document: { schema: visualTextDocumentSchema }, style: { schema: textStyleSchema }, motion: { schema: textMotionSchema },
  tieBreak: { schema: string },
});
export const textTrackProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-track-program@1" } }, id: { schema: string },
  items: { schema: { kind: "array", minItems: 1, items: item } },
});
const textTrackHeaderSchema = object({ contract: { schema: { kind: "literal", value: "svml.text-track-header@1" } }, id: { schema: string } });
const textTrackSetSchema = object({ contract: { schema: { kind: "literal", value: "svml.text-track-set@1" } }, items: { schema: { kind: "array", items: item } } });
const textMaskSpecSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-mask-spec@1" } },
  id: { schema: string }, mode: { schema: enumString(["alpha", "luminance"]) },
  materialFit: { schema: enumString(["contain", "cover", "fill"]) },
});

export const textTrackSurfaceImplementationDigests = {
  style: digestOf("@narratage/text-track/style-surface@1"),
  motion: digestOf("@narratage/text-track/motion-surface@1"),
  track: digestOf("@narratage/text-track/complete-track-surface@1"),
  mask: digestOf("@narratage/text-track/owned-mask-surface@1"),
} as const;

const registered = (locator: string, digest: ReturnType<typeof digestOf>) => ({ kind: "registered" as const, locator, digest });

export const textTrackManifest: ModuleManifest = {
  format: "svml.module@1",
  name: textTrackModuleRef.name,
  version: textTrackModuleRef.version,
  dependencies: [programSpaceDependency, narrativeDependency, semanticMapDependency, spatialDependency, mediaDependency, compositionDependency],
  types: [
    { name: textTrackTypes.style.name, schema: textStyleSchema },
    { name: textTrackTypes.motion.name, schema: textMotionSchema },
    { name: textTrackTypes.placement.name, schema: textPlacementSchema },
    { name: textTrackTypes.program.name, schema: textTrackProgramSchema },
    { name: textTrackTypes.header.name, schema: textTrackHeaderSchema },
    { name: textTrackTypes.itemSpec.name, schema: textItemSpecSchema },
    { name: textTrackTypes.set.name, schema: textTrackSetSchema },
    { name: textTrackTypes.maskSpec.name, schema: textMaskSpecSchema },
  ],
  capabilities: [],
  surfaces: [
    { name: "style", tag: "Style", mode: "structured", outputs: [textTrackTypes.style], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/text-track/style-surface", digest: textTrackSurfaceImplementationDigests.style } },
    { name: "motion", tag: "Motion", mode: "structured", outputs: [textTrackTypes.motion], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/text-track/motion-surface", digest: textTrackSurfaceImplementationDigests.motion } },
    { name: "track", tag: "Track", mode: "structured", outputs: [textTrackTypes.header, textTrackTypes.itemSpec, textTrackTypes.motion, textTrackTypes.set, textTrackTypes.placement, textTrackTypes.program, compositionTypes.visualTrack], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/text-track/complete-track-surface", digest: textTrackSurfaceImplementationDigests.track } },
    { name: "mask", tag: "Mask", mode: "structured", outputs: [textTrackTypes.maskSpec, compositionTypes.visualTrack], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/text-track/owned-mask-surface", digest: textTrackSurfaceImplementationDigests.mask } },
  ],
  producers: [
    { name: textTrackProducers.bindPoint.name, inputs: [{ name: "point", type: spatialTypes.point }], outputs: [{ name: "placement", type: textTrackTypes.placement }], needs: [], implementation: registered("@narratage/text-track/bind-point-placement", bindPointTextPlacementImplementationDigest) },
    { name: textTrackProducers.bindArea.name, inputs: [{ name: "frame", type: spatialTypes.frame }], outputs: [{ name: "placement", type: textTrackTypes.placement }], needs: [], implementation: registered("@narratage/text-track/bind-area-placement", bindAreaTextPlacementImplementationDigest) },
    { name: textTrackProducers.bindPath.name, inputs: [{ name: "path", type: spatialTypes.path }], outputs: [{ name: "placement", type: textTrackTypes.placement }], needs: [], implementation: registered("@narratage/text-track/bind-path-placement", bindPathTextPlacementImplementationDigest) },
    { name: textTrackProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: textTrackTypes.set }], needs: [], implementation: registered("@narratage/text-track/create-set", createTextTrackSetImplementationDigest) },
    { name: textTrackProducers.appendProgram.name, inputs: [{ name: "set", type: textTrackTypes.set }, { name: "header", type: textTrackTypes.header }, { name: "space", type: programSpaceTypes.programSpace }, { name: "placement", type: textTrackTypes.placement }, { name: "spec", type: textTrackTypes.itemSpec }, { name: "style", type: textTrackTypes.style }, { name: "motion", type: textTrackTypes.motion }], outputs: [{ name: "set", type: textTrackTypes.set }], needs: [], implementation: registered("@narratage/text-track/append-program", appendProgramTextItemImplementationDigest) },
    { name: textTrackProducers.appendSelection.name, inputs: [{ name: "set", type: textTrackTypes.set }, { name: "header", type: textTrackTypes.header }, { name: "map", type: semanticMapTypes.complete }, { name: "selection", type: narrativeTypes.selection }, { name: "space", type: programSpaceTypes.programSpace }, { name: "placement", type: textTrackTypes.placement }, { name: "spec", type: textTrackTypes.itemSpec }, { name: "style", type: textTrackTypes.style }, { name: "motion", type: textTrackTypes.motion }], outputs: [{ name: "set", type: textTrackTypes.set }], needs: [], implementation: registered("@narratage/text-track/append-selection", appendSelectionTextItemImplementationDigest) },
    { name: textTrackProducers.appendMoment.name, inputs: [{ name: "set", type: textTrackTypes.set }, { name: "header", type: textTrackTypes.header }, { name: "map", type: semanticMapTypes.complete }, { name: "moment", type: narrativeTypes.moment }, { name: "space", type: programSpaceTypes.programSpace }, { name: "placement", type: textTrackTypes.placement }, { name: "spec", type: textTrackTypes.itemSpec }, { name: "style", type: textTrackTypes.style }, { name: "motion", type: textTrackTypes.motion }], outputs: [{ name: "set", type: textTrackTypes.set }], needs: [], implementation: registered("@narratage/text-track/append-moment", appendMomentTextItemImplementationDigest) },
    { name: textTrackProducers.finalize.name, inputs: [{ name: "header", type: textTrackTypes.header }, { name: "set", type: textTrackTypes.set }], outputs: [{ name: "program", type: textTrackTypes.program }], needs: [], implementation: registered("@narratage/text-track/finalize", finalizeTextTrackImplementationDigest) },
    { name: textTrackProducers.render.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: textTrackTypes.program }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [], implementation: registered("@narratage/text-track/render", renderTextTrackImplementationDigest) },
    { name: textTrackProducers.renderMask.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: textTrackTypes.program }, { name: "material", type: mediaTypes.compositableSurface }, { name: "spec", type: textTrackTypes.maskSpec }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [], implementation: registered("@narratage/text-track/render-mask", renderTextMaskTrackImplementationDigest) },
  ],
};

export const textTrackManifestDigest = digestOf(textTrackManifest);
