import { compositionDependency, compositionTypes } from "@narratage/composition";
import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import { spatialDependency, spatialTypes } from "@narratage/spatial";
import { temporalDependency } from "@narratage/temporal";

import { screenOverlayImplementationDigests, screenOverlayValidatorDigests } from "./program.js";

export const screenOverlayModuleRef = { name: "@narratage/screen-overlay", version: "1" } as const;
export const screenOverlayTypes = {
  header: { module: screenOverlayModuleRef, name: "ScreenOverlayHeader" },
  itemSpec: { module: screenOverlayModuleRef, name: "ScreenOverlayItemSpec" },
  set: { module: screenOverlayModuleRef, name: "ScreenOverlaySet" },
  program: { module: screenOverlayModuleRef, name: "ScreenOverlayProgram" },
} satisfies Record<string, TypeRef>;
export const screenOverlayProducers = {
  createSet: { module: screenOverlayModuleRef, name: "create-screen-overlay-set" },
  appendProgram: { module: screenOverlayModuleRef, name: "append-program-screen-overlay" },
  appendSelection: { module: screenOverlayModuleRef, name: "append-selection-screen-overlay" },
  appendMoment: { module: screenOverlayModuleRef, name: "append-moment-screen-overlay" },
  finalize: { module: screenOverlayModuleRef, name: "finalize-screen-overlay" },
  render: { module: screenOverlayModuleRef, name: "render-screen-overlay" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const nonNegative = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const pointDuration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "seconds" } }, numerator: { schema: integer }, denominator: { schema: { kind: "number", integer: true, minimum: 1 } } }),
] };
const point: ValueSchema = { kind: "oneOf", variants: [
  ...["program.start", "program.end", "selection.start", "selection.end", "moment.cue"].map((ref) => object({ ref: { schema: { kind: "literal", value: ref } }, offset: { schema: pointDuration, optional: true } })),
  object({ ref: { schema: { kind: "literal", value: "absolute" } }, at: { schema: pointDuration } }),
] };
const projection = object({ start: { schema: point }, end: { schema: point } });
const normalizedPoint = object({ x: { schema: number }, y: { schema: number } });
const colorArray: ValueSchema = { kind: "array", minItems: 1, items: string };
const component: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "flash" } }, color: { schema: string }, intensity: { schema: nonNegative }, attackFrames: { schema: unsignedInteger }, holdFrames: { schema: unsignedInteger }, decayFrames: { schema: unsignedInteger } }),
  object({ kind: { schema: { kind: "literal", value: "color-wash" } }, color: { schema: string }, opacity: { schema: nonNegative } }),
  object({ kind: { schema: { kind: "literal", value: "vignette" } }, center: { schema: normalizedPoint }, radius: { schema: normalizedPoint }, softness: { schema: nonNegative }, color: { schema: string }, opacity: { schema: nonNegative } }),
  object({ kind: { schema: { kind: "literal", value: "scan-lines" } }, spacingPx: { schema: nonNegative }, thicknessPx: { schema: nonNegative }, angleDeg: { schema: number }, opacity: { schema: nonNegative }, travelPx: { schema: number } }),
  object({ kind: { schema: { kind: "literal", value: "directional-matte" } }, angleDeg: { schema: number }, coverage: { schema: nonNegative }, feather: { schema: nonNegative }, color: { schema: string }, opacity: { schema: nonNegative }, progress: { schema: object({ from: { schema: number }, to: { schema: number } }) } }),
  object({ kind: { schema: { kind: "literal", value: "whip-veil" } }, direction: { schema: { kind: "string", enum: ["left", "right", "up", "down"] } }, widthPx: { schema: nonNegative }, softnessPx: { schema: nonNegative }, travelPx: { schema: nonNegative }, opacity: { schema: nonNegative } }),
  object({ kind: { schema: { kind: "literal", value: "glitch-veil" } }, bars: { schema: unsignedInteger }, colors: { schema: colorArray }, opacity: { schema: nonNegative }, travelPx: { schema: number }, seed: { schema: unsignedInteger } }),
  object({ kind: { schema: { kind: "literal", value: "grain" } }, amount: { schema: nonNegative }, grainSizePx: { schema: nonNegative }, chroma: { schema: { kind: "string", enum: ["monochrome", "color"] } }, motionRatePxPerFrame: { schema: number }, seed: { schema: unsignedInteger } }),
  object({ kind: { schema: { kind: "literal", value: "light-leak" } }, colors: { schema: colorArray }, angleDeg: { schema: number }, softness: { schema: nonNegative }, travelPx: { schema: number }, intensity: { schema: nonNegative }, seed: { schema: unsignedInteger } }),
  object({ kind: { schema: { kind: "literal", value: "bokeh" } }, amount: { schema: nonNegative }, sizeMinPx: { schema: nonNegative }, sizeMaxPx: { schema: nonNegative }, color: { schema: string }, warmth: { schema: number }, driftPx: { schema: number }, seed: { schema: unsignedInteger } }),
  object({ kind: { schema: { kind: "literal", value: "tv-static" } }, amount: { schema: nonNegative }, noiseSizePx: { schema: nonNegative }, scanLineOpacity: { schema: nonNegative }, motionRatePxPerFrame: { schema: number }, seed: { schema: unsignedInteger } }),
] };
const itemSpec = object({
  id: { schema: string },
  content: { schema: component }, projection: { schema: projection },
  expansion: { schema: object({ kind: { schema: { kind: "string", enum: ["one", "each"] } } }) },
  stackingOrder: { schema: integer },
});
const frameSpan = object({ startFrame: { schema: unsignedInteger }, endFrameExclusive: { schema: unsignedInteger } });
const item = object({
  id: { schema: string }, span: { schema: frameSpan }, content: { schema: component },
  stacking: { schema: object({ order: { schema: integer }, tieBreak: { schema: string } }) },
});
export const screenOverlayHeaderSchema: ValueSchema = object({ id: { schema: string } });
export const screenOverlayItemSpecSchema: ValueSchema = itemSpec;
export const screenOverlaySetSchema: ValueSchema = object({ items: { schema: { kind: "array", items: item } } });
export const screenOverlayProgramSchema: ValueSchema = object({ id: { schema: string }, items: { schema: { kind: "array", minItems: 1, items: item } } });
export const screenOverlaySurfaceImplementationDigest = digestOf("@narratage/screen-overlay/track-surface@1");
const validator = (digest: ReturnType<typeof digestOf>) => ({ implementation: { digest } });
const appendInputs = [{ name: "set", type: screenOverlayTypes.set }, { name: "header", type: screenOverlayTypes.header }, { name: "space", type: programSpaceTypes.programSpace }, { name: "spec", type: screenOverlayTypes.itemSpec }] as const;

export const screenOverlayMarkupSurfaces = [{ name: "track", tag: "Track", mode: "structured", outputs: [screenOverlayTypes.header, screenOverlayTypes.itemSpec, screenOverlayTypes.program, compositionTypes.visualTrack], implementation: { digest: screenOverlaySurfaceImplementationDigest } }] as const;


export const screenOverlayManifest: ModuleManifest = {
  format: "svml.module@1", name: screenOverlayModuleRef.name, version: screenOverlayModuleRef.version,
  dependencies: [narrativeDependency, semanticMapDependency, programSpaceDependency, spatialDependency, temporalDependency, compositionDependency],
  types: [
    { name: screenOverlayTypes.header.name, schema: screenOverlayHeaderSchema },
    { name: screenOverlayTypes.itemSpec.name, schema: screenOverlayItemSpecSchema },
    { name: screenOverlayTypes.set.name, schema: screenOverlaySetSchema },
    { name: screenOverlayTypes.program.name, schema: screenOverlayProgramSchema, validator: validator(screenOverlayValidatorDigests.program) },
  ], capabilities: [],
  producers: [
    { name: screenOverlayProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: screenOverlayTypes.set }], needs: [], implementation: { digest: screenOverlayImplementationDigests.createSet } },
    { name: screenOverlayProducers.appendProgram.name, inputs: [...appendInputs], outputs: [{ name: "set", type: screenOverlayTypes.set }], needs: [], implementation: { digest: screenOverlayImplementationDigests.appendProgram } },
    { name: screenOverlayProducers.appendSelection.name, inputs: [...appendInputs, { name: "map", type: semanticMapTypes.complete }, { name: "selection", type: narrativeTypes.selection }], outputs: [{ name: "set", type: screenOverlayTypes.set }], needs: [], implementation: { digest: screenOverlayImplementationDigests.appendSelection } },
    { name: screenOverlayProducers.appendMoment.name, inputs: [...appendInputs, { name: "map", type: semanticMapTypes.complete }, { name: "moment", type: narrativeTypes.moment }], outputs: [{ name: "set", type: screenOverlayTypes.set }], needs: [], implementation: { digest: screenOverlayImplementationDigests.appendMoment } },
    { name: screenOverlayProducers.finalize.name, inputs: [{ name: "set", type: screenOverlayTypes.set }, { name: "header", type: screenOverlayTypes.header }], outputs: [{ name: "program", type: screenOverlayTypes.program }], needs: [], implementation: { digest: screenOverlayImplementationDigests.finalize } },
    { name: screenOverlayProducers.render.name, inputs: [{ name: "canvas", type: spatialTypes.canvas }, { name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: screenOverlayTypes.program }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [], implementation: { digest: screenOverlayImplementationDigests.render } },
  ],
};
export const screenOverlayManifestDigest = digestOf(screenOverlayManifest);
export const screenOverlayDependency = { module: screenOverlayModuleRef, digest: screenOverlayManifestDigest } as const;
