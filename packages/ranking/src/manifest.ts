import { readFile } from "node:fs/promises";

import { artifactDependency } from "@hypit/artifact";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { semanticTrackDependency, semanticTrackTypes } from "@hypit/semantic-track";
import { spatialDependency, spatialFrameSchema, spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import { temporalDependency } from "@hypit/temporal";
import { textDependency, textTypes } from "@hypit/text";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const rankingModuleRef = { name: "@hypit/ranking", version: "1" } as const;
export const rankingTypes = {
  header: { module: rankingModuleRef, name: "RankingHeader" },
  itemSpec: { module: rankingModuleRef, name: "RankingItemSpec" },
  textItemShell: { module: rankingModuleRef, name: "RankingTextItemShell" },
  itemSpecs: { module: rankingModuleRef, name: "RankingItemSpecSet" },
  columnOuter: { module: rankingModuleRef, name: "ColumnOuterWindow" },
  columnCandidates: { module: rankingModuleRef, name: "ColumnWindowCandidateSet" },
  schedule: { module: rankingModuleRef, name: "RankingSchedule" },
  soundStyle: { module: rankingModuleRef, name: "RankingSoundStyle" },
  soundEvents: { module: rankingModuleRef, name: "RankingSoundEventPlan" },
  sounds: { module: rankingModuleRef, name: "RankingSoundSet" },
  tierStyle: { module: rankingModuleRef, name: "TierBoardStyle" },
  columnStyle: { module: rankingModuleRef, name: "ColumnStyle" },
  topThreeStyle: { module: rankingModuleRef, name: "TopThreeStyle" },
  tierItems: { module: rankingModuleRef, name: "TierBoardItemSet" },
  columnItems: { module: rankingModuleRef, name: "ColumnItemSet" },
  topThreeItems: { module: rankingModuleRef, name: "TopThreeItemSet" },
  tierProgram: { module: rankingModuleRef, name: "TierBoardProgram" },
  columnProgram: { module: rankingModuleRef, name: "ColumnProgram" },
  topThreeProgram: { module: rankingModuleRef, name: "TopThreeProgram" },
} satisfies Record<string, TypeRef>;

export const rankingProducers = {
  createSpecs: { module: rankingModuleRef, name: "create-ranking-item-specs" },
  appendSpec: { module: rankingModuleRef, name: "append-ranking-item-spec" },
  schedule: { module: rankingModuleRef, name: "build-ranking-schedule" },
  projectColumnSelectionOuter: { module: rankingModuleRef, name: "project-column-selection-outer" },
  projectColumnSegmentOuter: { module: rankingModuleRef, name: "project-column-segment-outer" },
  createColumnCandidates: { module: rankingModuleRef, name: "create-column-window-candidates" },
  appendColumnCandidate: { module: rankingModuleRef, name: "append-column-window-candidate" },
  columnSchedule: { module: rankingModuleRef, name: "build-column-schedule" },
  createTierItems: { module: rankingModuleRef, name: "create-tier-board-items" },
  appendTierItem: { module: rankingModuleRef, name: "append-tier-board-item" },
  createColumnItems: { module: rankingModuleRef, name: "create-column-items" },
  appendColumnItem: { module: rankingModuleRef, name: "append-column-item" },
  appendColumnIconItem: { module: rankingModuleRef, name: "append-column-icon-item" },
  createTopThreeItems: { module: rankingModuleRef, name: "create-top-three-items" },
  appendTopThreeItem: { module: rankingModuleRef, name: "append-top-three-item" },
  appendTopThreeIconItem: { module: rankingModuleRef, name: "append-top-three-icon-item" },
  tierProgram: { module: rankingModuleRef, name: "build-tier-board-program" },
  columnProgram: { module: rankingModuleRef, name: "build-column-program" },
  topThreeProgram: { module: rankingModuleRef, name: "build-top-three-program" },
  tierEvents: { module: rankingModuleRef, name: "build-tier-board-sound-events" },
  columnEvents: { module: rankingModuleRef, name: "build-column-sound-events" },
  topThreeEvents: { module: rankingModuleRef, name: "build-top-three-sound-events" },
  createSounds: { module: rankingModuleRef, name: "create-ranking-sounds" },
  appendAppearSound: { module: rankingModuleRef, name: "append-ranking-appear-sound" },
  appendMoveSound: { module: rankingModuleRef, name: "append-ranking-move-sound" },
  renderAudio: { module: rankingModuleRef, name: "render-ranking-audio" },
  renderTier: { module: rankingModuleRef, name: "render-tier-board" },
  renderColumn: { module: rankingModuleRef, name: "render-column" },
  renderTopThree: { module: rankingModuleRef, name: "render-top-three" },
  materializeTextItem: { module: rankingModuleRef, name: "materialize-text-item" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true } as const;
const unsigned = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>, allowUnknown = false): ValueSchema => ({
  kind: "object", fields, ...(allowUnknown ? { allowUnknown: true } : {}),
});
const variants = { kind: "string", enum: ["tier-board", "column", "top-three"] } as const;
const itemBase = {
  id: { schema: string },
  stackingOrder: { schema: integer, optional: true },
} as const;
export const rankingHeaderSchema: ValueSchema = object({
  id: { schema: string }, variant: { schema: variants },
});
export const rankingItemSpecSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ variant: { schema: { kind: "literal", value: "tier-board" } }, ...itemBase, tier: { schema: string }, entry: { schema: { kind: "string", enum: ["direct", "stage"] } } }),
  object({ variant: { schema: { kind: "literal", value: "column" } }, ...itemBase,
    label: { schema: string }, rank: { schema: { kind: "number", integer: true, minimum: 1 } }, preset: { schema: { kind: "boolean" } },
  }),
  object({ variant: { schema: { kind: "literal", value: "top-three" } }, ...itemBase, label: { schema: string } }),
] };
export const rankingTextItemShellSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ variant: { schema: { kind: "literal", value: "column" } }, ...itemBase,
    rank: { schema: { kind: "number", integer: true, minimum: 1 } }, preset: { schema: { kind: "boolean" } },
  }),
  object({ variant: { schema: { kind: "literal", value: "top-three" } }, ...itemBase }),
] };
export const rankingItemSpecSetSchema: ValueSchema = object({

  variant: { schema: variants }, items: { schema: { kind: "array", items: rankingItemSpecSchema } },
});
const frameSpan = object({ startFrame: { schema: unsigned }, endFrameExclusive: { schema: unsigned } });
export const columnOuterWindowSchema: ValueSchema = object({ span: { schema: frameSpan } });
export const columnWindowCandidateSetSchema: ValueSchema = object({
  entries: { schema: { kind: "array", items: object({
    itemId: { schema: string }, occurrenceId: { schema: string }, preferred: { schema: frameSpan },
  }) } },
});
const triggeredScheduleSchema: ValueSchema = object({
  id: { schema: string },
  variant: { schema: { kind: "string", enum: ["tier-board", "top-three"] } },
  outer: { schema: frameSpan }, terminalFrame: { schema: unsigned },
  entries: { schema: { kind: "array", minItems: 1, items: object({
    itemId: { schema: string }, triggerFrame: { schema: unsigned },
    stage: { schema: frameSpan }, cumulative: { schema: frameSpan }, settled: { schema: frameSpan },
  }) } },
});
const columnScheduleSchema: ValueSchema = object({
  id: { schema: string }, variant: { schema: { kind: "literal", value: "column" } }, outer: { schema: frameSpan },
  entries: { schema: { kind: "array", minItems: 1, items: { kind: "oneOf", variants: [
    object({ itemId: { schema: string }, mode: { schema: { kind: "literal", value: "preset" } }, settled: { schema: frameSpan } }),
    object({ itemId: { schema: string }, mode: { schema: { kind: "literal", value: "reveal" } },
      preferred: { schema: frameSpan }, active: { schema: frameSpan }, settled: { schema: frameSpan },
    }),
  ] } } },
});
export const rankingScheduleSchema: ValueSchema = { kind: "oneOf", variants: [triggeredScheduleSchema, columnScheduleSchema] };
const styleSchema = (): ValueSchema => object({}, true);
const setSchema = (): ValueSchema => object({
  items: { schema: { kind: "array", items: object({}, true) } },
});
const programSchema = (): ValueSchema => object({
  id: { schema: string }, frame: { schema: spatialFrameSchema },
  schedule: { schema: rankingScheduleSchema }, style: { schema: object({}, true) }, items: { schema: { kind: "array", minItems: 1, items: object({}, true) } },
}, true);
export const rankingSoundStyleSchema = styleSchema();
export const rankingSoundEventsSchema: ValueSchema = object({
  id: { schema: string }, variant: { schema: variants },
  events: { schema: { kind: "array", items: object({ id: { schema: string }, itemId: { schema: string }, kind: { schema: { kind: "string", enum: ["appear", "move"] } }, frame: { schema: unsigned } }) } },
});
export const rankingSoundSetSchema: ValueSchema = object({

  appear: { schema: object({}, true), optional: true }, move: { schema: object({}, true), optional: true },
});
const programDefinitions = [
  [rankingTypes.tierProgram, rankingTypes.tierStyle, rankingTypes.tierItems, rankingProducers.tierProgram, rankingProducers.tierEvents, rankingProducers.renderTier],
  [rankingTypes.columnProgram, rankingTypes.columnStyle, rankingTypes.columnItems, rankingProducers.columnProgram, rankingProducers.columnEvents, rankingProducers.renderColumn],
  [rankingTypes.topThreeProgram, rankingTypes.topThreeStyle, rankingTypes.topThreeItems, rankingProducers.topThreeProgram, rankingProducers.topThreeEvents, rankingProducers.renderTopThree],
] as const;

export const rankingMarkupSurfaces = [
    { name: "tier-style", tag: "TierBoardStyle", mode: "structured", outputs: [rankingTypes.tierStyle, rankingTypes.soundStyle],
      vocabulary: {
        summary: "Compiles one SVS Recipe and one exact font into the Style a TierBoard is drawn in, and the private sound Style it connects.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this Style so a TierBoard can reference it." },
          { name: "recipe", kind: "reference", required: true, accepts: [svsRecipeType],
            summary: "Chooses the Recipe carrying the tier rows, board Paint, row and cell geometry, icon treatment, staging pose and motion.",
            recipe: [
              { name: "rows", required: false, fallback: "s:S:#ef4444|a:A:#f59e0b|b:B:#22c55e|c:C:#3b82f6",
                summary: "Defines the tier rows the board draws, each written `id:label:color` and separated by `|`." },
              { name: "font-size", required: false, fallback: "28",
                summary: "Sets the size in pixels the Item copy is set at." },
              { name: "font-weight", required: false, fallback: "700",
                summary: "Sets the weight the Item copy is set at." },
              { name: "text-color", required: false, fallback: "#ffffff",
                summary: "Sets the color the Item copy is drawn in." },
              { name: "line-height", required: false, fallback: "1.15",
                summary: "Sets the line height the Item copy is set on, as a multiple of its size." },
              { name: "board-background", required: false, fallback: "#151821",
                summary: "Sets the color the board fills with." },
              { name: "board-border-color", required: false, fallback: "#ffffff33",
                summary: "Sets the color of the board's border." },
              { name: "board-border-width", required: false, fallback: "1",
                summary: "Sets the width in pixels of the board's border." },
              { name: "board-radius", required: false, fallback: "18",
                summary: "Sets the corner radius in pixels of the board." },
              { name: "board-shadow-x", required: false, fallback: "0",
                summary: "Offsets the board's shadow horizontally in pixels." },
              { name: "board-shadow-y", required: false, fallback: "10",
                summary: "Offsets the board's shadow vertically in pixels." },
              { name: "board-shadow-blur", required: false, fallback: "24",
                summary: "Sets the blur radius in pixels of the board's shadow." },
              { name: "board-shadow-spread", required: false, fallback: "0",
                summary: "Sets the spread in pixels of the board's shadow." },
              { name: "board-shadow-color", required: false, fallback: "#00000066",
                summary: "Sets the color of the board's shadow." },
              { name: "appear-frames", required: false, fallback: "6",
                summary: "Sets how many frames an Item takes to appear." },
              { name: "move-frames", required: false, fallback: "8",
                summary: "Sets how many frames a staged Item takes to move into its row." },
              { name: "motion-easing", required: false, fallback: "ease-in-out",
                values: ["linear", "ease-in", "ease-out", "ease-in-out"],
                summary: "Selects the easing both the appearance and the move are timed with." },
              { name: "label-width", required: false, fallback: "72",
                summary: "Sets the width in pixels of the column the row labels are set in." },
              { name: "padding", required: false, fallback: "18",
                summary: "Sets the inset in pixels between the board's edge and its rows." },
              { name: "row-height", required: false, fallback: "92",
                summary: "Sets the height in pixels of one tier row." },
              { name: "row-gap", required: false, fallback: "10",
                summary: "Sets the gap in pixels between tier rows." },
              { name: "cell-gap", required: false, fallback: "12",
                summary: "Sets the gap in pixels between the Items within one row." },
              { name: "icon-size", required: false, fallback: "72",
                summary: "Sets the size in pixels an Item's icon is drawn at." },
              { name: "icon-radius", required: false, fallback: "12",
                summary: "Sets the corner radius in pixels of an Item's icon." },
              { name: "icon-fit", required: false, fallback: "cover",
                values: ["contain", "cover"],
                summary: "Decides whether an Item's icon fits inside its box or fills it." },
              { name: "stage-x", required: false, fallback: "0.5",
                summary: "Places the staging point horizontally, as a fraction of the Frame's width." },
              { name: "stage-y", required: false, fallback: "0.23",
                summary: "Places the staging point vertically, as a fraction of the Frame's height." },
              { name: "stage-size", required: false, fallback: "108",
                summary: "Sets the size in pixels a staged Item is drawn at before it moves in." },
              { name: "board-stack", required: false, fallback: "20",
                summary: "Sets the draw order the board itself is placed at." },
              { name: "stage-stack", required: false, fallback: "25",
                summary: "Sets the draw order the staging area is placed at." },
              { name: "item-stack", required: false, fallback: "30",
                summary: "Sets the draw order every Item is placed at, unless the Item overrides it." },
              { name: "appear-gain", required: false, fallback: "1",
                summary: "Sets the gain the appear sound is played at." },
              { name: "move-gain", required: false, fallback: "1",
                summary: "Sets the gain the move sound is played at." },
              { name: "sound-fade-frames", required: false, fallback: "0",
                summary: "Sets how many frames each sound fades in and out over." },
            ] },
          { name: "font", kind: "reference", required: true,
            accepts: [mediaTypes.fontArtifact, mediaTypes.fontStack],
            summary: "Chooses the exact face, or a whole stack that already carries its own fallbacks, the board copy is set in." },
        ],
        ports: [
          { name: "", type: rankingTypes.tierStyle,
            summary: "The compiled visual Style, addressed by the element's own id." },
          { name: "sound", type: rankingTypes.soundStyle,
            summary: "The compiled sound Style, connected only when the board authors a sound." },
        ],
        example: `<ranking:TierBoardStyle id="tier-style" recipe={studio.ranking.tier} font={ui-font}/>`,
        notes: [
          "The element is empty; it accepts no children and no text.",
          "The Recipe is validated against the variant, so a Recipe holding another board's keys is refused by name.",
          "The Recipe accepts exactly the properties listed here; every other property is refused by name.",
          "Tier row ids, labels and colors are Recipe configuration, because they define the board vocabulary rather than item copy.",
        ],
      } },
    { name: "column-style", tag: "ColumnStyle", mode: "structured", outputs: [rankingTypes.columnStyle, rankingTypes.soundStyle],
      vocabulary: {
        summary: "Compiles one SVS Recipe and one exact font into the Style a Column is drawn in, and the private sound Style it connects.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this Style so a Column can reference it." },
          { name: "recipe", kind: "reference", required: true, accepts: [svsRecipeType],
            summary: "Chooses the Recipe carrying the rank colors, board Paint, row geometry, icon treatment, staging pose and motion.",
            recipe: [
              { name: "rank-colors", required: false, fallback: "#facc15|#d1d5db|#fb923c|#60a5fa|#a78bfa",
                summary: "Defines the color each rank badge is drawn in, separated by `|` and reused in order past the last one." },
              { name: "font-size", required: false, fallback: "28",
                summary: "Sets the size in pixels the row copy is set at." },
              { name: "font-weight", required: false, fallback: "700",
                summary: "Sets the weight the row copy is set at." },
              { name: "text-color", required: false, fallback: "#ffffff",
                summary: "Sets the color the row copy is drawn in." },
              { name: "line-height", required: false, fallback: "1.15",
                summary: "Sets the line height the row copy is set on, as a multiple of its size." },
              { name: "board-background", required: false, fallback: "#151821",
                summary: "Sets the color the board fills with." },
              { name: "board-border-color", required: false, fallback: "#ffffff33",
                summary: "Sets the color of the board's border." },
              { name: "board-border-width", required: false, fallback: "1",
                summary: "Sets the width in pixels of the board's border." },
              { name: "board-radius", required: false, fallback: "18",
                summary: "Sets the corner radius in pixels of the board." },
              { name: "board-shadow-x", required: false, fallback: "0",
                summary: "Offsets the board's shadow horizontally in pixels." },
              { name: "board-shadow-y", required: false, fallback: "10",
                summary: "Offsets the board's shadow vertically in pixels." },
              { name: "board-shadow-blur", required: false, fallback: "24",
                summary: "Sets the blur radius in pixels of the board's shadow." },
              { name: "board-shadow-spread", required: false, fallback: "0",
                summary: "Sets the spread in pixels of the board's shadow." },
              { name: "board-shadow-color", required: false, fallback: "#00000066",
                summary: "Sets the color of the board's shadow." },
              { name: "appear-frames", required: false, fallback: "6",
                summary: "Sets how many frames a row takes to appear." },
              { name: "move-frames", required: false, fallback: "8",
                summary: "Sets how many frames a staged row takes to move into the column." },
              { name: "motion-easing", required: false, fallback: "ease-in-out",
                values: ["linear", "ease-in", "ease-out", "ease-in-out"],
                summary: "Selects the easing both the appearance and the move are timed with." },
              { name: "padding", required: false, fallback: "18",
                summary: "Sets the inset in pixels between the board's edge and its rows." },
              { name: "row-height", required: false, fallback: "74",
                summary: "Sets the height in pixels of one row." },
              { name: "row-gap", required: false, fallback: "10",
                summary: "Sets the gap in pixels between rows." },
              { name: "icon-size", required: false, fallback: "58",
                summary: "Sets the size in pixels a row's icon is drawn at." },
              { name: "icon-radius", required: false, fallback: "10",
                summary: "Sets the corner radius in pixels of a row's icon." },
              { name: "icon-fit", required: false, fallback: "cover",
                values: ["contain", "cover"],
                summary: "Decides whether a row's icon fits inside its box or fills it." },
              { name: "stage-x", required: false, fallback: "0.5",
                summary: "Places the staging point horizontally, as a fraction of the Frame's width." },
              { name: "stage-y", required: false, fallback: "0.24",
                summary: "Places the staging point vertically, as a fraction of the Frame's height." },
              { name: "stage-size", required: false, fallback: "132",
                summary: "Sets the size in pixels a staged row is drawn at before it moves in." },
              { name: "board-stack", required: false, fallback: "20",
                summary: "Sets the draw order the board itself is placed at." },
              { name: "stage-stack", required: false, fallback: "25",
                summary: "Sets the draw order the staging area is placed at." },
              { name: "item-stack", required: false, fallback: "30",
                summary: "Sets the draw order every row is placed at, unless the Item overrides it." },
              { name: "appear-gain", required: false, fallback: "1",
                summary: "Sets the gain the appear sound is played at." },
              { name: "move-gain", required: false, fallback: "1",
                summary: "Sets the gain the move sound is played at." },
              { name: "sound-fade-frames", required: false, fallback: "0",
                summary: "Sets how many frames each sound fades in and out over." },
            ] },
          { name: "font", kind: "reference", required: true,
            accepts: [mediaTypes.fontArtifact, mediaTypes.fontStack],
            summary: "Chooses the exact face, or a whole stack that already carries its own fallbacks, the board copy is set in." },
        ],
        ports: [
          { name: "", type: rankingTypes.columnStyle,
            summary: "The compiled visual Style, addressed by the element's own id." },
          { name: "sound", type: rankingTypes.soundStyle,
            summary: "The compiled sound Style, connected only when the board authors a sound." },
        ],
        example: `<ranking:ColumnStyle id="board-style" recipe={studio.ranking.board} font={ui-font}/>`,
        notes: [
          "The element is empty; it accepts no children and no text.",
          "The Recipe is validated against the variant, so a Recipe holding another board's keys is refused by name.",
          "The Recipe accepts exactly the properties listed here; every other property is refused by name.",
        ],
      } },
    { name: "top-three-style", tag: "TopThreeStyle", mode: "structured", outputs: [rankingTypes.topThreeStyle, rankingTypes.soundStyle],
      vocabulary: {
        summary: "Compiles one SVS Recipe and one exact font into the Style a TopThree is drawn in, and the private sound Style it connects.",
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this Style so a TopThree can reference it." },
          { name: "recipe", kind: "reference", required: true, accepts: [svsRecipeType],
            summary: "Chooses the Recipe carrying the slot colors, podium geometry, ring and label spacing, board Paint and motion.",
            recipe: [
              { name: "slot-colors", required: false, fallback: "#facc15|#d1d5db|#fb923c",
                summary: "Defines the color each podium slot is drawn in, separated by `|`, and at least three are required." },
              { name: "font-size", required: false, fallback: "28",
                summary: "Sets the size in pixels the slot copy is set at." },
              { name: "font-weight", required: false, fallback: "700",
                summary: "Sets the weight the slot copy is set at." },
              { name: "text-color", required: false, fallback: "#ffffff",
                summary: "Sets the color the slot copy is drawn in, before the slot's own color replaces it." },
              { name: "line-height", required: false, fallback: "1.15",
                summary: "Sets the line height the slot copy is set on, as a multiple of its size." },
              { name: "center-x", required: false, fallback: "0.5",
                summary: "Places the podium's center horizontally, as a fraction of the Frame's width." },
              { name: "baseline-y", required: false, fallback: "0.55",
                summary: "Places the podium's baseline vertically, as a fraction of the Frame's height." },
              { name: "slot-gap", required: false, fallback: "24",
                summary: "Sets the gap in pixels between podium slots." },
              { name: "icon-size", required: false, fallback: "104",
                summary: "Sets the size in pixels a slot's icon is drawn at." },
              { name: "icon-radius", required: false, fallback: "52",
                summary: "Sets the corner radius in pixels of a slot's icon." },
              { name: "icon-fit", required: false, fallback: "cover",
                values: ["contain", "cover"],
                summary: "Decides whether a slot's icon fits inside its box or fills it." },
              { name: "ring-width", required: false, fallback: "5",
                summary: "Sets the width in pixels of the ring drawn around a slot." },
              { name: "label-gap", required: false, fallback: "12",
                summary: "Sets the gap in pixels between a slot's icon and its label." },
              { name: "appear-frames", required: false, fallback: "6",
                summary: "Sets how many frames a slot takes to appear." },
              { name: "move-frames", required: false, fallback: "8",
                summary: "Sets how many frames a move is timed over, though a podium never moves a slot." },
              { name: "motion-easing", required: false, fallback: "ease-in-out",
                values: ["linear", "ease-in", "ease-out", "ease-in-out"],
                summary: "Selects the easing the appearance is timed with." },
              { name: "board-stack", required: false, fallback: "20",
                summary: "Sets the draw order the empty podium is placed at." },
              { name: "item-stack", required: false, fallback: "30",
                summary: "Sets the draw order every filled slot is placed at, unless the Item overrides it." },
              { name: "appear-gain", required: false, fallback: "1",
                summary: "Sets the gain the appear sound is played at." },
              { name: "move-gain", required: false, fallback: "1",
                summary: "Sets the gain a move sound would be played at, though a podium authors none." },
              { name: "sound-fade-frames", required: false, fallback: "0",
                summary: "Sets how many frames each sound fades in and out over." },
            ] },
          { name: "font", kind: "reference", required: true,
            accepts: [mediaTypes.fontArtifact, mediaTypes.fontStack],
            summary: "Chooses the exact face, or a whole stack that already carries its own fallbacks, the board copy is set in." },
        ],
        ports: [
          { name: "", type: rankingTypes.topThreeStyle,
            summary: "The compiled visual Style, addressed by the element's own id." },
          { name: "sound", type: rankingTypes.soundStyle,
            summary: "The compiled sound Style, connected only when the board authors a sound." },
        ],
        example: `<ranking:TopThreeStyle id="podium-style" recipe={studio.ranking.podium} font={ui-font}/>`,
        notes: [
          "The element is empty; it accepts no children and no text.",
          "The Recipe is validated against the variant, so a Recipe holding another board's keys is refused by name.",
          "The Recipe carries one color per podium slot, so a TopThree Style always resolves three of them.",
          "Every other property is refused by name, except the board Paint and `stage-stack` keys, which a podium accepts and never reads.",
        ],
      } },
    { name: "tier", tag: "TierBoard", mode: "structured", outputs: [rankingTypes.header, rankingTypes.itemSpec, rankingTypes.schedule, rankingTypes.tierProgram, compositionTypes.visualTrack, compositionTypes.audioTrack],
      vocabulary: {
        summary: "Places ordered Items into tier rows, one on each occurrence of a Moment, and publishes the board and the Tracks it renders to.",
        appearance:
          "One rounded, bordered, shadowed board filling its Frame, with the Style's tier rows stacked down it from the top: each row is a full-width bar in that tier's own color, its short label set in a fixed-width column at the row's left edge. Items are square rounded icon tiles with no copy of their own; each lands in the row its `tier` names and packs left to right after the label column, one tile per trigger occurrence in document order. A tile written `direct` fades and rises into its cell over the appear frames; a tile written `stage` appears first inside a dashed square floating near the top of the Frame, holds there at stage size, then shrinks and travels into its cell. Every tile already placed stays exactly where it landed while the later ones arrive.",
        preview: previewImage("TierBoard.png"),
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this board so its Schedule, Program and Tracks can be referenced elsewhere in the Source." },
          { name: "semantic", kind: "reference", required: true, accepts: [semanticTrackTypes.track],
            summary: "Chooses the SemanticTrack that owns the frame domain and gives every trigger its frame." },
          { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame],
            summary: "Chooses the Frame the whole board occupies." },
          { name: "during", kind: "reference", required: true, accepts: [narrativeTypes.selection],
            summary: "Chooses the Selection the board is on screen for." },
          { name: "triggers", kind: "reference", required: true, accepts: [narrativeTypes.moment],
            summary: "Chooses the Moment whose occurrences place one TierItem each, in document order." },
          { name: "terminal", kind: "reference", required: true, accepts: [narrativeTypes.moment],
            summary: "Chooses the Moment the board settles on and ends after." },
          { name: "style", kind: "reference", required: true, accepts: [rankingTypes.tierStyle],
            summary: "Chooses the TierBoardStyle this board is drawn in, and only that variant's." },
          { name: "appear-sound", kind: "reference", required: false, accepts: [mediaTypes.synchronized],
            summary: "Chooses the Synchronized Medium played as each Item appears." },
          { name: "move-sound", kind: "reference", required: false, accepts: [mediaTypes.synchronized],
            summary: "Chooses the Synchronized Medium played as a staged Item moves into its row." },
        ],
        children: [
          { tag: "TierItem", cardinality: "many",
            summary: "One Item of the board, placed at its own trigger occurrence in document order; it is empty.",
            attributes: [
              { name: "id", kind: "identifier", required: false,
                summary: "Names this Item within the board; an omitted id is generated from the Item's position." },
              { name: "tier", kind: "literal", required: true,
                summary: "Chooses the row of the Style Recipe this Item is placed into." },
              { name: "entry", kind: "literal", required: false, values: ["direct", "stage"],
                summary: "Decides whether the Item lands in its row directly or stages first and moves in, and defaults to direct." },
              { name: "icon", kind: "reference", required: true, accepts: [mediaTypes.blobArtifact],
                summary: "Chooses the image drawn beside the Item." },
              { name: "stack", kind: "literal", required: false,
                summary: "Overrides the Style's draw order for this Item alone." },
            ] },
        ],
        ports: [
          { name: "schedule", type: rankingTypes.schedule,
            summary: "The resolved Schedule: each Item's trigger frame and its staged, cumulative and settled spans." },
          { name: "program", type: rankingTypes.tierProgram,
            summary: "The resolved board: its Frame, Style, Schedule and ordered Items." },
          { name: "visual", type: compositionTypes.visualTrack,
            summary: "The rendered board, an ordinary peer VisualTrack." },
          { name: "audio", type: compositionTypes.audioTrack,
            summary: "The rendered board sound, published only when a sound is authored." },
        ],
        example: `<ranking:TierBoardStyle id="tier-style" recipe={studio.ranking.tier} font={ui-font}/>
<ranking:TierBoard id="tiers" semantic={speech.semantic} frame={board-frame}
  during={story.selection.board} triggers={story.moment.place} terminal={story.moment.done}
  style={tier-style}>
  <ranking:TierItem id="row-regen" tier="s" icon={icon-regen}/>
  <ranking:TierItem id="row-remini" tier="a" entry="stage" icon={icon-remini}/>
</ranking:TierBoard>`,
        notes: [
          "The board requires at least one TierItem, accepts no other child and no text of its own, and Item ids must be unique within it.",
          "`move-sound` requires at least one TierItem written `entry=\"stage\"`; a sound with nothing to sound on is refused.",
          "Authoring either sound also connects the Style's `.sound` output, so `style` must name a TierBoardStyle written in this Source.",
        ],
      } },
    { name: "column", tag: "Column", mode: "structured", outputs: [rankingTypes.header, rankingTypes.itemSpec, rankingTypes.textItemShell, rankingTypes.schedule, rankingTypes.columnProgram, compositionTypes.visualTrack, compositionTypes.audioTrack],
      vocabulary: {
        summary: "Places rows by explicit rank, reveals each non-preset row in its own Selection, and publishes the board and the Tracks it renders to.",
        appearance:
          "A narrow vertical rank rail occupies its Frame while a large reveal stage is positioned independently in Canvas space. Preset rows are settled from the first frame. Each other row rises into the stage during its own projected Selection, then shrinks and moves into the content slot beside its numbered rank. Rank, child order and reveal time are independent.",
        preview: previewImage("Column.png"),
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this board so its Schedule, Program and Tracks can be referenced elsewhere in the Source." },
          { name: "semantic", kind: "reference", required: true, accepts: [semanticTrackTypes.track],
            summary: "Chooses the SemanticTrack that owns the frame domain and resolves every reveal Selection." },
          { name: "canvas", kind: "reference", required: true, accepts: [spatialTypes.canvas],
            summary: "Chooses the Canvas coordinate space used by the independent reveal stage." },
          { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame],
            summary: "Chooses the fixed Frame occupied by the vertical rank rail." },
          { name: "during", kind: "reference", required: true, accepts: [narrativeTypes.selection, narrativeTypes.excerpt],
            summary: "Chooses the Segment or Selection that contains the complete Column lifetime." },
          { name: "style", kind: "reference", required: true, accepts: [rankingTypes.columnStyle],
            summary: "Chooses the ColumnStyle this board is drawn in, and only that variant's." },
          { name: "appear-sound", kind: "reference", required: false, accepts: [mediaTypes.synchronized],
            summary: "Chooses the Synchronized Medium played as each row appears." },
          { name: "move-sound", kind: "reference", required: false, accepts: [mediaTypes.synchronized],
            summary: "Chooses the Synchronized Medium played as a staged row moves into the settled column." },
        ],
        children: [
          { tag: "ColumnItem", cardinality: "many",
            summary: "One explicitly ranked row; it is either preset or owns one reveal Selection.",
            attributes: [
              { name: "id", kind: "identifier", required: false,
                summary: "Names this row within the board; an omitted id is generated from the row's position." },
              { name: "label", kind: "expression", required: true, accepts: [textTypes.text],
                summary: "Sets the row's copy, written literally or chosen from an existing Text." },
              { name: "rank", kind: "literal", required: true,
                summary: "Sets the positive rank number and final row position independently from reveal order." },
              { name: "preset", kind: "literal", required: false, values: ["true", "false"],
                summary: "Settles the row from the start of the outer window; defaults to false." },
              { name: "during", kind: "reference", required: false, accepts: [narrativeTypes.selection],
                summary: "Chooses this row's preferred reveal Selection; required unless preset is true." },
              { name: "icon", kind: "reference", required: false, accepts: [mediaTypes.blobArtifact],
                summary: "Chooses the image drawn beside the row." },
              { name: "stack", kind: "literal", required: false,
                summary: "Overrides the Style's draw order for this row alone." },
            ] },
        ],
        ports: [
          { name: "schedule", type: rankingTypes.schedule,
            summary: "The resolved Schedule: preset spans and non-overlapping reveal windows inside the outer lifetime." },
          { name: "program", type: rankingTypes.columnProgram,
            summary: "The resolved board: its Frame, Style, Schedule and ordered Items." },
          { name: "visual", type: compositionTypes.visualTrack,
            summary: "The rendered board, an ordinary peer VisualTrack." },
          { name: "audio", type: compositionTypes.audioTrack,
            summary: "The rendered board sound, published only when a sound is authored." },
        ],
        example: `<ranking:ColumnStyle id="board-style" recipe={studio.ranking.board} font={ui-font}/>
<ranking:Column id="board" semantic={speech.semantic} canvas={vertical} frame={board-frame}
  during={story.segment.ranking}
  style={board-style}>
  <ranking:ColumnItem id="row-regen" rank="1" label="ReGen" icon={icon-regen} during={story.selection.regen}/>
  <ranking:ColumnItem id="row-chatgpt" rank="2" label="ChatGPT" icon={icon-chatgpt} during={story.selection.chatgpt}/>
  <ranking:ColumnItem id="row-remini" rank="5" preset="true" label="Remini" icon={icon-remini}/>
</ranking:Column>`,
        notes: [
          "The board requires at least one ColumnItem, accepts no other child and no text of its own, and Item ids must be unique within it.",
          "Ranks must be unique; child order does not determine either final placement or reveal order.",
          "Non-preset Selection windows are clamped to the outer window and resolved into non-overlapping intervals; preset Items have no child `during`.",
          "A `label` written as a reference materializes the row from that exact Text before the board is scheduled.",
          "Authoring either sound also connects the Style's `.sound` output, so `style` must name a ColumnStyle written in this Source.",
        ],
      } },
    { name: "top-three", tag: "TopThree", mode: "structured", outputs: [rankingTypes.header, rankingTypes.itemSpec, rankingTypes.textItemShell, rankingTypes.schedule, rankingTypes.topThreeProgram, compositionTypes.visualTrack, compositionTypes.audioTrack],
      vocabulary: {
        summary: "Fills a podium one slot at a time, one on each occurrence of a Moment, and publishes the board and the Tracks it renders to.",
        appearance:
          "No board, no fill and no shadow: at most three empty rings — circles at the Style's default corner radius — sit side by side in one row, centered on the Style's center point and standing on a shared baseline across the Frame, each outlined faintly in its own slot color. As its trigger occurs, a slot fades and rises into place, its ring brightening to the full slot color and swelling once slightly larger before settling back; the Item's icon fills the ring, or its rank number is set inside the ring in the slot color when no icon is written. The Item's label appears centered on its own line directly beneath the ring. Slots fill in document order and never move afterwards, so the row only gains brightness and copy as it goes.",
        preview: previewImage("TopThree.png"),
        attributes: [
          { name: "id", kind: "identifier", required: true,
            summary: "Names this board so its Schedule, Program and Tracks can be referenced elsewhere in the Source." },
          { name: "semantic", kind: "reference", required: true, accepts: [semanticTrackTypes.track],
            summary: "Chooses the SemanticTrack that owns the frame domain and gives every trigger its frame." },
          { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame],
            summary: "Chooses the Frame the whole board occupies." },
          { name: "during", kind: "reference", required: true, accepts: [narrativeTypes.selection],
            summary: "Chooses the Selection the board is on screen for." },
          { name: "triggers", kind: "reference", required: true, accepts: [narrativeTypes.moment],
            summary: "Chooses the Moment whose occurrences place one TopThreeItem each, in document order." },
          { name: "terminal", kind: "reference", required: true, accepts: [narrativeTypes.moment],
            summary: "Chooses the Moment the board settles on and ends after." },
          { name: "style", kind: "reference", required: true, accepts: [rankingTypes.topThreeStyle],
            summary: "Chooses the TopThreeStyle this board is drawn in, and only that variant's." },
          { name: "appear-sound", kind: "reference", required: false, accepts: [mediaTypes.synchronized],
            summary: "Chooses the Synchronized Medium played as each slot appears." },
        ],
        children: [
          { tag: "TopThreeItem", cardinality: "many",
            summary: "One slot of the podium, placed at its own trigger occurrence in document order; it is empty.",
            attributes: [
              { name: "id", kind: "identifier", required: false,
                summary: "Names this slot within the board; an omitted id is generated from the slot's position." },
              { name: "label", kind: "expression", required: true, accepts: [textTypes.text],
                summary: "Sets the slot's copy, written literally or chosen from an existing Text." },
              { name: "icon", kind: "reference", required: false, accepts: [mediaTypes.blobArtifact],
                summary: "Chooses the image drawn beside the slot." },
              { name: "stack", kind: "literal", required: false,
                summary: "Overrides the Style's draw order for this slot alone." },
            ] },
        ],
        ports: [
          { name: "schedule", type: rankingTypes.schedule,
            summary: "The resolved Schedule: each Item's trigger frame and its staged, cumulative and settled spans." },
          { name: "program", type: rankingTypes.topThreeProgram,
            summary: "The resolved board: its Frame, Style, Schedule and ordered Items." },
          { name: "visual", type: compositionTypes.visualTrack,
            summary: "The rendered board, an ordinary peer VisualTrack." },
          { name: "audio", type: compositionTypes.audioTrack,
            summary: "The rendered board sound, published only when a sound is authored." },
        ],
        example: `<ranking:TopThreeStyle id="podium-style" recipe={studio.ranking.podium} font={ui-font}/>
<ranking:TopThree id="podium" semantic={speech.semantic} frame={board-frame}
  during={story.selection.board} triggers={story.moment.place} terminal={story.moment.done}
  style={podium-style}>
  <ranking:TopThreeItem id="slot-gold" label="ReGen" icon={icon-regen}/>
  <ranking:TopThreeItem id="slot-silver" label="ChatGPT"/>
  <ranking:TopThreeItem id="slot-bronze" label="Remini"/>
</ranking:TopThree>`,
        notes: [
          "The board requires at least one TopThreeItem, accepts no other child and no text of its own, and Item ids must be unique within it.",
          "A `label` written as a reference materializes the slot from that exact Text before the board is scheduled.",
          "The podium has no move phase, so it takes no `move-sound`; writing one is refused.",
          "The podium holds at most three Items; a fourth is refused when the Program is built.",
          "Authoring the appear sound also connects the Style's `.sound` output, so `style` must name a TopThreeStyle written in this Source.",
        ],
      } },
  ] as const;


export const rankingManifest: ModuleManifest = {
  format: "hypit.module@1", name: rankingModuleRef.name, version: rankingModuleRef.version,
  dependencies: [artifactDependency, mediaDependency, narrativeDependency, semanticTrackDependency, spatialDependency, temporalDependency, compositionDependency, textDependency],
  types: [
    { name: rankingTypes.header.name },
    { name: rankingTypes.itemSpec.name },
    { name: rankingTypes.textItemShell.name },
    { name: rankingTypes.itemSpecs.name },
    { name: rankingTypes.columnOuter.name },
    { name: rankingTypes.columnCandidates.name },
    { name: rankingTypes.schedule.name },
    { name: rankingTypes.soundStyle.name },
    { name: rankingTypes.soundEvents.name },
    { name: rankingTypes.sounds.name },
    { name: rankingTypes.tierStyle.name },
    { name: rankingTypes.columnStyle.name },
    { name: rankingTypes.topThreeStyle.name },
    { name: rankingTypes.tierItems.name },
    { name: rankingTypes.columnItems.name },
    { name: rankingTypes.topThreeItems.name },
    { name: rankingTypes.tierProgram.name },
    { name: rankingTypes.columnProgram.name },
    { name: rankingTypes.topThreeProgram.name },
  ],
  capabilities: [],
  producers: [
    { name: rankingProducers.materializeTextItem.name, inputs: [{ name: "shell", type: rankingTypes.textItemShell }, { name: "content", type: textTypes.text }], outputs: [{ name: "spec", type: rankingTypes.itemSpec }], needs: [] },
    { name: rankingProducers.createSpecs.name, inputs: [{ name: "header", type: rankingTypes.header }], outputs: [{ name: "set", type: rankingTypes.itemSpecs }], needs: [] },
    { name: rankingProducers.appendSpec.name, inputs: [{ name: "set", type: rankingTypes.itemSpecs }, { name: "spec", type: rankingTypes.itemSpec }], outputs: [{ name: "set", type: rankingTypes.itemSpecs }], needs: [] },
    { name: rankingProducers.schedule.name, inputs: [
      { name: "header", type: rankingTypes.header }, { name: "items", type: rankingTypes.itemSpecs },
      { name: "semantic", type: semanticTrackTypes.track },
      { name: "outer", type: narrativeTypes.selection }, { name: "triggers", type: narrativeTypes.moment }, { name: "terminal", type: narrativeTypes.moment },
    ], outputs: [{ name: "schedule", type: rankingTypes.schedule }], needs: [] },
    { name: rankingProducers.projectColumnSelectionOuter.name, inputs: [
      { name: "semantic", type: semanticTrackTypes.track },
      { name: "selection", type: narrativeTypes.selection },
    ], outputs: [{ name: "outer", type: rankingTypes.columnOuter }], needs: [] },
    { name: rankingProducers.projectColumnSegmentOuter.name, inputs: [
      { name: "semantic", type: semanticTrackTypes.track },
      { name: "segment", type: narrativeTypes.excerpt },
    ], outputs: [{ name: "outer", type: rankingTypes.columnOuter }], needs: [] },
    { name: rankingProducers.createColumnCandidates.name, inputs: [], outputs: [
      { name: "set", type: rankingTypes.columnCandidates },
    ], needs: [] },
    { name: rankingProducers.appendColumnCandidate.name, inputs: [
      { name: "set", type: rankingTypes.columnCandidates }, { name: "spec", type: rankingTypes.itemSpec },
      { name: "semantic", type: semanticTrackTypes.track },
      { name: "selection", type: narrativeTypes.selection },
    ], outputs: [{ name: "set", type: rankingTypes.columnCandidates }], needs: [] },
    { name: rankingProducers.columnSchedule.name, inputs: [
      { name: "header", type: rankingTypes.header }, { name: "items", type: rankingTypes.itemSpecs },
      { name: "outer", type: rankingTypes.columnOuter }, { name: "candidates", type: rankingTypes.columnCandidates },
    ], outputs: [{ name: "schedule", type: rankingTypes.schedule }], needs: [] },
    ...([
      [rankingProducers.createTierItems, rankingTypes.tierItems],
      [rankingProducers.createColumnItems, rankingTypes.columnItems],
      [rankingProducers.createTopThreeItems, rankingTypes.topThreeItems],
    ] as const).map(([producer, type]) => ({
      name: producer.name, inputs: [], outputs: [{ name: "set", type }], needs: [],
    })),
    { name: rankingProducers.appendTierItem.name, inputs: [{ name: "set", type: rankingTypes.tierItems }, { name: "spec", type: rankingTypes.itemSpec }, { name: "icon", type: mediaTypes.blobArtifact }], outputs: [{ name: "set", type: rankingTypes.tierItems }], needs: [] },
    ...([
      [rankingProducers.appendColumnItem, rankingTypes.columnItems],
      [rankingProducers.appendTopThreeItem, rankingTypes.topThreeItems],
    ] as const).map(([producer, type]) => ({
      name: producer.name, inputs: [{ name: "set", type }, { name: "spec", type: rankingTypes.itemSpec }], outputs: [{ name: "set", type }], needs: [],
    })),
    ...([
      [rankingProducers.appendColumnIconItem, rankingTypes.columnItems],
      [rankingProducers.appendTopThreeIconItem, rankingTypes.topThreeItems],
    ] as const).map(([producer, type]) => ({
      name: producer.name, inputs: [{ name: "set", type }, { name: "spec", type: rankingTypes.itemSpec }, { name: "icon", type: mediaTypes.blobArtifact }], outputs: [{ name: "set", type }], needs: [],
    })),
    ...programDefinitions.flatMap(([programType, styleType, setType, programProducer, eventProducer, renderProducer]) => [
      { name: programProducer.name, inputs: [
        { name: "header", type: rankingTypes.header },
        ...(programType === rankingTypes.columnProgram ? [{ name: "canvas", type: spatialTypes.canvas }] : []),
        { name: "frame", type: spatialTypes.frame }, { name: "schedule", type: rankingTypes.schedule },
        { name: "style", type: styleType }, { name: "set", type: setType },
      ], outputs: [{ name: "program", type: programType }], needs: [] },
      { name: eventProducer.name, inputs: [
        { name: "schedule", type: rankingTypes.schedule }, { name: "style", type: styleType }, { name: "specs", type: rankingTypes.itemSpecs },
      ], outputs: [{ name: "events", type: rankingTypes.soundEvents }], needs: [] },
      { name: renderProducer.name, inputs: [{ name: "semantic", type: semanticTrackTypes.track }, { name: "program", type: programType }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
    ]),
    { name: rankingProducers.createSounds.name, inputs: [], outputs: [{ name: "sounds", type: rankingTypes.sounds }], needs: [] },
    ...([
      rankingProducers.appendAppearSound,
      rankingProducers.appendMoveSound,
    ] as const).map((producer) => ({
      name: producer.name, inputs: [{ name: "sounds", type: rankingTypes.sounds }, { name: "media", type: mediaTypes.synchronized }], outputs: [{ name: "sounds", type: rankingTypes.sounds }], needs: [],
    })),
    { name: rankingProducers.renderAudio.name, inputs: [
      { name: "semantic", type: semanticTrackTypes.track }, { name: "events", type: rankingTypes.soundEvents },
      { name: "style", type: rankingTypes.soundStyle }, { name: "sounds", type: rankingTypes.sounds },
    ], outputs: [{ name: "track", type: compositionTypes.audioTrack }], needs: [] },
  ],
};

export const rankingDependency = { module: rankingModuleRef } as const;
