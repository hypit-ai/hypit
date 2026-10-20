import { timelineTypes, timelineDependency } from "@hypit/timeline";
import { temporalContextAttributeVocabulary } from "@hypit/temporal/markup";
import { readFile } from "node:fs/promises";

import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { compositionDependency, compositionTypes } from "@hypit/composition";

import { blobRefSchema } from "@hypit/hypit/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/hypit/recipe";
import { temporalDependency, temporalInstantSchema, temporalTypes, temporalWindowSchema } from "@hypit/temporal";
import { temporalWindowAttributeVocabulary } from "@hypit/temporal/markup";

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
  appendPresetItem: { module: emojiRevealModuleRef, name: "append-preset-emoji-reveal-item" },
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
const blob = blobRefSchema();

export const emojiRevealHeaderSchema: ValueSchema = object({ id: { schema: string } });
export const emojiRevealItemSpecSchema: ValueSchema = object({
  id: { schema: string }, preset: { schema: { kind: "boolean" } },
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
  spec: { schema: emojiRevealItemSpecSchema }, icon: { schema: blob }, activation: { schema: temporalInstantSchema, optional: true },
});
export const emojiRevealSetSchema: ValueSchema = object({
  items: { schema: { kind: "array", items: emojiRevealItemSchema } },
});
export const emojiRevealProgramSchema: ValueSchema = object({
  id: { schema: string }, timelineId: { schema: string }, outer: { schema: temporalWindowSchema },
  style: { schema: emojiRevealStyleSchema }, placeholder: { schema: blob },
  items: { schema: { kind: "array", minItems: 1, items: emojiRevealItemSchema } },
});

const recipe = [
  ["center-x", "0.5", "Places the adaptive strip by its horizontal centre as a fraction of the selected Frame's width."],
  ["top-y", "0.07", "Places the strip's top edge as a fraction of the selected Frame's height."],
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
        { name: "recipe", kind: "reference", required: true, accepts: [recipeType],
          summary: "Chooses the Recipe that controls placement, board paint, slot geometry and reveal motion.",
          recipe: recipe.map(([name, fallback, summary]) => ({ name, required: false, fallback, summary })) },
      ],
      example: `<emoji:Style id="emoji-strip" recipe={styles.emoji-strip}/>` ,
      notes: ["The Style owns appearance and placement, but never event timing."],
    } },
  { name: "emojiReveal", tag: "EmojiReveal", mode: "structured",
    outputs: [emojiRevealTypes.header, emojiRevealTypes.itemSpec, emojiRevealTypes.program, compositionTypes.visualTrack],
    vocabulary: {
      summary: "Draws one adaptive row of preset or progressively revealed icon slots.",
      appearance: "A compact rounded rectangle centered near the top of the frame, with a dark outline and a hard lower-right shadow. Its width is computed from the number of fixed-size slots. Preset slots are settled from the first frame. Every other slot starts with the same supplied placeholder icon, then its activation Instant replaces that slot with a brief overshoot and settle while earlier answers remain visible and later slots remain unanswered.",
      preview: previewImage("Track.png"),
      attributes: [
        { name: "id", kind: "identifier", required: true, summary: "Names the reveal Program and its visual contribution." },
        ...temporalContextAttributeVocabulary,
        { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Chooses the Frame used for normalized placement." },
        { name: "style", kind: "reference", required: true, accepts: [emojiRevealTypes.style], summary: "Chooses the strip Style." },
        { name: "placeholder", kind: "reference", required: true, accepts: [blobTypes.blob], summary: "Supplies the one image drawn in every unrevealed slot." },
        ...temporalWindowAttributeVocabulary,
      ],
      children: [{ tag: "Item", cardinality: "many", summary: "One answer slot, either settled from the start or revealed at one event.", attributes: [
        { name: "id", kind: "identifier", required: true, summary: "Names this answer slot and the timing subject it owns." },
        { name: "icon", kind: "reference", required: true, accepts: [blobTypes.blob], summary: "Supplies this answer as an image Artifact from the same visual icon family as the placeholder." },
        { name: "preset", kind: "literal", required: false, values: ["true", "false"], summary: "Settles this Item from the start of the EmojiReveal Window; preset Items have no at." },
        { name: "at", kind: "expression", required: false, accepts: [temporalTypes.instant], summary: "Chooses this non-preset Item's resolved reveal Instant or authored absolute time; required unless preset is true." },
      ] }],
      ports: [
        { name: "program", type: emojiRevealTypes.program, summary: "The adaptive strip with its outer Window and fully traced activation Instants." },
        { name: "visual", type: compositionTypes.visualTrack, summary: "That Program rendered as an ordinary VisualTrack." },
      ],
      example: `<emoji:EmojiReveal id="rules" timeline={speech.timeline} within={vertical.bounds} style={emoji-strip} placeholder={question-icon} during={speech.window}>
  <emoji:Item id="manifest" icon={manifest-icon} preset="true"/>
  <emoji:Item id="real-estate" icon={real-estate-icon} at={real-estate}/>
  <emoji:Item id="bitcoin" icon={bitcoin-icon} at={bitcoin}/>
</emoji:EmojiReveal>`,
      notes: [
        "Item order is display order: preset Items come first, then non-preset Items in strict chronological reveal order.",
        "A non-preset Item.at chooses one resolved Instant or an authored absolute time. The answer then persists to the outer Window's end.",
        "The outer EmojiReveal Window is separate from child reveal Instants and uses the shared temporal Window protocol.",
      ],
    } },
] as const;

export const emojiRevealManifest: ModuleManifest = {
  format: "hypit.module@1", name: emojiRevealModuleRef.name, version: emojiRevealModuleRef.version,
  dependencies: [blobDependency, timelineDependency, spatialDependency, temporalDependency, compositionDependency],
  types: [
    { name: emojiRevealTypes.header.name }, { name: emojiRevealTypes.style.name },
    { name: emojiRevealTypes.itemSpec.name }, { name: emojiRevealTypes.set.name }, { name: emojiRevealTypes.program.name },
  ],
  capabilities: [],
  producers: [
    { name: emojiRevealProducers.createSet.name, inputs: [], result: { kind: "output" as const, name: "set", type: emojiRevealTypes.set } },
    { name: emojiRevealProducers.appendItem.name,
      inputs: [{ name: "set", type: emojiRevealTypes.set }, { name: "timeline", type: timelineTypes.timeline }, { name: "spec", type: emojiRevealTypes.itemSpec }, { name: "icon", type: blobTypes.blob }, { name: "activation", type: temporalTypes.instant }],
      result: { kind: "output" as const, name: "set", type: emojiRevealTypes.set } },
    { name: emojiRevealProducers.appendPresetItem.name,
      inputs: [{ name: "set", type: emojiRevealTypes.set }, { name: "spec", type: emojiRevealTypes.itemSpec }, { name: "icon", type: blobTypes.blob }],
      result: { kind: "output" as const, name: "set", type: emojiRevealTypes.set } },
    { name: emojiRevealProducers.finalize.name,
      inputs: [{ name: "header", type: emojiRevealTypes.header }, { name: "timeline", type: timelineTypes.timeline }, { name: "outer", type: temporalTypes.window }, { name: "style", type: emojiRevealTypes.style }, { name: "placeholder", type: blobTypes.blob }, { name: "set", type: emojiRevealTypes.set }],
      result: { kind: "output" as const, name: "program", type: emojiRevealTypes.program } },
    { name: emojiRevealProducers.render.name,
      inputs: [{ name: "within", type: spatialTypes.frame }, { name: "timeline", type: timelineTypes.timeline }, { name: "program", type: emojiRevealTypes.program }],
      result: { kind: "output" as const, name: "track", type: compositionTypes.visualTrack } },
  ],
};

export const emojiRevealDependency = { module: emojiRevealModuleRef } as const;
