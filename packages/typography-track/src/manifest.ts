import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import { semanticMapDependency, semanticMapTypes } from "@hypit/semantic-map";
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
import { VISUAL_STYLE_ENUM_VALUES_V1, VISUAL_STYLE_NAMES_V1 } from "@hypit/visual-ir";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { textDependency, textTypes } from "@hypit/text";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";

export const typographyTrackModuleRef = { name: "@hypit/typography-track", version: "1" } as const;
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

const areaFlow = (() => {
  const schema = visualTextFlowSchema;
  if (schema.kind !== "object") throw new Error("Visual Text flow schema must be an object.");
  const { form: _form, ...fields } = schema.fields;
  return object(fields);
})();

export const textStyleSchema: ValueSchema = object({

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
  id: { schema: string },
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
  geometry: { schema: geometry },
});
export const textItemSpecSchema: ValueSchema = object({
  id: { schema: string },
  document: { schema: visualTextDocumentSchema },
  projection: { schema: projection }, expansion: { schema: expansion },
});
export const plainTextItemSpecSchema: ValueSchema = object({
  id: { schema: string },
  projection: { schema: projection }, expansion: { schema: expansion },
});
const span = object({ startFrame: { schema: integer }, endFrameExclusive: { schema: positiveInteger } });
const item = object({
  id: { schema: string }, span: { schema: span }, geometry: { schema: geometry },
  document: { schema: visualTextDocumentSchema }, style: { schema: textStyleSchema }, motion: { schema: textMotionSchema },
  tieBreak: { schema: string },
});
export const typographyTrackProgramSchema: ValueSchema = object({
  id: { schema: string },
  items: { schema: { kind: "array", minItems: 1, items: item } },
});
const typographyTrackHeaderSchema = object({ id: { schema: string } });
const typographyTrackSetSchema = object({ items: { schema: { kind: "array", items: item } } });
const textMaskSpecSchema = object({

  id: { schema: string }, mode: { schema: enumString(["alpha", "luminance"]) },
  materialFit: { schema: enumString(["contain", "cover", "fill"]) },
});


export const typographyTrackMarkupSurfaces = [
    { name: "style", tag: "Style", mode: "structured", outputs: [typographyTrackTypes.style] },
    { name: "motion", tag: "Motion", mode: "structured", outputs: [typographyTrackTypes.motion] },
    { name: "track", tag: "Track", mode: "structured", outputs: [typographyTrackTypes.header, typographyTrackTypes.itemSpec, typographyTrackTypes.plainItemSpec, typographyTrackTypes.motion, typographyTrackTypes.set, typographyTrackTypes.placement, typographyTrackTypes.program, compositionTypes.visualTrack] },
    { name: "mask", tag: "Mask", mode: "structured", outputs: [typographyTrackTypes.maskSpec, compositionTypes.visualTrack] },
  ] as const;


export const typographyTrackManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: typographyTrackModuleRef.name,
  version: typographyTrackModuleRef.version,
  dependencies: [programSpaceDependency, narrativeDependency, semanticMapDependency, spatialDependency, mediaDependency, compositionDependency, textDependency],
  types: [
    { name: typographyTrackTypes.style.name },
    { name: typographyTrackTypes.motion.name },
    { name: typographyTrackTypes.placement.name },
    { name: typographyTrackTypes.program.name },
    { name: typographyTrackTypes.header.name },
    { name: typographyTrackTypes.itemSpec.name },
    { name: typographyTrackTypes.plainItemSpec.name },
    { name: typographyTrackTypes.set.name },
    { name: typographyTrackTypes.maskSpec.name },
  ],
  capabilities: [],
  producers: [
    { name: typographyTrackProducers.materializePlainItem.name, inputs: [{ name: "spec", type: typographyTrackTypes.plainItemSpec }, { name: "content", type: textTypes.text }], outputs: [{ name: "spec", type: typographyTrackTypes.itemSpec }], needs: [] },
    { name: typographyTrackProducers.bindPoint.name, inputs: [{ name: "point", type: spatialTypes.point }], outputs: [{ name: "placement", type: typographyTrackTypes.placement }], needs: [] },
    { name: typographyTrackProducers.bindArea.name, inputs: [{ name: "frame", type: spatialTypes.frame }], outputs: [{ name: "placement", type: typographyTrackTypes.placement }], needs: [] },
    { name: typographyTrackProducers.bindPath.name, inputs: [{ name: "path", type: spatialTypes.path }], outputs: [{ name: "placement", type: typographyTrackTypes.placement }], needs: [] },
    { name: typographyTrackProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: typographyTrackTypes.set }], needs: [] },
    { name: typographyTrackProducers.appendProgram.name, inputs: [{ name: "set", type: typographyTrackTypes.set }, { name: "header", type: typographyTrackTypes.header }, { name: "space", type: programSpaceTypes.programSpace }, { name: "placement", type: typographyTrackTypes.placement }, { name: "spec", type: typographyTrackTypes.itemSpec }, { name: "style", type: typographyTrackTypes.style }, { name: "motion", type: typographyTrackTypes.motion }], outputs: [{ name: "set", type: typographyTrackTypes.set }], needs: [] },
    { name: typographyTrackProducers.appendSelection.name, inputs: [{ name: "set", type: typographyTrackTypes.set }, { name: "header", type: typographyTrackTypes.header }, { name: "map", type: semanticMapTypes.complete }, { name: "selection", type: narrativeTypes.selection }, { name: "space", type: programSpaceTypes.programSpace }, { name: "placement", type: typographyTrackTypes.placement }, { name: "spec", type: typographyTrackTypes.itemSpec }, { name: "style", type: typographyTrackTypes.style }, { name: "motion", type: typographyTrackTypes.motion }], outputs: [{ name: "set", type: typographyTrackTypes.set }], needs: [] },
    { name: typographyTrackProducers.appendMoment.name, inputs: [{ name: "set", type: typographyTrackTypes.set }, { name: "header", type: typographyTrackTypes.header }, { name: "map", type: semanticMapTypes.complete }, { name: "moment", type: narrativeTypes.moment }, { name: "space", type: programSpaceTypes.programSpace }, { name: "placement", type: typographyTrackTypes.placement }, { name: "spec", type: typographyTrackTypes.itemSpec }, { name: "style", type: typographyTrackTypes.style }, { name: "motion", type: typographyTrackTypes.motion }], outputs: [{ name: "set", type: typographyTrackTypes.set }], needs: [] },
    { name: typographyTrackProducers.finalize.name, inputs: [{ name: "header", type: typographyTrackTypes.header }, { name: "set", type: typographyTrackTypes.set }], outputs: [{ name: "program", type: typographyTrackTypes.program }], needs: [] },
    { name: typographyTrackProducers.render.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: typographyTrackTypes.program }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
    { name: typographyTrackProducers.renderMask.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: typographyTrackTypes.program }, { name: "material", type: mediaTypes.compositableSurface }, { name: "spec", type: typographyTrackTypes.maskSpec }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
  ],
};
