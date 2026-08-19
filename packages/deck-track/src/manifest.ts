import { readFile } from "node:fs/promises";

import { artifactTypes } from "@hypit/artifact";
import {
  compositionDependency,
  compositionTypes,
  visualTextDocumentSchema,
  visualTextFlowSchema,
  visualTextPaintSchema,
  visualTextTypographySchema,
} from "@hypit/composition";
import { mediaDependency, mediaTypes } from "@hypit/media";
import {
  mediaFramePresentationSchema,
  mediaLayerSetSchema,
  mediaLifecycleMotionSchema,
  mediaTrackDependency,
  mediaTrackTypes,
} from "@hypit/media-track";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { semanticMapDependency, semanticMapTypes } from "@hypit/semantic-map";
import { spatialDependency, spatialFrameSchema, spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import { temporalDependency } from "@hypit/temporal";
import { textDependency, textTypes } from "@hypit/text";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const depthStackModuleRef = { name: "@hypit/deck-track", version: "1" } as const;
export const depthStackTypes = {
  header: { module: depthStackModuleRef, name: "DepthStackHeader" },
  spec: { module: depthStackModuleRef, name: "DepthStackSpec" },
  cardSpec: { module: depthStackModuleRef, name: "DepthStackCardSpec" },
  cardLabel: { module: depthStackModuleRef, name: "DepthStackCardLabel" },
  cardLabelStyle: { module: depthStackModuleRef, name: "DepthStackCardLabelStyle" },
  cardSet: { module: depthStackModuleRef, name: "DepthStackCardSet" },
  program: { module: depthStackModuleRef, name: "DepthStackProgram" },
} satisfies Record<string, TypeRef>;
export const depthStackProducers = {
  createCards: { module: depthStackModuleRef, name: "create-depth-stack-card-set" },
  appendMomentCard: { module: depthStackModuleRef, name: "append-depth-stack-moment-card" },
  finalizeProgramEnd: { module: depthStackModuleRef, name: "finalize-depth-stack-at-program-end" },
  finalizeUntilMoment: { module: depthStackModuleRef, name: "finalize-depth-stack-until-moment" },
  finalizeUntilSelectionStart: { module: depthStackModuleRef, name: "finalize-depth-stack-until-selection-start" },
  finalizeUntilSelectionEnd: { module: depthStackModuleRef, name: "finalize-depth-stack-until-selection-end" },
  render: { module: depthStackModuleRef, name: "render-depth-stack" },
  bindLabelText: { module: depthStackModuleRef, name: "bind-depth-stack-label-text" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const positive = { kind: "number", minimum: 0.000001 } as const;
const integer = { kind: "number", integer: true } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const enumString = (values: readonly string[]): ValueSchema => ({ kind: "string", enum: values });
const tone = object({ brightness: { schema: positive }, contrast: { schema: positive }, saturation: { schema: positive } });
const pose = object({
  xPx: { schema: number }, yPx: { schema: number }, scale: { schema: positive }, rotationDeg: { schema: number },
  opacity: { schema: { kind: "number", minimum: 0, maximum: 1 } }, stacking: { schema: integer }, tone: { schema: tone },
});
const poseStep = object({
  xPerDepthPx: { schema: number }, yPerDepthPx: { schema: number }, scalePerDepth: { schema: positive },
  rotationPerDepthDeg: { schema: number }, rotationMode: { schema: enumString(["linear", "alternate"]) },
  opacityPerDepth: { schema: { kind: "number", minimum: 0, maximum: 1 } }, stackingPerDepth: { schema: integer },
  tonePerDepth: { schema: tone },
});
const playback = object({
  future: { schema: enumString(["hold-head", "continue"]) },
  past: { schema: enumString(["hold-tail", "continue", "hide"]) },
});

export const depthStackSpecSchema: ValueSchema = object({

  visibility: { schema: object({ previous: { schema: unsignedInteger }, next: { schema: unsignedInteger }, wrap: { schema: { kind: "boolean" } } }) },
  poses: { schema: object({ current: { schema: pose }, previous: { schema: poseStep }, next: { schema: poseStep } }) },
  reflow: { schema: object({ durationFrames: { schema: unsignedInteger }, easing: { schema: enumString(["linear", "ease-in", "ease-out", "ease-in-out"]) } }) },
  presentation: { schema: mediaFramePresentationSchema }, motion: { schema: mediaLifecycleMotionSchema }, stackingOrder: { schema: integer },
});
export const depthStackCardSpecSchema: ValueSchema = object({
  id: { schema: string }, playback: { schema: playback },
});
export const depthStackCardLabelSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "none" } } }),
  object({
    kind: { schema: { kind: "literal", value: "text" } },
    document: { schema: visualTextDocumentSchema }, typography: { schema: visualTextTypographySchema },
    paints: { schema: { kind: "array", items: visualTextPaintSchema } }, flow: { schema: visualTextFlowSchema },
  }),
] };
export const depthStackCardLabelStyleSchema: ValueSchema = object({

  typography: { schema: visualTextTypographySchema }, paints: { schema: { kind: "array", items: visualTextPaintSchema } },
  flow: { schema: visualTextFlowSchema },
});
const frameSpan = object({ startFrame: { schema: unsignedInteger }, endFrameExclusive: { schema: positiveInteger } });
const card = object({
  id: { schema: string }, activationFrame: { schema: unsignedInteger }, material: { schema: mediaLayerSetSchema },
  label: { schema: depthStackCardLabelSchema }, playback: { schema: playback },
});
export const depthStackHeaderSchema: ValueSchema = object({
  id: { schema: string },
});
export const depthStackCardSetSchema: ValueSchema = object({
  cards: { schema: { kind: "array", items: card } },
});
export const depthStackProgramSchema: ValueSchema = object({
  id: { schema: string }, span: { schema: frameSpan },
  terminalFrame: { schema: positiveInteger }, frame: { schema: spatialFrameSchema }, spec: { schema: depthStackSpecSchema },
  cards: { schema: { kind: "array", minItems: 1, items: card } },
});
const finalizeInputs = [
  { name: "set", type: depthStackTypes.cardSet }, { name: "header", type: depthStackTypes.header },
  { name: "frame", type: spatialTypes.frame }, { name: "spec", type: depthStackTypes.spec },
  { name: "space", type: programSpaceTypes.programSpace },
] as const;

export const depthStackMarkupSurfaces = [
    { name: "label", tag: "Label", mode: "structured", outputs: [textTypes.text, depthStackTypes.cardLabelStyle, depthStackTypes.cardLabel],
      vocabulary: {
        summary: "Binds label copy to one exact font stack and one label appearance, and publishes the label a Card carries.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this label so a Card can reference it." },
          { name: "content", kind: "reference", required: false, accepts: [textTypes.text],
            summary: "Chooses an existing Text as the label copy in place of the element's own text." },
          { name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontStack],
            summary: "Chooses the exact font stack the label is set in." },
          { name: "size", kind: "literal", required: false,
            summary: "Sets the type size of the label copy in pixels." },
          { name: "color", kind: "literal", required: false,
            summary: "Sets the color the label copy is painted in." },
          { name: "align", kind: "literal", required: false, values: ["start", "center", "end", "justify"],
            summary: "Places the copy across the inline axis of the label box." },
          { name: "block", kind: "literal", required: false, values: ["start", "center", "end"],
            summary: "Places the copy along the block axis of the label box." },
          { name: "padding", kind: "literal", required: false,
            summary: "Sets the padding in pixels on every edge of the label box." },
        ],
        ports: [
          { name: "", type: depthStackTypes.cardLabel,
            summary: "The bound label, addressed by the element's own id." },
        ],
        text: "The element's own text is the label copy whenever `content` is absent; writing both is refused.",
        example: `<deck:Label id="proof-label-style" content={proof-label}
  font={fonts.ui} size="34" color="#ffffff"/>`,
        notes: [
          "`size` defaults to 34, `color` to `#ffffff`, `align` to `center`, `block` to `end` and `padding` to 20.",
          "The element accepts no child elements; filenames, URLs and media metadata are never read as label copy.",
        ],
      } },
    { name: "track", tag: "DepthStack", mode: "structured", outputs: [
      depthStackTypes.header, depthStackTypes.spec, depthStackTypes.cardSpec,
      spatialTypes.fit, mediaTrackTypes.sampleLayerSpec, mediaTrackTypes.paintLayerSpec,
      depthStackTypes.cardLabel, depthStackTypes.cardLabelStyle, textTypes.text,
      depthStackTypes.program, compositionTypes.visualTrack,
    ],
      vocabulary: {
        summary: "Deals ordered Cards into one Frame, each at its own Moment, and publishes the deck and the VisualTrack it renders to.",
        appearance: "One leaning pile of overlapping picture Cards inside a single Frame, every Card drawn over the same rectangle and told apart only by its pose. The Card most recently dealt sits in front, upright and at full size; each Card dealt before it stands one step further behind — shifted down, smaller, tilted, fainter and duller with every step — and each Card still to come peeks out the opposite way, with two behind and one ahead kept on screen by default, so at most four Cards share the Frame. A Card is its own still, timed or surface picture fitted into that Frame, optionally over a painted Frame, inside a rounded clip and behind a border and shadows, and may carry a line of label copy laid across it. Cards arrive one at a time in document order: at each Card's Moment the arriving Card fades in from beyond the visible neighborhood and the whole pile slides, scales and rotates into its new poses over a handful of Frames, the Card pushed off the back fading out, and the pile as a whole may arrive, drift and leave as one.",
        preview: previewImage("DepthStack.png"),
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this deck so its Program and Track can be referenced elsewhere in the Source." },
          { name: "map", kind: "reference", required: true, accepts: [semanticMapTypes.complete],
            summary: "Chooses the SemanticMap that places each Card's Moment in the programme." },
          { name: "space", kind: "reference", required: true, accepts: [programSpaceTypes.programSpace],
            summary: "Chooses the ProgramSpace the deck is timed against." },
          { name: "canvas", kind: "reference", required: true, accepts: [spatialTypes.canvas],
            summary: "Chooses the Canvas the deck is rendered into." },
          { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame],
            summary: "Chooses the Frame the whole stack occupies." },
          { name: "appearance", kind: "reference", required: true, accepts: [svsRecipeType],
            summary: "Chooses the Recipe for visibility, depth poses, frame Paint, motion and reflow, and the Recipe every Card falls back to.",
            recipe: [
              { name: "visible-previous", required: false, fallback: "2",
                summary: "Sets how many Cards dealt before the current one stay on screen behind it." },
              { name: "visible-next", required: false, fallback: "1",
                summary: "Sets how many Cards still to be dealt stay on screen behind the current one." },
              { name: "wrap", required: false, fallback: "false",
                summary: "Decides whether depth wraps around the ends of the deck so the first and last Cards are neighbours." },
              { name: "current-x", required: false, fallback: "0",
                summary: "Offsets the current Card horizontally within the Frame in pixels." },
              { name: "current-y", required: false, fallback: "0",
                summary: "Offsets the current Card vertically within the Frame in pixels." },
              { name: "current-scale", required: false, fallback: "1",
                summary: "Scales the current Card about its own center." },
              { name: "current-rotation", required: false, fallback: "0",
                summary: "Tilts the current Card in degrees about its own center." },
              { name: "current-opacity", required: false, fallback: "1",
                summary: "Sets the opacity the current Card is drawn at." },
              { name: "current-stacking", required: false, fallback: "0",
                summary: "Places the current Card in the deck's own stacking order, above the Cards behind it." },
              { name: "current-brightness", required: false, fallback: "1",
                summary: "Sets the brightness the current Card is toned to." },
              { name: "current-contrast", required: false, fallback: "1",
                summary: "Sets the contrast the current Card is toned to." },
              { name: "current-saturation", required: false, fallback: "1",
                summary: "Sets the saturation the current Card is toned to." },
              { name: "previous-x-step", required: false, fallback: "0",
                summary: "Shifts each already dealt Card horizontally by this many pixels for every step it stands behind the current one." },
              { name: "previous-y-step", required: false, fallback: "28",
                summary: "Shifts each already dealt Card vertically by this many pixels for every step it stands behind the current one." },
              { name: "previous-scale-step", required: false, fallback: "0.94",
                summary: "Scales each already dealt Card by this factor for every step it stands behind the current one." },
              { name: "previous-rotation-step", required: false, fallback: "-2.5",
                summary: "Tilts each already dealt Card by this many degrees for every step it stands behind the current one." },
              { name: "previous-rotation-mode", required: false, values: ["linear", "alternate"], fallback: "alternate",
                summary: "Decides whether that tilt accumulates in one direction or alternates side to side with each step of depth." },
              { name: "previous-opacity-step", required: false, fallback: "0.82",
                summary: "Multiplies the opacity of each already dealt Card for every step it stands behind the current one." },
              { name: "previous-stacking-step", required: false, fallback: "-1",
                summary: "Moves each already dealt Card this far down the deck's stacking order for every step it stands behind the current one." },
              { name: "next-x-step", required: false, fallback: "0",
                summary: "Shifts each undealt Card horizontally by this many pixels for every step it stands ahead of the current one." },
              { name: "next-y-step", required: false, fallback: "-20",
                summary: "Shifts each undealt Card vertically by this many pixels for every step it stands ahead of the current one." },
              { name: "next-scale-step", required: false, fallback: "0.92",
                summary: "Scales each undealt Card by this factor for every step it stands ahead of the current one." },
              { name: "next-rotation-step", required: false, fallback: "2",
                summary: "Tilts each undealt Card by this many degrees for every step it stands ahead of the current one." },
              { name: "next-rotation-mode", required: false, values: ["linear", "alternate"], fallback: "alternate",
                summary: "Decides whether that tilt accumulates in one direction or alternates side to side with each step of depth." },
              { name: "next-opacity-step", required: false, fallback: "0.72",
                summary: "Multiplies the opacity of each undealt Card for every step it stands ahead of the current one." },
              { name: "next-stacking-step", required: false, fallback: "-1",
                summary: "Moves each undealt Card this far down the deck's stacking order for every step it stands ahead of the current one." },
              { name: "reflow-frames", required: false, fallback: "8",
                summary: "Sets how many Frames the stack takes to settle into its new poses after a Card is dealt." },
              { name: "reflow-easing", required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], fallback: "ease-in-out",
                summary: "Shapes that settling over its Frames." },
              { name: "stack-order", required: false, fallback: "30",
                summary: "Sets the base stacking order the deck takes among the Film's visual Tracks, which each Card's own depth stacking is added to." },
              { name: "clip", required: false, values: ["none", "frame", "rounded"], fallback: "frame",
                summary: "Decides whether a Card is clipped to its Frame, to a rounded Frame, or not at all." },
              { name: "radius", required: false, fallback: "0",
                summary: "Rounds the corners a `rounded` clip cuts to, in pixels." },
              { name: "padding", required: false, fallback: "0",
                summary: "Insets the picture from the Card's Frame in pixels, written as one, two or four edge values." },
              { name: "border-width", required: false, fallback: "0",
                summary: "Sets the thickness of the border drawn around a Card in pixels, and at `0` no border is drawn at all." },
              { name: "border-style", required: false, values: ["solid", "dashed", "dotted"], fallback: "solid",
                summary: "Selects the stroke that border is drawn with." },
              { name: "border-color", required: false,
                summary: "Colors that border, and is required whenever `border-width` is not `0`." },
              { name: "shadows", required: false, fallback: "none",
                summary: "Casts shadows behind a Card, as `x y blur spread color` entries separated by semicolons." },
              { name: "enter", required: false, values: ["none", "fade", "slide", "scale", "pop", "bounce", "blur-reveal", "wipe", "flip", "spin"], fallback: "none",
                summary: "Selects how the deck arrives at the start of its span." },
              { name: "enter-frames", required: false,
                summary: "Sets how many Frames that arrival takes, and is required whenever `enter` is anything but `none`." },
              { name: "enter-easing", required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], fallback: "ease-in-out",
                summary: "Shapes the arrival's progress over its Frames." },
              { name: "enter-direction", required: false, values: ["left", "right", "up", "down"],
                summary: "Sends the arrival in one direction, for the operators that travel." },
              { name: "enter-amount", required: false,
                summary: "Sets how far the arrival travels or scales, in the units its operator reads." },
              { name: "enter-origin", required: false, values: ["outside-canvas"],
                summary: "Starts the arrival from beyond the Canvas rather than from the deck's own Frame." },
              { name: "sustain", required: false, fallback: "none",
                summary: "Keeps the deck moving between its arrival and its departure, as `operator amount cycles [direction]` entries separated by commas, over `float`, `breathe`, `pulse`, `wobble`, `shake` and `drift`." },
              { name: "exit", required: false, values: ["none", "fade", "slide", "scale", "pop", "bounce", "blur-reveal", "wipe", "flip", "spin"], fallback: "none",
                summary: "Selects how the deck leaves at the end of its span." },
              { name: "exit-frames", required: false,
                summary: "Sets how many Frames that departure takes, and is required whenever `exit` is anything but `none`." },
              { name: "exit-easing", required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], fallback: "ease-in-out",
                summary: "Shapes the departure's progress over its Frames." },
              { name: "exit-direction", required: false, values: ["left", "right", "up", "down"],
                summary: "Sends the departure in one direction, for the operators that travel." },
              { name: "exit-amount", required: false,
                summary: "Sets how far the departure travels or scales, in the units its operator reads." },
              { name: "exit-origin", required: false, values: ["outside-canvas"],
                summary: "Carries the departure out beyond the Canvas rather than stopping at the deck's own Frame." },
              { name: "fit", required: false, values: ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"], fallback: "contain",
                summary: "Decides how a Card's picture is sized against the Card's Frame." },
              { name: "frame-x", required: false, fallback: "0.5",
                summary: "Picks the horizontal point of the Card's Frame the picture is anchored to, as a fraction of its width." },
              { name: "frame-y", required: false, fallback: "0.5",
                summary: "Picks the vertical point of the Card's Frame the picture is anchored to, as a fraction of its height." },
              { name: "content-x", required: false, fallback: "0.5",
                summary: "Picks the horizontal point of the picture that meets that Frame point, as a fraction of its width." },
              { name: "content-y", required: false, fallback: "0.5",
                summary: "Picks the vertical point of the picture that meets that Frame point, as a fraction of its height." },
              { name: "fit-offset-x", required: false, fallback: "0",
                summary: "Nudges the fitted picture horizontally in pixels after it is anchored." },
              { name: "fit-offset-y", required: false, fallback: "0",
                summary: "Nudges the fitted picture vertically in pixels after it is anchored." },
              { name: "fit-constraint", required: false, values: ["bounded", "free"], fallback: "bounded",
                summary: "Decides whether the fitted picture is held inside the Card's Frame or allowed to run past it." },
              { name: "frame-paint", required: false, fallback: "transparent",
                summary: "Fills the Card's Frame behind its picture, as a color, `linear(angle;stops)` or `radial(x,y;stops)`." },
              { name: "opacity", required: false, fallback: "1",
                summary: "Sets the opacity the Card's picture is sampled at, before any depth pose is applied." },
              { name: "blur", required: false, fallback: "0",
                summary: "Blurs the Card's picture by this radius in pixels." },
              { name: "brightness", required: false, fallback: "1",
                summary: "Sets the brightness the Card's picture is sampled at, before any depth tone is applied." },
              { name: "contrast", required: false, fallback: "1",
                summary: "Sets the contrast the Card's picture is sampled at, before any depth tone is applied." },
              { name: "saturation", required: false, fallback: "1",
                summary: "Sets the saturation the Card's picture is sampled at, before any depth tone is applied." },
              { name: "playback", required: false, values: ["once-start", "once-end", "hold-start", "hold-end", "loop-start", "loop-end", "stretch"], fallback: "once-start",
                summary: "Decides how timed material occupies the Card's window, and is refused on a still image." },
              { name: "trim-start", required: false,
                summary: "Starts timed material at this frame of its own timeline, and must be written together with `trim-end`." },
              { name: "trim-end", required: false,
                summary: "Ends timed material before this frame of its own timeline, and must be written together with `trim-start`." },
              { name: "playback-future", required: false, values: ["hold-head", "continue"], fallback: "hold-head",
                summary: "Decides what a Card shows before it is dealt: its first frame held, or its own timeline running on." },
              { name: "playback-past", required: false, values: ["hold-tail", "continue", "hide"], fallback: "hold-tail",
                summary: "Decides what a Card shows once its material is spent: its last frame held, its own timeline running on, or nothing." },
            ] },
          { name: "until", kind: "expression", required: true, values: ["program.end"],
            accepts: [narrativeTypes.moment, narrativeTypes.selection],
            summary: "Ends the deck at the literal `program.end`, at a Moment, or at a Selection." },
          { name: "until-boundary", kind: "literal", required: false, values: ["start", "end"],
            summary: "Chooses which edge of the ending Selection ends the deck." },
        ],
        children: [
          { tag: "Card", cardinality: "many",
            summary: "One card of the stack, dealt at its own Moment in document order.",
            attributes: [
              { name: "id", kind: "identifier", required: true,
                summary: "Names this Card within the deck." },
              { name: "source", kind: "reference", required: true,
                accepts: [artifactTypes.blob, mediaTypes.synchronized, mediaTypes.compositableSurface],
                summary: "Chooses the picture the Card shows, as a still image Artifact, a Synchronized Medium or a Compositable Surface." },
              { name: "extent", kind: "reference", required: false, accepts: [spatialTypes.extent],
                summary: "Gives a still image its pixel Extent, which timed and surface sources already carry." },
              { name: "at", kind: "reference", required: true, accepts: [narrativeTypes.moment],
                summary: "Chooses the Moment the Card is dealt on." },
              { name: "appearance", kind: "reference", required: false, accepts: [svsRecipeType],
                summary: "Chooses this Card's own Recipe in place of the deck's, adding explicit future and past playback.",
                recipe: [
                  { name: "fit", required: false, values: ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"], fallback: "contain",
                    summary: "Decides how this Card's picture is sized against the Card's Frame." },
                  { name: "frame-x", required: false, fallback: "0.5",
                    summary: "Picks the horizontal point of the Card's Frame the picture is anchored to, as a fraction of its width." },
                  { name: "frame-y", required: false, fallback: "0.5",
                    summary: "Picks the vertical point of the Card's Frame the picture is anchored to, as a fraction of its height." },
                  { name: "content-x", required: false, fallback: "0.5",
                    summary: "Picks the horizontal point of the picture that meets that Frame point, as a fraction of its width." },
                  { name: "content-y", required: false, fallback: "0.5",
                    summary: "Picks the vertical point of the picture that meets that Frame point, as a fraction of its height." },
                  { name: "fit-offset-x", required: false, fallback: "0",
                    summary: "Nudges the fitted picture horizontally in pixels after it is anchored." },
                  { name: "fit-offset-y", required: false, fallback: "0",
                    summary: "Nudges the fitted picture vertically in pixels after it is anchored." },
                  { name: "fit-constraint", required: false, values: ["bounded", "free"], fallback: "bounded",
                    summary: "Decides whether the fitted picture is held inside the Card's Frame or allowed to run past it." },
                  { name: "frame-paint", required: false, fallback: "transparent",
                    summary: "Fills this Card's Frame behind its picture, as a color, `linear(angle;stops)` or `radial(x,y;stops)`." },
                  { name: "opacity", required: false, fallback: "1",
                    summary: "Sets the opacity this Card's picture is sampled at, before any depth pose is applied." },
                  { name: "blur", required: false, fallback: "0",
                    summary: "Blurs this Card's picture by this radius in pixels." },
                  { name: "brightness", required: false, fallback: "1",
                    summary: "Sets the brightness this Card's picture is sampled at, before any depth tone is applied." },
                  { name: "contrast", required: false, fallback: "1",
                    summary: "Sets the contrast this Card's picture is sampled at, before any depth tone is applied." },
                  { name: "saturation", required: false, fallback: "1",
                    summary: "Sets the saturation this Card's picture is sampled at, before any depth tone is applied." },
                  { name: "playback", required: false, values: ["once-start", "once-end", "hold-start", "hold-end", "loop-start", "loop-end", "stretch"], fallback: "once-start",
                    summary: "Decides how timed material occupies this Card's window, and is refused on a still image." },
                  { name: "trim-start", required: false,
                    summary: "Starts timed material at this frame of its own timeline, and must be written together with `trim-end`." },
                  { name: "trim-end", required: false,
                    summary: "Ends timed material before this frame of its own timeline, and must be written together with `trim-start`." },
                  { name: "playback-future", required: false, values: ["hold-head", "continue"], fallback: "hold-head",
                    summary: "Decides what this Card shows before it is dealt: its first frame held, or its own timeline running on." },
                  { name: "playback-past", required: false, values: ["hold-tail", "continue", "hide"], fallback: "hold-tail",
                    summary: "Decides what this Card shows once its material is spent: its last frame held, its own timeline running on, or nothing." },
                ] },
              { name: "label", kind: "reference", required: false, accepts: [depthStackTypes.cardLabel],
                summary: "Chooses the bound label this Card carries; without it the Card is unlabelled." },
            ] },
        ],
        ports: [
          { name: "program", type: depthStackTypes.program,
            summary: "The resolved deck: its span, its Frame, its spec and its ordered Cards." },
          { name: "track", type: compositionTypes.visualTrack,
            summary: "The rendered deck, an ordinary peer VisualTrack." },
        ],
        example: `<deck:DepthStack
  id="proof-stack"
  map={timing.map}
  space={speech.space}
  canvas={vertical}
  frame={layout.proof-stack}
  until={story.selection.proof}
  appearance={studio.deck.proof}
>
  <deck:Card id="proof-1" source={proof1.image} extent={proof1.extent}
    at={story.moment.proof1} label={proof-label-style}/>
  <deck:Card id="proof-2" source={proof2.video} at={story.moment.proof2}/>
</deck:DepthStack>`,
        notes: [
          "The deck requires at least one Card, and a Card is empty.",
          "`extent` is required for a still image source and refused for a Synchronized Medium or a Compositable Surface.",
          "`until-boundary` defaults to `end` and is refused unless `until` names a Selection.",
          "Both Recipes are closed: any property outside the ones listed here is refused, and a Card without its own `appearance` reads the deck's Recipe for fit, sampling, frame Paint and playback.",
        ],
      } },
  ] as const;


export const depthStackManifest: ModuleManifest = {
  format: "hypit.module@1", name: depthStackModuleRef.name, version: depthStackModuleRef.version,
  dependencies: [narrativeDependency, semanticMapDependency, programSpaceDependency, spatialDependency, temporalDependency, mediaDependency, mediaTrackDependency, compositionDependency, textDependency],
  types: [
    { name: depthStackTypes.header.name },
    { name: depthStackTypes.spec.name },
    { name: depthStackTypes.cardSpec.name },
    { name: depthStackTypes.cardLabel.name },
    { name: depthStackTypes.cardLabelStyle.name },
    { name: depthStackTypes.cardSet.name },
    { name: depthStackTypes.program.name },
  ], capabilities: [],
  producers: [
    { name: depthStackProducers.bindLabelText.name, inputs: [{ name: "style", type: depthStackTypes.cardLabelStyle }, { name: "content", type: textTypes.text }], outputs: [{ name: "label", type: depthStackTypes.cardLabel }], needs: [] },
    { name: depthStackProducers.createCards.name, inputs: [], outputs: [{ name: "set", type: depthStackTypes.cardSet }], needs: [] },
    { name: depthStackProducers.appendMomentCard.name, inputs: [
      { name: "set", type: depthStackTypes.cardSet }, { name: "material", type: mediaTrackTypes.layerSet },
      { name: "label", type: depthStackTypes.cardLabel }, { name: "spec", type: depthStackTypes.cardSpec },
      { name: "map", type: semanticMapTypes.complete }, { name: "moment", type: narrativeTypes.moment },
      { name: "space", type: programSpaceTypes.programSpace },
    ], outputs: [{ name: "set", type: depthStackTypes.cardSet }], needs: [] },
    { name: depthStackProducers.finalizeProgramEnd.name, inputs: finalizeInputs, outputs: [{ name: "program", type: depthStackTypes.program }], needs: [] },
    ...([
      [depthStackProducers.finalizeUntilMoment, narrativeTypes.moment],
      [depthStackProducers.finalizeUntilSelectionStart, narrativeTypes.selection],
      [depthStackProducers.finalizeUntilSelectionEnd, narrativeTypes.selection],
    ] as const).map(([producer, terminalType]) => ({
      name: producer.name, inputs: [...finalizeInputs, { name: "map", type: semanticMapTypes.complete }, { name: "terminal", type: terminalType }],
      outputs: [{ name: "program", type: depthStackTypes.program }], needs: [],
    })),
    { name: depthStackProducers.render.name, inputs: [
      { name: "canvas", type: spatialTypes.canvas }, { name: "space", type: programSpaceTypes.programSpace },
      { name: "program", type: depthStackTypes.program },
    ], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
  ],
};
export const depthStackDependency = { module: depthStackModuleRef } as const;
