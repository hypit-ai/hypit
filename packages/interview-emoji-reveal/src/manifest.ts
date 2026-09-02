import { readFile } from "node:fs/promises";

import { artifactDependency, artifactTypes } from "@hypit/artifact";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { semanticTrackDependency, semanticTrackTypes } from "@hypit/semantic-track";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import { temporalDependency, temporalInstantSchema, temporalTypes, temporalWindowSchema } from "@hypit/temporal";
import { temporalWindowAttributeVocabulary } from "@hypit/temporal-markup";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const emojiRevealModuleRef = { name: "@hypit/interview-emoji-reveal", version: "1" } as const;

export const emojiRevealTypes = {
  header: { module: emojiRevealModuleRef, name: "EmojiRevealHeader" },
  style: { module: emojiRevealModuleRef, name: "EmojiRevealStyle" },
  itemSpec: { module: emojiRevealModuleRef, name: "EmojiRevealItemSpec" },
  set: { module: emojiRevealModuleRef, name: "EmojiRevealSet" },
  program: { module: emojiRevealModuleRef, name: "EmojiRevealProgram" },
} satisfies Record<string, TypeRef>;

export const emojiRevealProducers = {
  createSet: { module: emojiRevealModuleRef, name: "create-emoji-reveal-set" },
  appendItem: { module: emojiRevealModuleRef, name: "append-emoji-reveal-item" },
  finalize: { module: emojiRevealModuleRef, name: "finalize-emoji-reveal" },
  render: { module: emojiRevealModuleRef, name: "render-emoji-reveal" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const positive = { kind: "number", minimum: 0.000001 } as const;
const nonNegative = { kind: "number", minimum: 0 } as const;
const number = { kind: "number" } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const blob = object({
  kind: { schema: { kind: "literal", value: "blob" } },
  digest: { schema: { kind: "string", minLength: 71, maxLength: 71 } },
  size: { schema: { kind: "number", integer: true, minimum: 0 } },
  mediaType: { schema: string },
});

export const emojiRevealHeaderSchema: ValueSchema = object({ id: { schema: string } });
export const emojiRevealItemSpecSchema: ValueSchema = object({
  id: { schema: string },
});
export const emojiRevealStyleSchema: ValueSchema = object({
  id: { schema: string },
  centerX: { schema: number }, topY: { schema: number },
  slotSizePx: { schema: positive }, gapPx: { schema: nonNegative },
  paddingXPx: { schema: nonNegative }, paddingYPx: { schema: nonNegative },
  background: { schema: string }, borderColor: { schema: string }, borderWidthPx: { schema: nonNegative }, radiusPx: { schema: nonNegative },
  shadowColor: { schema: string }, shadowXPx: { schema: number }, shadowYPx: { schema: number }, shadowBlurPx: { schema: nonNegative }, shadowSpreadPx: { schema: number },
  iconSizePx: { schema: positive }, revealFrames: { schema: positiveInteger }, stackingOrder: { schema: integer },
});
const emojiRevealItemSchema: ValueSchema = object({
  spec: { schema: emojiRevealItemSpecSchema }, icon: { schema: blob }, activation: { schema: temporalInstantSchema },
});
export const emojiRevealSetSchema: ValueSchema = object({
  items: { schema: { kind: "array", items: emojiRevealItemSchema } },
});
export const emojiRevealProgramSchema: ValueSchema = object({
  id: { schema: string }, programSpaceId: { schema: string }, outer: { schema: temporalWindowSchema },
  style: { schema: emojiRevealStyleSchema }, placeholder: { schema: blob },
  items: { schema: { kind: "array", minItems: 1, items: emojiRevealItemSchema } },
});

const recipe = [
  ["center-x", "0.5", "Places the adaptive strip by its horizontal centre as a fraction of Canvas width."],
  ["top-y", "0.07", "Places the strip's top edge as a fraction of Canvas height."],
  ["slot-size", "72", "Sets the fixed width and height of each SVG slot in pixels."],
  ["slot-gap", "10", "Sets the gap between adjacent slots in pixels."],
  ["padding-x", "18", "Insets the first and last slots from the board's horizontal edges."],
  ["padding-y", "14", "Insets every slot from the board's top and bottom edges."],
  ["background", "#FFFDF7", "Fills the single board behind all slots."],
  ["border-color", "#161616", "Colors the board outline."],
  ["border-width", "4", "Sets the board outline thickness in pixels."],
  ["radius", "22", "Rounds the board corners in pixels."],
  ["shadow-color", "#000000B8", "Colors the board's external shadow."],
  ["shadow-x", "9", "Offsets the board shadow to the right in pixels."],
  ["shadow-y", "10", "Offsets the board shadow down in pixels."],
  ["shadow-blur", "0", "Sets the board shadow blur in pixels; zero makes the meme-style hard shadow."],
  ["shadow-spread", "0", "Grows or shrinks the board shadow in pixels."],
  ["icon-size", "48", "Sets the square SVG viewport size in pixels."],
  ["reveal-frames", "6", "Sets the duration of one icon's overshoot-and-settle reveal."],
  ["stack-order", "66", "Sets the strip's absolute visual stacking order."],
] as const;

export const emojiRevealMarkupSurfaces = [
  { name: "style", tag: "Style", mode: "structured", outputs: [emojiRevealTypes.style],
    vocabulary: {
      summary: "Compiles one Recipe into the visual Style shared by an SVG Reveal strip.",
      attributes: [
        { name: "id", kind: "identifier", required: true, summary: "Names this Style." },
        { name: "recipe", kind: "reference", required: true, accepts: [svsRecipeType],
          summary: "Chooses the Recipe that controls placement, board paint, slot geometry and reveal motion.",
          recipe: recipe.map(([name, fallback, summary]) => ({ name, required: false, fallback, summary })) },
      ],
      example: `<emoji:Style id="emoji-strip" recipe={styles.emoji-strip}/>` ,
      notes: ["The Style owns appearance and placement, but never semantic timing."],
    } },
  { name: "track", tag: "Track", mode: "structured",
    outputs: [emojiRevealTypes.header, emojiRevealTypes.itemSpec, temporalTypes.instantSpec, temporalTypes.windowSpec, temporalTypes.instant, temporalTypes.window, emojiRevealTypes.program, compositionTypes.visualTrack],
    vocabulary: {
      summary: "Draws one adaptive row of placeholder icon slots and replaces them from left to right at authored semantic Moments.",
      appearance: "A compact rounded rectangle centered near the top of the frame, with a dark outline and a hard lower-right shadow. Its width is computed from the number of fixed-size slots. Every slot starts with the same supplied placeholder icon. At each item's semantic Moment that slot is replaced by its supplied icon with a brief overshoot and settle, while earlier answers remain visible and later slots remain unanswered.",
      preview: previewImage("Track.png"),
      attributes: [
        { name: "id", kind: "identifier", required: true, summary: "Names the reveal Program and Track." },
        { name: "semantic", kind: "reference", required: true, accepts: [semanticTrackTypes.track], summary: "Chooses the SemanticTrack whose frame domain projects the outer Window and every Moment." },
        { name: "canvas", kind: "reference", required: true, accepts: [spatialTypes.canvas], summary: "Chooses the Canvas used for normalized top placement." },
        { name: "style", kind: "reference", required: true, accepts: [emojiRevealTypes.style], summary: "Chooses the strip Style." },
        { name: "placeholder", kind: "reference", required: true, accepts: [artifactTypes.blob], summary: "Supplies the one image drawn in every unrevealed slot." },
        ...temporalWindowAttributeVocabulary,
      ],
      children: [{ tag: "Item", cardinality: "many", summary: "One left-to-right answer slot revealed at exactly one semantic Moment.", attributes: [
        { name: "id", kind: "identifier", required: true, summary: "Names this answer slot and the timing subject it owns." },
        { name: "icon", kind: "reference", required: true, accepts: [artifactTypes.blob], summary: "Supplies this answer as an image Artifact from the same visual icon family as the placeholder." },
        { name: "at", kind: "reference", required: true, accepts: [narrativeTypes.moment], summary: "Chooses the only legal reveal authority: an authored semantic Moment." },
      ] }],
      ports: [
        { name: "program", type: emojiRevealTypes.program, summary: "The adaptive strip with its projected outer Window and fully traced Moment activations." },
        { name: "track", type: compositionTypes.visualTrack, summary: "That Program rendered as an ordinary VisualTrack." },
      ],
      example: `<emoji:Track id="rules" semantic={speech.semantic} canvas={vertical} style={emoji-strip} placeholder={question-icon} during="program">
  <emoji:Item id="manifest" icon={manifest-icon} at={story.moment.manifest}/>
  <emoji:Item id="real-estate" icon={real-estate-icon} at={story.moment.real-estate}/>
  <emoji:Item id="bitcoin" icon={bitcoin-icon} at={story.moment.bitcoin}/>
</emoji:Track>`,
      notes: [
        "Item order is display order and must also be strict chronological reveal order.",
        "Item.at accepts only a Moment: Selection boundaries, numeric instants and boundary fallbacks are intentionally absent.",
        "The outer Track Window is separate from the child reveal Moments and uses the shared temporal Window protocol.",
      ],
    } },
] as const;

export const emojiRevealManifest: ModuleManifest = {
  format: "hypit.module@1", name: emojiRevealModuleRef.name, version: emojiRevealModuleRef.version,
  dependencies: [artifactDependency, narrativeDependency, programSpaceDependency, semanticTrackDependency, spatialDependency, temporalDependency, compositionDependency],
  types: [
    { name: emojiRevealTypes.header.name }, { name: emojiRevealTypes.style.name },
    { name: emojiRevealTypes.itemSpec.name }, { name: emojiRevealTypes.set.name }, { name: emojiRevealTypes.program.name },
  ],
  capabilities: [],
  producers: [
    { name: emojiRevealProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: emojiRevealTypes.set }], needs: [] },
    { name: emojiRevealProducers.appendItem.name,
      inputs: [{ name: "set", type: emojiRevealTypes.set }, { name: "space", type: programSpaceTypes.programSpace }, { name: "spec", type: emojiRevealTypes.itemSpec }, { name: "icon", type: artifactTypes.blob }, { name: "activation", type: temporalTypes.instant }],
      outputs: [{ name: "set", type: emojiRevealTypes.set }], needs: [] },
    { name: emojiRevealProducers.finalize.name,
      inputs: [{ name: "header", type: emojiRevealTypes.header }, { name: "space", type: programSpaceTypes.programSpace }, { name: "outer", type: temporalTypes.window }, { name: "style", type: emojiRevealTypes.style }, { name: "placeholder", type: artifactTypes.blob }, { name: "set", type: emojiRevealTypes.set }],
      outputs: [{ name: "program", type: emojiRevealTypes.program }], needs: [] },
    { name: emojiRevealProducers.render.name,
      inputs: [{ name: "canvas", type: spatialTypes.canvas }, { name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: emojiRevealTypes.program }],
      outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
  ],
};

export const emojiRevealDependency = { module: emojiRevealModuleRef } as const;
