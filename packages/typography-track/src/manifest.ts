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
import { textDependency, textTypes } from "@narratage/text";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";

import {
  appendMomentTextItemImplementationDigest,
  appendProgramTextItemImplementationDigest,
  appendSelectionTextItemImplementationDigest,
  bindAreaTextPlacementImplementationDigest,
  bindPathTextPlacementImplementationDigest,
  bindPointTextPlacementImplementationDigest,
  createTypographyTrackSetImplementationDigest,
  finalizeTypographyTrackImplementationDigest,
  renderTypographyTrackImplementationDigest,
  renderTextMaskTrackImplementationDigest,
  materializePlainTextItemImplementationDigest,
} from "./program.js";

export const typographyTrackModuleRef = { name: "@narratage/typography-track", version: "1" } as const;
export const typographyTrackTypes = {
  style: { module: typographyTrackModuleRef, name: "TextStyle" },
  motion: { module: typographyTrackModuleRef, name: "TextMotion" },
  placement: { module: typographyTrackModuleRef, name: "TextPlacement" },
  program: { module: typographyTrackModuleRef, name: "TypographyTrackProgram" },
  header: { module: typographyTrackModuleRef, name: "TypographyTrackHeader" },
  itemSpec: { module: typographyTrackModuleRef, name: "TextItemSpec" },
  plainItemSpec: { module: typographyTrackModuleRef, name: "PlainTextItemSpec" },
  set: { module: typographyTrackModuleRef, name: "TypographyTrackSet" },
  maskSpec: { module: typographyTrackModuleRef, name: "TextMaskSpec" },
} satisfies Record<string, TypeRef>;

export const typographyTrackProducers = {
  bindPoint: { module: typographyTrackModuleRef, name: "bind-point-placement" },
  bindArea: { module: typographyTrackModuleRef, name: "bind-area-placement" },
  bindPath: { module: typographyTrackModuleRef, name: "bind-path-placement" },
  createSet: { module: typographyTrackModuleRef, name: "create-typography-track-set" },
  appendProgram: { module: typographyTrackModuleRef, name: "append-program-text-item" },
  appendSelection: { module: typographyTrackModuleRef, name: "append-selection-text-item" },
  appendMoment: { module: typographyTrackModuleRef, name: "append-moment-text-item" },
  finalize: { module: typographyTrackModuleRef, name: "finalize-typography-track" },
  render: { module: typographyTrackModuleRef, name: "render-typography-track" },
  renderMask: { module: typographyTrackModuleRef, name: "render-text-mask-track" },
  materializePlainItem: { module: typographyTrackModuleRef, name: "materialize-plain-text-item" },
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

/**
 * A Style says how text flows without saying which geometry it flows into, so
 * `form` is dropped. `minimumScale` keeps every bound Composition states and
 * gains the one thing Composition has no reason to state: it is a fraction of
 * the natural type size rather than a count, which nothing offering the property
 * to an author can tell from `(0, 1]` alone.
 */
const areaFlow = (() => {
  const schema = visualTextFlowSchema;
  if (schema.kind !== "object") throw new Error("Visual Text flow schema must be an object.");
  const { form: _form, ...fields } = schema.fields;
  const minimumScale = fields["minimumScale"];
  if (minimumScale?.schema.kind !== "number") {
    throw new Error("Visual Text flow minimumScale must be a number.");
  }
  return object({
    ...fields,
    minimumScale: { ...minimumScale, schema: { ...minimumScale.schema, format: "unit-fraction" } },
  });
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
export const plainTextItemSpecSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.plain-text-item-spec@1" } }, id: { schema: string },
  projection: { schema: projection }, expansion: { schema: expansion },
});
const span = object({ startFrame: { schema: integer }, endFrameExclusive: { schema: positiveInteger } });
const item = object({
  id: { schema: string }, sourceOccurrenceId: { schema: string }, span: { schema: span }, geometry: { schema: geometry },
  document: { schema: visualTextDocumentSchema }, style: { schema: textStyleSchema }, motion: { schema: textMotionSchema },
  tieBreak: { schema: string },
});
export const typographyTrackProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.typography-track-program@1" } }, id: { schema: string },
  items: { schema: { kind: "array", minItems: 1, items: item } },
});
const typographyTrackHeaderSchema = object({ contract: { schema: { kind: "literal", value: "svml.typography-track-header@1" } }, id: { schema: string } });
const typographyTrackSetSchema = object({ contract: { schema: { kind: "literal", value: "svml.typography-track-set@1" } }, items: { schema: { kind: "array", items: item } } });
const textMaskSpecSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-mask-spec@1" } },
  id: { schema: string }, mode: { schema: enumString(["alpha", "luminance"]) },
  materialFit: { schema: enumString(["contain", "cover", "fill"]) },
});

export const typographyTrackSurfaceImplementationDigests = {
  style: digestOf("@narratage/typography-track/style-surface@1"),
  motion: digestOf("@narratage/typography-track/motion-surface@1"),
  track: digestOf("@narratage/typography-track/complete-track-surface@1"),
  mask: digestOf("@narratage/typography-track/owned-mask-surface@1"),
} as const;

const registered = (locator: string, digest: ReturnType<typeof digestOf>) => ({ kind: "registered" as const, locator, digest });

export const typographyTrackManifest: ModuleManifest = {
  format: "svml.module@1",
  name: typographyTrackModuleRef.name,
  version: typographyTrackModuleRef.version,
  dependencies: [programSpaceDependency, narrativeDependency, semanticMapDependency, spatialDependency, mediaDependency, compositionDependency, textDependency],
  types: [
    { name: typographyTrackTypes.style.name, schema: textStyleSchema },
    { name: typographyTrackTypes.motion.name, schema: textMotionSchema },
    { name: typographyTrackTypes.placement.name, schema: textPlacementSchema },
    { name: typographyTrackTypes.program.name, schema: typographyTrackProgramSchema },
    { name: typographyTrackTypes.header.name, schema: typographyTrackHeaderSchema },
    { name: typographyTrackTypes.itemSpec.name, schema: textItemSpecSchema },
    { name: typographyTrackTypes.plainItemSpec.name, schema: plainTextItemSpecSchema },
    { name: typographyTrackTypes.set.name, schema: typographyTrackSetSchema },
    { name: typographyTrackTypes.maskSpec.name, schema: textMaskSpecSchema },
  ],
  capabilities: [],
  surfaces: [
    { name: "style", tag: "Style", mode: "structured", outputs: [typographyTrackTypes.style], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/typography-track/style-surface", digest: typographyTrackSurfaceImplementationDigests.style } },
    { name: "motion", tag: "Motion", mode: "structured", outputs: [typographyTrackTypes.motion], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/typography-track/motion-surface", digest: typographyTrackSurfaceImplementationDigests.motion } },
    { name: "track", tag: "Track", mode: "structured", outputs: [typographyTrackTypes.header, typographyTrackTypes.itemSpec, typographyTrackTypes.plainItemSpec, typographyTrackTypes.motion, typographyTrackTypes.set, typographyTrackTypes.placement, typographyTrackTypes.program, compositionTypes.visualTrack], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/typography-track/complete-track-surface", digest: typographyTrackSurfaceImplementationDigests.track } },
    { name: "mask", tag: "Mask", mode: "structured", outputs: [typographyTrackTypes.maskSpec, compositionTypes.visualTrack], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/typography-track/owned-mask-surface", digest: typographyTrackSurfaceImplementationDigests.mask } },
  ],
  producers: [
    { name: typographyTrackProducers.materializePlainItem.name, inputs: [{ name: "spec", type: typographyTrackTypes.plainItemSpec }, { name: "content", type: textTypes.text }], outputs: [{ name: "spec", type: typographyTrackTypes.itemSpec }], needs: [], implementation: registered("@narratage/typography-track/materialize-plain-text-item", materializePlainTextItemImplementationDigest) },
    { name: typographyTrackProducers.bindPoint.name, inputs: [{ name: "point", type: spatialTypes.point }], outputs: [{ name: "placement", type: typographyTrackTypes.placement }], needs: [], implementation: registered("@narratage/typography-track/bind-point-placement", bindPointTextPlacementImplementationDigest) },
    { name: typographyTrackProducers.bindArea.name, inputs: [{ name: "frame", type: spatialTypes.frame }], outputs: [{ name: "placement", type: typographyTrackTypes.placement }], needs: [], implementation: registered("@narratage/typography-track/bind-area-placement", bindAreaTextPlacementImplementationDigest) },
    { name: typographyTrackProducers.bindPath.name, inputs: [{ name: "path", type: spatialTypes.path }], outputs: [{ name: "placement", type: typographyTrackTypes.placement }], needs: [], implementation: registered("@narratage/typography-track/bind-path-placement", bindPathTextPlacementImplementationDigest) },
    { name: typographyTrackProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: typographyTrackTypes.set }], needs: [], implementation: registered("@narratage/typography-track/create-set", createTypographyTrackSetImplementationDigest) },
    { name: typographyTrackProducers.appendProgram.name, inputs: [{ name: "set", type: typographyTrackTypes.set }, { name: "header", type: typographyTrackTypes.header }, { name: "space", type: programSpaceTypes.programSpace }, { name: "placement", type: typographyTrackTypes.placement }, { name: "spec", type: typographyTrackTypes.itemSpec }, { name: "style", type: typographyTrackTypes.style }, { name: "motion", type: typographyTrackTypes.motion }], outputs: [{ name: "set", type: typographyTrackTypes.set }], needs: [], implementation: registered("@narratage/typography-track/append-program", appendProgramTextItemImplementationDigest) },
    { name: typographyTrackProducers.appendSelection.name, inputs: [{ name: "set", type: typographyTrackTypes.set }, { name: "header", type: typographyTrackTypes.header }, { name: "map", type: semanticMapTypes.complete }, { name: "selection", type: narrativeTypes.selection }, { name: "space", type: programSpaceTypes.programSpace }, { name: "placement", type: typographyTrackTypes.placement }, { name: "spec", type: typographyTrackTypes.itemSpec }, { name: "style", type: typographyTrackTypes.style }, { name: "motion", type: typographyTrackTypes.motion }], outputs: [{ name: "set", type: typographyTrackTypes.set }], needs: [], implementation: registered("@narratage/typography-track/append-selection", appendSelectionTextItemImplementationDigest) },
    { name: typographyTrackProducers.appendMoment.name, inputs: [{ name: "set", type: typographyTrackTypes.set }, { name: "header", type: typographyTrackTypes.header }, { name: "map", type: semanticMapTypes.complete }, { name: "moment", type: narrativeTypes.moment }, { name: "space", type: programSpaceTypes.programSpace }, { name: "placement", type: typographyTrackTypes.placement }, { name: "spec", type: typographyTrackTypes.itemSpec }, { name: "style", type: typographyTrackTypes.style }, { name: "motion", type: typographyTrackTypes.motion }], outputs: [{ name: "set", type: typographyTrackTypes.set }], needs: [], implementation: registered("@narratage/typography-track/append-moment", appendMomentTextItemImplementationDigest) },
    { name: typographyTrackProducers.finalize.name, inputs: [{ name: "header", type: typographyTrackTypes.header }, { name: "set", type: typographyTrackTypes.set }], outputs: [{ name: "program", type: typographyTrackTypes.program }], needs: [], implementation: registered("@narratage/typography-track/finalize", finalizeTypographyTrackImplementationDigest) },
    { name: typographyTrackProducers.render.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: typographyTrackTypes.program }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [], implementation: registered("@narratage/typography-track/render", renderTypographyTrackImplementationDigest) },
    { name: typographyTrackProducers.renderMask.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: typographyTrackTypes.program }, { name: "material", type: mediaTypes.compositableSurface }, { name: "spec", type: typographyTrackTypes.maskSpec }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [], implementation: registered("@narratage/typography-track/render-mask", renderTextMaskTrackImplementationDigest) },
  ],
};

export const typographyTrackManifestDigest = digestOf(typographyTrackManifest);
