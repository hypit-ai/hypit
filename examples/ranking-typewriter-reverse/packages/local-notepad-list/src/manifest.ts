import { readFile } from "node:fs/promises";

import { artifactDependency } from "@hypit/artifact";
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

export const notepadModuleRef = { name: "@hypit/local-notepad-list", version: "1" } as const;

export const notepadTypes = {
  header: { module: notepadModuleRef, name: "NotepadHeader" },
  title: { module: notepadModuleRef, name: "NotepadTitleSpec" },
  rowSpec: { module: notepadModuleRef, name: "NotepadRowSpec" },
  rowShell: { module: notepadModuleRef, name: "NotepadRowShell" },
  rowSpecs: { module: notepadModuleRef, name: "NotepadRowSpecSet" },
  schedule: { module: notepadModuleRef, name: "NotepadSchedule" },
  style: { module: notepadModuleRef, name: "NotepadStyle" },
  program: { module: notepadModuleRef, name: "NotepadProgram" },
} satisfies Record<string, TypeRef>;

export const notepadProducers = {
  createRows: { module: notepadModuleRef, name: "create-notepad-rows" },
  appendRow: { module: notepadModuleRef, name: "append-notepad-row" },
  materializeRow: { module: notepadModuleRef, name: "materialize-notepad-row" },
  schedule: { module: notepadModuleRef, name: "build-notepad-schedule" },
  openedSchedule: { module: notepadModuleRef, name: "build-opened-notepad-schedule" },
  program: { module: notepadModuleRef, name: "build-notepad-program" },
  render: { module: notepadModuleRef, name: "render-notepad-list" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true } as const;
const unsigned = { kind: "number", integer: true, minimum: 0 } as const;
const object = (
  fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>,
  allowUnknown = false,
): ValueSchema => ({ kind: "object", fields, ...(allowUnknown ? { allowUnknown: true } : {}) });

const rowBase = {
  id: { schema: string },
  rank: { schema: { kind: "number", integer: true, minimum: 1 } as const },
  mark: { schema: { kind: "string", enum: ["none", "circle"] } as const },
  stackingOrder: { schema: integer, optional: true },
} as const;

export const notepadHeaderSchema: ValueSchema = object({ id: { schema: string } });
export const notepadTitleSchema: ValueSchema = object({
  lead: { schema: string },
  emphasis: { schema: { kind: "string" } as const },
});
export const notepadRowSpecSchema: ValueSchema = object({ ...rowBase, label: { schema: string } });
export const notepadRowShellSchema: ValueSchema = object(rowBase);
export const notepadRowSpecSetSchema: ValueSchema = object({
  rows: { schema: { kind: "array", items: notepadRowSpecSchema } },
});
const frameSpan = object({ startFrame: { schema: unsigned }, endFrameExclusive: { schema: unsigned } });
export const notepadScheduleSchema: ValueSchema = object({
  id: { schema: string },
  windows: { schema: { kind: "array", minItems: 1, items: frameSpan } },
  opening: { schema: frameSpan, optional: true },
  terminalFrame: { schema: unsigned },
  entries: { schema: { kind: "array", minItems: 1, items: object({
    rowId: { schema: string }, triggerFrame: { schema: unsigned },
  }) } },
});
export const notepadStyleSchema: ValueSchema = object({}, true);
export const notepadProgramSchema: ValueSchema = object({
  id: { schema: string },
  frame: { schema: spatialFrameSchema },
  schedule: { schema: notepadScheduleSchema },
  style: { schema: notepadStyleSchema },
  title: { schema: notepadTitleSchema },
  rows: { schema: { kind: "array", minItems: 1, items: notepadRowSpecSchema } },
}, true);

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const notepadMarkupSurfaces = [
  {
    name: "notepad-style", tag: "ListStyle", mode: "structured",
    outputs: [notepadTypes.style],
    vocabulary: {
      summary: "Compiles one SVS Recipe and three exact faces into the Style a notepad list is drawn in.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this Style so a List can reference it." },
        { name: "recipe", kind: "reference", required: true, accepts: [svsRecipeType],
          summary: "Chooses the Recipe carrying the paper treatment, the two title paints, the row geometry, the annotation and the typing rhythm.",
          recipe: [
            { name: "surface-fit", required: false, fallback: "cover", values: ["contain", "cover"],
              summary: "Decides whether the paper picture fits inside the Frame or fills it." },
            { name: "title-x", required: false, fallback: "0.1",
              summary: "Places the title's left edge on the paper, as a fraction of the Frame's width." },
            { name: "title-y", required: false, fallback: "0.19",
              summary: "Places the title's top edge on the paper, as a fraction of the Frame's height." },
            { name: "title-width", required: false, fallback: "0.82",
              summary: "Sets the width the title wraps inside, as a fraction of the Frame's width." },
            { name: "title-size", required: false, fallback: "74",
              summary: "Sets the size in pixels the title is set at on the paper." },
            { name: "title-line-height", required: false, fallback: "1.16",
              summary: "Sets the line height the title is set on, as a multiple of its size." },
            { name: "title-tracking", required: false, fallback: "0",
              summary: "Adjusts the letter spacing in pixels of the title on the paper." },
            { name: "title-color", required: false, fallback: "#1c1c1c",
              summary: "Sets the color the title is drawn in on the paper." },
            { name: "title-underline", required: false, fallback: "0",
              summary: "Sets the thickness in pixels of the rule under the emphasized words on the paper; zero draws none." },
            { name: "opening-x", required: false, fallback: "0.08",
              summary: "Places the opening title's left edge, as a fraction of the Frame's width." },
            { name: "opening-y", required: false, fallback: "0.55",
              summary: "Places the opening title's top edge, as a fraction of the Frame's height." },
            { name: "opening-width", required: false, fallback: "0.86",
              summary: "Sets the width the opening title wraps inside, as a fraction of the Frame's width." },
            { name: "opening-size", required: false, fallback: "74",
              summary: "Sets the size in pixels the opening title is set at." },
            { name: "opening-line-height", required: false, fallback: "1.16",
              summary: "Sets the line height the opening title is set on, as a multiple of its size." },
            { name: "opening-tracking", required: false, fallback: "0",
              summary: "Adjusts the letter spacing in pixels of the opening title." },
            { name: "opening-color", required: false, fallback: "#ffffff",
              summary: "Sets the color the opening title is drawn in." },
            { name: "opening-underline", required: false, fallback: "0",
              summary: "Sets the thickness in pixels of the rule under the emphasized words in the opening; zero draws none." },
            { name: "opening-shadow-x", required: false, fallback: "0",
              summary: "Offsets the opening title's shadow horizontally in pixels." },
            { name: "opening-shadow-y", required: false, fallback: "2",
              summary: "Offsets the opening title's shadow vertically in pixels." },
            { name: "opening-shadow-blur", required: false, fallback: "10",
              summary: "Sets the blur radius in pixels of the opening title's shadow." },
            { name: "opening-shadow-color", required: false, fallback: "#00000080",
              summary: "Sets the color of the opening title's shadow." },
            { name: "row-x", required: false, fallback: "0.21",
              summary: "Places the left edge of the row copy, as a fraction of the Frame's width; the number sits to its left." },
            { name: "row-top", required: false, fallback: "0.36",
              summary: "Places the first row's top edge, as a fraction of the Frame's height." },
            { name: "row-width", required: false, fallback: "0.72",
              summary: "Sets the width a row's copy wraps inside, as a fraction of the Frame's width." },
            { name: "row-gap", required: false, fallback: "96",
              summary: "Sets the distance in pixels between one row's top edge and the next." },
            { name: "row-size", required: false, fallback: "52",
              summary: "Sets the size in pixels the numbers and row copy are set at." },
            { name: "row-line-height", required: false, fallback: "1.2",
              summary: "Sets the line height the row copy is set on, as a multiple of its size." },
            { name: "row-tracking", required: false, fallback: "0",
              summary: "Adjusts the letter spacing in pixels of the row copy." },
            { name: "row-color", required: false, fallback: "#1c1c1c",
              summary: "Sets the color the numbers and row copy are drawn in." },
            { name: "row-number-width", required: false, fallback: "54",
              summary: "Sets the width in pixels of the column the rank numbers are set in." },
            { name: "mark-color", required: false, fallback: "#1c1c1c",
              summary: "Sets the color the annotation is drawn in." },
            { name: "mark-stroke", required: false, fallback: "4",
              summary: "Sets the stroke width in pixels of the annotation." },
            { name: "mark-pad-x", required: false, fallback: "16",
              summary: "Sets the horizontal breathing space in pixels between the annotation and the row it encircles." },
            { name: "mark-pad-y", required: false, fallback: "8",
              summary: "Sets the vertical breathing space in pixels between the annotation and the row it encircles." },
            { name: "mark-rotate", required: false, fallback: "-1.5",
              summary: "Tilts the annotation by this many degrees so it reads as drawn by hand." },
            { name: "mark-frames", required: false, fallback: "8",
              summary: "Sets how many frames the annotation takes to draw itself." },
            { name: "mark-advance", required: false, fallback: "0.5",
              summary: "States the row face's mean glyph advance as a fraction of the row size, which is how wide the annotation knows to be." },
            { name: "title-type-frames", required: false, fallback: "2",
              summary: "Sets how many frames pass between two characters of the opening title." },
            { name: "row-type-frames", required: false, fallback: "2",
              summary: "Sets how many frames pass between two characters of a row's copy." },
            { name: "surface-stack", required: false, fallback: "40",
              summary: "Sets the draw order the paper is placed at." },
            { name: "title-stack", required: false, fallback: "42",
              summary: "Sets the draw order the title is placed at." },
            { name: "row-stack", required: false, fallback: "44",
              summary: "Sets the draw order the numbers and row copy are placed at." },
            { name: "mark-stack", required: false, fallback: "46",
              summary: "Sets the draw order the annotation is placed at, unless the Row overrides it." },
          ] },
        { name: "title-font", kind: "reference", required: true,
          accepts: [mediaTypes.fontArtifact, mediaTypes.fontStack],
          summary: "Chooses the face the title's leading words are set in." },
        { name: "emphasis-font", kind: "reference", required: true,
          accepts: [mediaTypes.fontArtifact, mediaTypes.fontStack],
          summary: "Chooses the face the title's emphasized words are set in." },
        { name: "row-font", kind: "reference", required: true,
          accepts: [mediaTypes.fontArtifact, mediaTypes.fontStack],
          summary: "Chooses the face the row copy is set in." },
        { name: "number-font", kind: "reference", required: false,
          accepts: [mediaTypes.fontArtifact, mediaTypes.fontStack],
          summary: "Chooses the face the rank numbers are set in, which falls back to the row face." },
      ],
      ports: [
        { name: "", type: notepadTypes.style,
          summary: "The compiled Style, addressed by the element's own id." },
      ],
      example: `<notes:ListStyle id="notepad" recipe={studio.notepad.list}
  title-font={title-face} emphasis-font={emphasis-face}
  row-font={hand-face} number-font={hand-light-face}/>`,
      notes: [
        "The element is empty; it accepts no children and no text.",
        "The Recipe accepts exactly the properties listed here; every other property is refused by name.",
        "The font edges are separate because the composition sets several different faces at once, and weight lives on the face rather than in the Recipe.",
      ],
    },
  },
  {
    name: "notepad-list", tag: "List", mode: "structured",
    outputs: [
      notepadTypes.header, notepadTypes.title, notepadTypes.rowSpec, notepadTypes.rowShell,
      notepadTypes.schedule, notepadTypes.program, compositionTypes.visualTrack,
      // The sheet this package ships, admitted as an ordinary Artifact when no
      // Source names a different one.
      mediaTypes.blobArtifact,
    ],
    vocabulary: {
      summary: "Writes a numbered list onto a sheet of paper one row at a time, returning to it on each occurrence of a Selection, and publishes the composition and the Track it renders to.",
      appearance:
        "One full-frame sheet of paper carrying the whole picture: no other content is behind it. Its title sits near the top in two faces on one wrapping block — the leading words in the title face, the closing words in the emphasis face, optionally ruled underneath — and beneath it every rank number the list will ever hold is already written down the sheet in a fixed left column, each on its own line, with the space beside it blank. On each trigger occurrence one row's copy writes itself in beside its number, one character at a time at the Recipe's rhythm, and stays written for the rest of the list's life; rows written in earlier windows are already complete when the sheet returns. The row order down the sheet is the rank each Row declares, while the order they are written in is the order the Rows are authored, so a list can fill from the bottom upward. A Row asking for the circle annotation gains a hand-tilted ellipse that draws itself around the number and copy once that copy has finished writing. Before the paper ever appears the title alone can write itself over whatever the picture already shows, in the opening paint rather than the paper paint.",
      preview: previewImage("List.png"),
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this list so its Schedule, Program and Track can be referenced elsewhere in the Source." },
        { name: "map", kind: "reference", required: true, accepts: [semanticMapTypes.complete],
          summary: "Chooses the measured SemanticMap that gives every window and trigger its frame." },
        { name: "space", kind: "reference", required: true, accepts: [programSpaceTypes.programSpace],
          summary: "Chooses the ProgramSpace the list is timed and rendered against." },
        { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame],
          summary: "Chooses the Frame the whole sheet occupies." },
        { name: "surface", kind: "reference", required: false, accepts: [mediaTypes.blobArtifact],
          summary: "Replaces the ruled paper this package draws on by default. The component ships its own sheet, so a Source only names one to deliberately write on something else." },
        { name: "during", kind: "reference", required: true, accepts: [narrativeTypes.selection],
          summary: "Chooses the Selection whose every occurrence is one window the sheet is on screen for." },
        { name: "triggers", kind: "reference", required: true, accepts: [narrativeTypes.moment],
          summary: "Chooses the Moment whose occurrences write one Row each, in document order." },
        { name: "terminal", kind: "reference", required: true, accepts: [narrativeTypes.moment],
          summary: "Chooses the Moment the completed list settles on." },
        { name: "opening", kind: "reference", required: false, accepts: [narrativeTypes.selection],
          summary: "Chooses the Selection the title writes itself over before the paper first appears." },
        { name: "title", kind: "literal", required: true,
          summary: "Sets the title's leading words, drawn in the Style's title face." },
        { name: "title-emphasis", kind: "literal", required: false,
          summary: "Sets the title's closing words, drawn in the Style's emphasis face; an omitted value writes none." },
        { name: "style", kind: "reference", required: true, accepts: [notepadTypes.style],
          summary: "Chooses the ListStyle this sheet is drawn in." },
      ],
      children: [
        { tag: "Row", cardinality: "many",
          summary: "One row of the list, written at its own trigger occurrence in document order; it is empty.",
          attributes: [
            { name: "id", kind: "identifier", required: false,
              summary: "Names this row within the list; an omitted id is generated from the row's position." },
            { name: "rank", kind: "literal", required: true,
              summary: "Sets the number printed beside the row and the slot it occupies down the sheet." },
            { name: "label", kind: "expression", required: true, accepts: [textTypes.text],
              summary: "Sets the row's copy, written literally or chosen from an existing Text." },
            { name: "mark", kind: "literal", required: false, values: ["none", "circle"],
              summary: "Decides whether the row gains a hand-drawn ellipse once its copy is written, and defaults to none." },
            { name: "stack", kind: "literal", required: false,
              summary: "Overrides the Style's annotation draw order for this row alone." },
          ] },
      ],
      ports: [
        { name: "schedule", type: notepadTypes.schedule,
          summary: "The resolved Schedule: every window, the optional opening, each Row's trigger frame and the terminal frame." },
        { name: "program", type: notepadTypes.program,
          summary: "The resolved sheet: its Frame, paper, Style, Schedule, title and ordered Rows." },
        { name: "visual", type: compositionTypes.visualTrack,
          summary: "The rendered sheet, an ordinary peer VisualTrack." },
      ],
      example: `<notes:ListStyle id="notepad" recipe={studio.notepad.list}
  title-font={title-face} emphasis-font={emphasis-face} row-font={hand-face}/>
<notes:List id="board" map={timing.map} space={speech.space} frame={full}
  surface={paper.image} during={story.selection.board} opening={story.selection.opening}
  triggers={story.moment.write} terminal={story.moment.settled}
  title="Top 5 Most Popular Ways to " title-emphasis="learn AI" style={notepad}>
  <notes:Row id="row-five" rank="5" label="Instagram"/>
  <notes:Row id="row-one" rank="1" label="The Rundown" mark="circle"/>
</notes:List>`,
      notes: [
        "The list requires at least one Row, accepts no other child and no text of its own, and Row ids and ranks must both be unique within it.",
        "The trigger Moment must occur exactly once per Row, and every trigger must fall inside one of the Selection's windows.",
        "The `during` Selection may occur many times; the sheet is drawn once per occurrence and remembers every Row written before it.",
        "A `label` written as a reference materializes the row from that exact Text before the list is scheduled; the title is editorial copy the composition owns and is written literally.",
      ],
    },
  },
] as const;

export const notepadManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: notepadModuleRef.name,
  version: notepadModuleRef.version,
  dependencies: [
    artifactDependency, mediaDependency, narrativeDependency, semanticMapDependency,
    programSpaceDependency, spatialDependency, temporalDependency, compositionDependency, textDependency,
  ],
  types: [
    { name: notepadTypes.header.name },
    { name: notepadTypes.title.name },
    { name: notepadTypes.rowSpec.name },
    { name: notepadTypes.rowShell.name },
    { name: notepadTypes.rowSpecs.name },
    { name: notepadTypes.schedule.name },
    { name: notepadTypes.style.name },
    { name: notepadTypes.program.name },
  ],
  capabilities: [],
  producers: [
    { name: notepadProducers.materializeRow.name,
      inputs: [{ name: "shell", type: notepadTypes.rowShell }, { name: "content", type: textTypes.text }],
      outputs: [{ name: "spec", type: notepadTypes.rowSpec }], needs: [] },
    { name: notepadProducers.createRows.name,
      inputs: [{ name: "header", type: notepadTypes.header }],
      outputs: [{ name: "set", type: notepadTypes.rowSpecs }], needs: [] },
    { name: notepadProducers.appendRow.name,
      inputs: [{ name: "set", type: notepadTypes.rowSpecs }, { name: "spec", type: notepadTypes.rowSpec }],
      outputs: [{ name: "set", type: notepadTypes.rowSpecs }], needs: [] },
    ...([
      [notepadProducers.schedule, false],
      [notepadProducers.openedSchedule, true],
    ] as const).map(([producer, opened]) => ({
      name: producer.name,
      inputs: [
        { name: "header", type: notepadTypes.header }, { name: "rows", type: notepadTypes.rowSpecs },
        { name: "map", type: semanticMapTypes.complete }, { name: "space", type: programSpaceTypes.programSpace },
        { name: "during", type: narrativeTypes.selection }, { name: "triggers", type: narrativeTypes.moment },
        { name: "terminal", type: narrativeTypes.moment },
        ...(opened ? [{ name: "opening", type: narrativeTypes.selection }] : []),
      ],
      outputs: [{ name: "schedule", type: notepadTypes.schedule }], needs: [],
    })),
    { name: notepadProducers.program.name,
      inputs: [
        { name: "header", type: notepadTypes.header }, { name: "frame", type: spatialTypes.frame },
        { name: "surface", type: mediaTypes.blobArtifact }, { name: "schedule", type: notepadTypes.schedule },
        { name: "style", type: notepadTypes.style }, { name: "title", type: notepadTypes.title },
        { name: "rows", type: notepadTypes.rowSpecs },
      ],
      outputs: [{ name: "program", type: notepadTypes.program }], needs: [] },
    { name: notepadProducers.render.name,
      inputs: [
        { name: "space", type: programSpaceTypes.programSpace },
        { name: "program", type: notepadTypes.program },
      ],
      outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
  ],
};

export const notepadDependency = { module: notepadModuleRef } as const;
