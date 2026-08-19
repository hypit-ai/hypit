import { readFile } from "node:fs/promises";

import { compositionDependency, compositionTypes } from "@hypit/composition";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { semanticMapDependency, semanticMapTypes } from "@hypit/semantic-map";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { temporalDependency } from "@hypit/temporal";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const screenOverlayModuleRef = { name: "@hypit/screen-overlay", version: "1" } as const;
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
const appendInputs = [{ name: "set", type: screenOverlayTypes.set }, { name: "header", type: screenOverlayTypes.header }, { name: "space", type: programSpaceTypes.programSpace }, { name: "spec", type: screenOverlayTypes.itemSpec }] as const;

/** Every component child carries its own identity, its stacking order and one temporal form. */
const itemAttributes = [
  { name: "id", kind: "identifier", required: false,
    summary: "Names this item; the overlay numbers the item after its kind when it is omitted." },
  { name: "z", kind: "literal", required: true,
    summary: "Sets the stacking order this item is painted in against its siblings." },
  { name: "during", kind: "expression", required: false, values: ["program"], accepts: [narrativeTypes.selection],
    summary: "Holds the item across the whole programme, or across the Selection it names." },
  { name: "at", kind: "reference", required: false, accepts: [narrativeTypes.moment],
    summary: "Starts the item at the cue of the Moment it names." },
  { name: "for", kind: "literal", required: false,
    summary: "Sets the exact duration the item holds past the Moment cue." },
  { name: "start", kind: "literal", required: false,
    summary: "Sets the point the item begins at, as a named edge with an optional offset or as an absolute duration." },
  { name: "end", kind: "literal", required: false,
    summary: "Sets the point the item ends at, as a named edge with an optional offset or as an absolute duration." },
  { name: "selection", kind: "reference", required: false, accepts: [narrativeTypes.selection],
    summary: "Binds explicit `start` and `end` timing to a Selection." },
  { name: "moment", kind: "reference", required: false, accepts: [narrativeTypes.moment],
    summary: "Binds explicit `start` and `end` timing to a Moment." },
  { name: "map", kind: "reference", required: false, accepts: [semanticMapTypes.complete],
    summary: "Chooses the semantic map the bound Selection or Moment is located through." },
  { name: "occurrences", kind: "literal", required: false, values: ["one", "each"],
    summary: "Decides whether the item is painted once or at every occurrence of its Selection or Moment; defaults to `one`." },
] as const;

export const screenOverlayMarkupSurfaces = [
  { name: "track", tag: "Track", mode: "structured", outputs: [screenOverlayTypes.header, screenOverlayTypes.itemSpec, screenOverlayTypes.program, compositionTypes.visualTrack],
    vocabulary: {
      summary: "Paints self-contained screen treatments across the whole Canvas and publishes the overlay Program and the VisualTrack it renders to.",
      appearance: "Treatments laid edge to edge over the whole Canvas, never a panel, a card or text, each item covering the frame for its own span only and painted over its siblings in `z` order. Flash pulses one color up to full and back down across the frame, ColorWash holds that same flat color still, and Vignette leaves the middle clear and darkens outwards to one color in an ellipse around a chosen centre. Four items cross the frame as travelling geometry: ScanLines rule it with evenly spaced white stripes at an angle, DirectionalMatte sweeps a feathered wall of color over it, WhipVeil slides a single soft-edged white band left, right, up or down, and LightLeak drags a heavily blurred angled gradient of colors from one side to the other. The remaining four scatter many small shapes from a seed: GlitchVeil throws wide colored horizontal bars that jump sideways, Grain sprinkles fine specks that crawl diagonally, Bokeh floats blurred round discs of one color that drift apart, and TVStatic fills the frame with grey noise cells beneath fine horizontal scan lines.",
      preview: previewImage("Track.png"),
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this overlay so its Program and Track can be referenced elsewhere in the Source." },
        { name: "canvas", kind: "reference", required: true, accepts: [spatialTypes.canvas],
          summary: "Chooses the Canvas every item is painted across." },
        { name: "space", kind: "reference", required: true, accepts: [programSpaceTypes.programSpace],
          summary: "Chooses the ProgramSpace the overlay is timed against." },
      ],
      children: [
        { tag: "Flash", cardinality: "many",
          summary: "A full-Canvas flash of one color with its own attack, hold and decay in frames.",
          attributes: [
            ...itemAttributes,
            { name: "color", kind: "literal", required: true,
              summary: "Sets the hexadecimal color the Canvas flashes." },
            { name: "intensity", kind: "literal", required: true,
              summary: "Sets how strong the flash is, from 0 to 1." },
            { name: "attack", kind: "literal", required: true,
              summary: "Sets how many frames the flash takes to reach full intensity." },
            { name: "hold", kind: "literal", required: true,
              summary: "Sets how many frames the flash stays at full intensity." },
            { name: "decay", kind: "literal", required: true,
              summary: "Sets how many frames the flash takes to fade away." },
          ] },
        { tag: "ColorWash", cardinality: "many",
          summary: "One flat color held over the whole Canvas at a fixed opacity.",
          attributes: [
            ...itemAttributes,
            { name: "color", kind: "literal", required: true,
              summary: "Sets the hexadecimal color held over the Canvas." },
            { name: "opacity", kind: "literal", required: true,
              summary: "Sets how opaque the wash is, from 0 to 1." },
          ] },
        { tag: "Vignette", cardinality: "many",
          summary: "An elliptical falloff of one color around a normalized centre.",
          attributes: [
            ...itemAttributes,
            { name: "center-x", kind: "literal", required: true,
              summary: "Sets the horizontal centre of the falloff as a fraction of the Canvas width." },
            { name: "center-y", kind: "literal", required: true,
              summary: "Sets the vertical centre of the falloff as a fraction of the Canvas height." },
            { name: "radius-x", kind: "literal", required: true,
              summary: "Sets the horizontal radius of the falloff as a fraction of the Canvas width." },
            { name: "radius-y", kind: "literal", required: true,
              summary: "Sets the vertical radius of the falloff as a fraction of the Canvas height." },
            { name: "softness", kind: "literal", required: true,
              summary: "Sets how gradually the falloff fades outwards, from 0 to 1." },
            { name: "color", kind: "literal", required: true,
              summary: "Sets the hexadecimal color the edges are darkened with." },
            { name: "opacity", kind: "literal", required: true,
              summary: "Sets how opaque the vignette is, from 0 to 1." },
          ] },
        { tag: "ScanLines", cardinality: "many",
          summary: "Repeating lines at a fixed spacing, thickness and angle, travelling across the Canvas.",
          attributes: [
            ...itemAttributes,
            { name: "spacing", kind: "literal", required: true,
              summary: "Sets how many pixels apart the lines are." },
            { name: "thickness", kind: "literal", required: true,
              summary: "Sets how many pixels thick each line is, at most the spacing." },
            { name: "angle", kind: "literal", required: true,
              summary: "Sets the angle in degrees the lines run at." },
            { name: "opacity", kind: "literal", required: true,
              summary: "Sets how opaque the lines are, from 0 to 1." },
            { name: "travel", kind: "literal", required: true,
              summary: "Sets how many pixels the lines travel across the item's span." },
          ] },
        { tag: "DirectionalMatte", cardinality: "many",
          summary: "A feathered matte of one color crossing the Canvas at an angle over an explicit progress range.",
          attributes: [
            ...itemAttributes,
            { name: "angle", kind: "literal", required: true,
              summary: "Sets the angle in degrees the matte edge crosses the Canvas at." },
            { name: "coverage", kind: "literal", required: true,
              summary: "Sets how much of the Canvas the matte covers, from 0 to 1." },
            { name: "feather", kind: "literal", required: true,
              summary: "Sets how soft the matte edge is, from 0 to 1." },
            { name: "color", kind: "literal", required: true,
              summary: "Sets the hexadecimal color the matte is filled with." },
            { name: "opacity", kind: "literal", required: true,
              summary: "Sets how opaque the matte is, from 0 to 1." },
            { name: "from", kind: "literal", required: true,
              summary: "Sets the progress the matte starts its crossing at, from -1 to 2." },
            { name: "to", kind: "literal", required: true,
              summary: "Sets the progress the matte ends its crossing at, from -1 to 2." },
          ] },
        { tag: "WhipVeil", cardinality: "many",
          summary: "A soft band that travels across the Canvas in one of four directions.",
          attributes: [
            ...itemAttributes,
            { name: "direction", kind: "literal", required: true, values: ["left", "right", "up", "down"],
              summary: "Chooses which way the band travels across the Canvas." },
            { name: "width", kind: "literal", required: true,
              summary: "Sets how many pixels wide the band is." },
            { name: "softness", kind: "literal", required: true,
              summary: "Sets how many pixels the band's edges are blurred over." },
            { name: "travel", kind: "literal", required: true,
              summary: "Sets how many pixels the band travels across the item's span." },
            { name: "opacity", kind: "literal", required: true,
              summary: "Sets how opaque the band is, from 0 to 1." },
          ] },
        { tag: "GlitchVeil", cardinality: "many",
          summary: "Colored bars laid across the Canvas and displaced from an explicit seed.",
          attributes: [
            ...itemAttributes,
            { name: "bars", kind: "literal", required: true,
              summary: "Sets how many bars are laid across the Canvas, up to 256." },
            { name: "colors", kind: "literal", required: true,
              summary: "Lists the hexadecimal colors the bars are drawn in, separated by commas." },
            { name: "opacity", kind: "literal", required: true,
              summary: "Sets how opaque the bars are, from 0 to 1." },
            { name: "travel", kind: "literal", required: true,
              summary: "Sets how many pixels the bars are displaced across the item's span." },
            { name: "seed", kind: "literal", required: true,
              summary: "Sets the seed the bar placement and displacement are drawn from." },
          ] },
        { tag: "Grain", cardinality: "many",
          summary: "Grain at a chosen amount, size and chroma, moving from an explicit seed.",
          attributes: [
            ...itemAttributes,
            { name: "amount", kind: "literal", required: true,
              summary: "Sets how much grain is laid over the Canvas, from 0 to 1." },
            { name: "size", kind: "literal", required: true,
              summary: "Sets how many pixels across one grain particle is." },
            { name: "chroma", kind: "literal", required: true, values: ["monochrome", "color"],
              summary: "Decides whether the grain is monochrome or colored." },
            { name: "motion-rate", kind: "literal", required: true,
              summary: "Sets how many pixels the grain moves each frame." },
            { name: "seed", kind: "literal", required: true,
              summary: "Sets the seed the grain pattern is drawn from." },
          ] },
        { tag: "LightLeak", cardinality: "many",
          summary: "Colored light angled across the Canvas and moving from an explicit seed.",
          attributes: [
            ...itemAttributes,
            { name: "colors", kind: "literal", required: true,
              summary: "Lists the hexadecimal colors the leak is drawn in, separated by commas." },
            { name: "angle", kind: "literal", required: true,
              summary: "Sets the angle in degrees the light crosses the Canvas at." },
            { name: "softness", kind: "literal", required: true,
              summary: "Sets how soft the leak's edges are, from 0 to 1." },
            { name: "travel", kind: "literal", required: true,
              summary: "Sets how many pixels the leak travels across the item's span." },
            { name: "intensity", kind: "literal", required: true,
              summary: "Sets how strong the leak is, from 0 to 1." },
            { name: "seed", kind: "literal", required: true,
              summary: "Sets the seed the leak's placement is drawn from." },
          ] },
        { tag: "Bokeh", cardinality: "many",
          summary: "Out-of-focus highlights between a minimum and maximum size, drifting from an explicit seed.",
          attributes: [
            ...itemAttributes,
            { name: "amount", kind: "literal", required: true,
              summary: "Sets how many highlights are scattered over the Canvas, from 0 to 1." },
            { name: "min-size", kind: "literal", required: true,
              summary: "Sets how many pixels across the smallest highlight is." },
            { name: "max-size", kind: "literal", required: true,
              summary: "Sets how many pixels across the largest highlight is, never below `min-size`." },
            { name: "color", kind: "literal", required: true,
              summary: "Sets the hexadecimal color the highlights are drawn in." },
            { name: "warmth", kind: "literal", required: true,
              summary: "Sets how warm or cool the highlights are, from -1 to 1." },
            { name: "drift", kind: "literal", required: true,
              summary: "Sets how many pixels the highlights drift across the item's span." },
            { name: "seed", kind: "literal", required: true,
              summary: "Sets the seed the highlight placement is drawn from." },
          ] },
        { tag: "TVStatic", cardinality: "many",
          summary: "Broadcast noise with its own scan-line opacity, moving from an explicit seed.",
          attributes: [
            ...itemAttributes,
            { name: "amount", kind: "literal", required: true,
              summary: "Sets how much noise covers the Canvas, from 0 to 1." },
            { name: "size", kind: "literal", required: true,
              summary: "Sets how many pixels across one noise cell is." },
            { name: "scan-lines", kind: "literal", required: true,
              summary: "Sets how opaque the scan lines over the noise are, from 0 to 1." },
            { name: "motion-rate", kind: "literal", required: true,
              summary: "Sets how many pixels the noise moves each frame." },
            { name: "seed", kind: "literal", required: true,
              summary: "Sets the seed the noise is drawn from." },
          ] },
      ],
      ports: [
        { name: "program", type: screenOverlayTypes.program,
          summary: "The resolved overlay: every item with its frame span, its content and its stacking." },
        { name: "track", type: compositionTypes.visualTrack,
          summary: "The rendered overlay, an ordinary peer VisualTrack." },
      ],
      example: `<screen:Track id="effects" space={speech.space} canvas={vertical}>
  <screen:Flash during={story.selection.overlay} map={timing.map} z="80"
    color="#ffffff" intensity="0.6" attack="2" hold="2" decay="6"/>
</screen:Track>`,
      notes: [
        "The overlay requires at least one component child, and a component child is empty.",
        "A component child writes exactly one temporal form, `during`, `at`, or `start` with `end`; none of them or more than one is refused.",
        "`during` takes the literal `program` for the whole programme, or a Selection reference, which also requires `map`.",
        "`at` requires `map` and `for`.",
        "`start` and `end` each take `program.start`, `program.end`, `selection.start`, `selection.end` or `moment.cue` with an optional `+` or `-` offset, or a bare duration read as an absolute point.",
        "Explicit `start` and `end` timing binds a Selection through `selection` or a Moment through `moment`, never both, and either one requires `map`; `map` without a temporal source is refused.",
        "A duration is written as an integral `f` or `ms` count, or as an `s` count that may carry a decimal fraction.",
      ],
    } },
] as const;


export const screenOverlayManifest: ModuleManifest = {
  format: "hypit.module@1", name: screenOverlayModuleRef.name, version: screenOverlayModuleRef.version,
  dependencies: [narrativeDependency, semanticMapDependency, programSpaceDependency, spatialDependency, temporalDependency, compositionDependency],
  types: [
    { name: screenOverlayTypes.header.name },
    { name: screenOverlayTypes.itemSpec.name },
    { name: screenOverlayTypes.set.name },
    { name: screenOverlayTypes.program.name },
  ], capabilities: [],
  producers: [
    { name: screenOverlayProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: screenOverlayTypes.set }], needs: [] },
    { name: screenOverlayProducers.appendProgram.name, inputs: [...appendInputs], outputs: [{ name: "set", type: screenOverlayTypes.set }], needs: [] },
    { name: screenOverlayProducers.appendSelection.name, inputs: [...appendInputs, { name: "map", type: semanticMapTypes.complete }, { name: "selection", type: narrativeTypes.selection }], outputs: [{ name: "set", type: screenOverlayTypes.set }], needs: [] },
    { name: screenOverlayProducers.appendMoment.name, inputs: [...appendInputs, { name: "map", type: semanticMapTypes.complete }, { name: "moment", type: narrativeTypes.moment }], outputs: [{ name: "set", type: screenOverlayTypes.set }], needs: [] },
    { name: screenOverlayProducers.finalize.name, inputs: [{ name: "set", type: screenOverlayTypes.set }, { name: "header", type: screenOverlayTypes.header }], outputs: [{ name: "program", type: screenOverlayTypes.program }], needs: [] },
    { name: screenOverlayProducers.render.name, inputs: [{ name: "canvas", type: spatialTypes.canvas }, { name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: screenOverlayTypes.program }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
  ],
};
export const screenOverlayDependency = { module: screenOverlayModuleRef } as const;
