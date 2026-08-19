import { readFile } from "node:fs/promises";

import { compositionDependency, compositionTypes } from "@hypit/composition";
import { mediaDependency, mediaTypes } from "@hypit/media";
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

export const linerankModuleRef = { name: "@hypit/local-linerank", version: "1" } as const;
export const linerankTypes = {
  header: { module: linerankModuleRef, name: "LinerankHeader" },
  itemSpec: { module: linerankModuleRef, name: "LinerankItemSpec" },
  textItemShell: { module: linerankModuleRef, name: "LinerankTextItemShell" },
  itemSpecs: { module: linerankModuleRef, name: "LinerankItemSpecSet" },
  schedule: { module: linerankModuleRef, name: "LinerankSchedule" },
  style: { module: linerankModuleRef, name: "LinerankStyle" },
  items: { module: linerankModuleRef, name: "LinerankItemSet" },
  program: { module: linerankModuleRef, name: "LinerankProgram" },
} satisfies Record<string, TypeRef>;

export const linerankProducers = {
  materializeTextItem: { module: linerankModuleRef, name: "materialize-linerank-text-item" },
  createSpecs: { module: linerankModuleRef, name: "create-linerank-item-specs" },
  appendSpec: { module: linerankModuleRef, name: "append-linerank-item-spec" },
  schedule: { module: linerankModuleRef, name: "build-linerank-schedule" },
  createItems: { module: linerankModuleRef, name: "create-linerank-items" },
  appendItem: { module: linerankModuleRef, name: "append-linerank-item" },
  program: { module: linerankModuleRef, name: "build-linerank-program" },
  render: { module: linerankModuleRef, name: "render-linerank-board" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true } as const;
const unsigned = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>, allowUnknown = false): ValueSchema => ({
  kind: "object", fields, ...(allowUnknown ? { allowUnknown: true } : {}),
});

export const linerankHeaderSchema: ValueSchema = object({ id: { schema: string } });
export const linerankItemSpecSchema: ValueSchema = object({
  id: { schema: string }, rank: { schema: integer }, label: { schema: string },
});
export const linerankTextItemShellSchema: ValueSchema = object({
  id: { schema: string }, rank: { schema: integer },
});
export const linerankItemSpecSetSchema: ValueSchema = object({
  items: { schema: { kind: "array", items: linerankItemSpecSchema } },
});
const frameSpan = object({ startFrame: { schema: unsigned }, endFrameExclusive: { schema: unsigned } });
export const linerankScheduleSchema: ValueSchema = object({
  id: { schema: string },
  windows: { schema: { kind: "array", minItems: 1, items: frameSpan } },
  terminalFrame: { schema: unsigned },
  entries: { schema: { kind: "array", minItems: 1, items: object({
    itemId: { schema: string }, rank: { schema: integer }, triggerFrame: { schema: unsigned },
  }) } },
});
export const linerankStyleSchema: ValueSchema = object({}, true);
export const linerankItemSetSchema: ValueSchema = object({
  items: { schema: { kind: "array", items: linerankItemSpecSchema } },
});
export const linerankProgramSchema: ValueSchema = object({
  id: { schema: string },
  frame: { schema: spatialFrameSchema },
  schedule: { schema: linerankScheduleSchema },
  style: { schema: object({}, true) },
  title: { schema: string },
  items: { schema: { kind: "array", minItems: 1, items: linerankItemSpecSchema } },
}, true);

export const linerankMarkupSurfaces = [
  {
    name: "linerank-style", tag: "BoardStyle", mode: "structured", outputs: [linerankTypes.style],
    vocabulary: {
      summary: "Compiles one SVS Recipe and one exact font into the Style a lined-paper ranking Board is drawn in.",
      attributes: [
        { name: "id", kind: "identifier", required: true, summary: "Names this Style so a Board can reference it." },
        { name: "recipe", kind: "reference", required: true, accepts: [svsRecipeType], summary: "Chooses the Recipe carrying the paper, ruled lines, title, numbers, label typography, typewriter rhythm and circle geometry.",
          recipe: [
            { name: "paper-background", required: false, fallback: "#ffffff", summary: "Sets the paper's fill color." },
            { name: "rule-color", required: false, fallback: "#cfe0f5", summary: "Sets the color of the graph-paper ruled lines." },
            { name: "rule-gap", required: false, fallback: "64", summary: "Sets the gap in pixels between ruled lines, horizontally and vertically." },
            { name: "title-size", required: false, fallback: "40", summary: "Sets the size in pixels the title is set at." },
            { name: "title-weight", required: false, fallback: "700", summary: "Sets the weight the title is set at." },
            { name: "title-color", required: false, fallback: "#111111", summary: "Sets the color the title is drawn in." },
            { name: "title-line-height", required: false, fallback: "1.15", summary: "Sets the line height the title is set on." },
            { name: "number-size", required: false, fallback: "34", summary: "Sets the size in pixels the row numbers are set at." },
            { name: "number-weight", required: false, fallback: "600", summary: "Sets the weight the row numbers are set at." },
            { name: "number-color", required: false, fallback: "#222222", summary: "Sets the color the row numbers are drawn in." },
            { name: "label-size", required: false, fallback: "36", summary: "Sets the size in pixels each list label is set at." },
            { name: "label-weight", required: false, fallback: "500", summary: "Sets the weight each list label is set at." },
            { name: "label-color", required: false, fallback: "#111111", summary: "Sets the color each list label is drawn in." },
            { name: "label-line-height", required: false, fallback: "1.2", summary: "Sets the line height each list label is set on." },
            { name: "top-padding", required: false, fallback: "120", summary: "Sets the gap in pixels between the title and the first row." },
            { name: "left-padding", required: false, fallback: "56", summary: "Sets the left inset in pixels of the numbered rows." },
            { name: "right-padding", required: false, fallback: "40", summary: "Sets the right inset in pixels of the label area." },
            { name: "row-height", required: false, fallback: "72", summary: "Sets the height in pixels of one list row." },
            { name: "row-gap", required: false, fallback: "10", summary: "Sets the gap in pixels between list rows." },
            { name: "number-width", required: false, fallback: "64", summary: "Sets the width in pixels of the number column." },
            { name: "type-frames-per-char", required: false, fallback: "4", summary: "Sets how many frames each typed character takes to reveal." },
            { name: "circle-color", required: false, fallback: "#111111", summary: "Sets the color of the hand-drawn circle around the top item." },
            { name: "circle-width", required: false, fallback: "3", summary: "Sets the stroke width in pixels of the hand-drawn circle." },
            { name: "circle-frames", required: false, fallback: "18", summary: "Sets how many frames the hand-drawn circle takes to draw in." },
            { name: "board-stack", required: false, fallback: "20", summary: "Sets the draw order the paper board is placed at." },
            { name: "row-stack", required: false, fallback: "30", summary: "Sets the draw order the title and rows are placed at." },
            { name: "circle-stack", required: false, fallback: "40", summary: "Sets the draw order the hand-drawn circle is placed at." },
          ] },
        { name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontArtifact, mediaTypes.fontStack], summary: "Chooses the exact face, or a whole stack that already carries its own fallbacks, the board copy is set in." },
      ],
      ports: [
        { name: "", type: linerankTypes.style, summary: "The compiled visual Style, addressed by the element's own id." },
      ],
      example: `<linerank:BoardStyle id="paper-style" recipe={studio.linerank.board} font={ui-font}/>`,
      notes: [
        "The element is empty; it accepts no children and no text.",
        "The Recipe accepts exactly the properties listed here; every other property is refused by name.",
      ],
    },
  },
  {
    name: "linerank", tag: "Board", mode: "structured", outputs: [linerankTypes.header, linerankTypes.itemSpec, linerankTypes.textItemShell, textTypes.text, linerankTypes.schedule, linerankTypes.program, compositionTypes.visualTrack],
    vocabulary: {
      summary: "Draws a full-screen lined-paper ranking board that reveals one numbered item at a time as its label types in, settles, and can finish with a hand-drawn circle around the top item.",
      appearance:
        "A full-frame sheet of lined paper: a light fill with faint horizontal ruled lines and a vertical margin line. A title sits centered near the top. Below it, every rank row is already present as its number (1. 2. 3. …); the label of the item revealed on each board occurrence types in left-to-right, one character at a time, over the board window where it first appears, and every label already revealed stays where it landed in later windows. On the final window the top-ranked label is encircled by a thin oval line that draws in over the terminal stretch.",
      preview: previewImage("Board.png"),
      attributes: [
        { name: "id", kind: "identifier", required: true, summary: "Names this board so its Schedule, Program and Tracks can be referenced elsewhere in the Source." },
        { name: "map", kind: "reference", required: true, accepts: [semanticMapTypes.complete], summary: "Chooses the measured SemanticMap that gives every trigger its frame." },
        { name: "space", kind: "reference", required: true, accepts: [programSpaceTypes.programSpace], summary: "Chooses the ProgramSpace the board is timed and rendered against." },
        { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Chooses the Frame the whole board occupies." },
        { name: "during", kind: "reference", required: true, accepts: [narrativeTypes.selection], summary: "Chooses the Selection the board is on screen for; every occurrence becomes one board window." },
        { name: "triggers", kind: "reference", required: true, accepts: [narrativeTypes.moment], summary: "Chooses the Moment whose occurrences reveal one BoardItem each, in document order." },
        { name: "terminal", kind: "reference", required: true, accepts: [narrativeTypes.moment], summary: "Chooses the Moment the board settles on; the hand-drawn circle draws in there." },
        { name: "style", kind: "reference", required: true, accepts: [linerankTypes.style], summary: "Chooses the BoardStyle this board is drawn in." },
        { name: "title", kind: "expression", required: true, accepts: [textTypes.text], summary: "Sets the board's title copy, written literally or chosen from an existing Text." },
      ],
      children: [
        { tag: "BoardItem", cardinality: "many",
          summary: "One item of the board, placed at its own trigger occurrence in document order; it is empty.",
          attributes: [
            { name: "id", kind: "identifier", required: false, summary: "Names this Item within the board; an omitted id is generated from the Item's position." },
            { name: "rank", kind: "literal", required: true, summary: "Chooses the numbered row (1 is the top row) this Item's label is typed into." },
            { name: "label", kind: "expression", required: true, accepts: [textTypes.text], summary: "Sets the Item's label copy, written literally or chosen from an existing Text." },
          ] },
      ],
      ports: [
        { name: "schedule", type: linerankTypes.schedule, summary: "The resolved Schedule: each board window and each Item's trigger and typing span." },
        { name: "program", type: linerankTypes.program, summary: "The resolved board: its Frame, Style, Schedule, title and ordered Items." },
        { name: "visual", type: compositionTypes.visualTrack, summary: "The rendered board, an ordinary peer VisualTrack." },
      ],
      example: `<linerank:BoardStyle id="paper-style" recipe={studio.linerank.board} font={hand-font}/>
<linerank:Board id="board" map={timing.map} space={speech.space} frame={board-frame}
  during={story.selection.board} triggers={story.moment.reveal} terminal={story.moment.done}
  style={paper-style} title="Top 5 Most Popular Ways to learn AI">
  <linerank:BoardItem id="row-five" rank="5" label="Instagram"/>
  <linerank:BoardItem id="row-one" rank="1" label="The Rundown"/>
</linerank:Board>`,
      notes: [
        "The board requires at least one BoardItem, accepts no other child and no text of its own, and Item ids must be unique within it.",
        "Ranks must be unique; the top row is rank 1.",
        "`during` may be a non-contiguous Selection; each occurrence becomes one board window, and the number of windows must equal the number of Items.",
        "The label of the Item revealed on window N types in during that window and stays visible in every later window.",
      ],
    },
  },
] as const;

export const linerankManifest: ModuleManifest = {
  format: "hypit.module@1", name: linerankModuleRef.name, version: linerankModuleRef.version,
  dependencies: [mediaDependency, narrativeDependency, semanticMapDependency, programSpaceDependency, spatialDependency, temporalDependency, compositionDependency, textDependency],
  types: [
    { name: linerankTypes.header.name },
    { name: linerankTypes.itemSpec.name },
    { name: linerankTypes.textItemShell.name },
    { name: linerankTypes.itemSpecs.name },
    { name: linerankTypes.schedule.name },
    { name: linerankTypes.style.name },
    { name: linerankTypes.items.name },
    { name: linerankTypes.program.name },
  ],
  capabilities: [],
  producers: [
    { name: linerankProducers.materializeTextItem.name, inputs: [{ name: "shell", type: linerankTypes.textItemShell }, { name: "content", type: textTypes.text }], outputs: [{ name: "spec", type: linerankTypes.itemSpec }], needs: [] },
    { name: linerankProducers.createSpecs.name, inputs: [], outputs: [{ name: "set", type: linerankTypes.itemSpecs }], needs: [] },
    { name: linerankProducers.appendSpec.name, inputs: [{ name: "set", type: linerankTypes.itemSpecs }, { name: "spec", type: linerankTypes.itemSpec }], outputs: [{ name: "set", type: linerankTypes.itemSpecs }], needs: [] },
    { name: linerankProducers.schedule.name, inputs: [
      { name: "header", type: linerankTypes.header }, { name: "items", type: linerankTypes.itemSpecs },
      { name: "map", type: semanticMapTypes.complete }, { name: "space", type: programSpaceTypes.programSpace },
      { name: "outer", type: narrativeTypes.selection }, { name: "triggers", type: narrativeTypes.moment },
      { name: "terminal", type: narrativeTypes.moment },
    ], outputs: [{ name: "schedule", type: linerankTypes.schedule }], needs: [] },
    { name: linerankProducers.createItems.name, inputs: [], outputs: [{ name: "set", type: linerankTypes.items }], needs: [] },
    { name: linerankProducers.appendItem.name, inputs: [{ name: "set", type: linerankTypes.items }, { name: "spec", type: linerankTypes.itemSpec }], outputs: [{ name: "set", type: linerankTypes.items }], needs: [] },
    { name: linerankProducers.program.name, inputs: [
      { name: "header", type: linerankTypes.header }, { name: "frame", type: spatialTypes.frame },
      { name: "schedule", type: linerankTypes.schedule }, { name: "style", type: linerankTypes.style },
      { name: "title", type: textTypes.text }, { name: "set", type: linerankTypes.items },
    ], outputs: [{ name: "program", type: linerankTypes.program }], needs: [] },
    { name: linerankProducers.render.name, inputs: [
      { name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: linerankTypes.program },
    ], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
  ],
};

export const linerankDependency = { module: linerankModuleRef } as const;
