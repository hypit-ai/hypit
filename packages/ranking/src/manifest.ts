import { artifactDependency } from "@narratage/artifact";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import { mediaDependency, mediaTypes } from "@narratage/media";
import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import { spatialDependency, spatialFrameSchema, spatialTypes } from "@narratage/spatial";
import { temporalDependency } from "@narratage/temporal";
import { textDependency, textTypes } from "@narratage/text";

export const rankingModuleRef = { name: "@narratage/ranking", version: "1" } as const;
export const rankingTypes = {
  header: { module: rankingModuleRef, name: "RankingHeader" },
  itemSpec: { module: rankingModuleRef, name: "RankingItemSpec" },
  textItemShell: { module: rankingModuleRef, name: "RankingTextItemShell" },
  itemSpecs: { module: rankingModuleRef, name: "RankingItemSpecSet" },
  schedule: { module: rankingModuleRef, name: "RankingSchedule" },
  soundStyle: { module: rankingModuleRef, name: "RankingSoundStyle" },
  soundEvents: { module: rankingModuleRef, name: "RankingSoundEventPlan" },
  sounds: { module: rankingModuleRef, name: "RankingSoundSet" },
  tierStyle: { module: rankingModuleRef, name: "TierBoardStyle" },
  columnStyle: { module: rankingModuleRef, name: "ColumnStyle" },
  topThreeStyle: { module: rankingModuleRef, name: "TopThreeStyle" },
  typewriterStyle: { module: rankingModuleRef, name: "TypewriterListStyle" },
  tierItems: { module: rankingModuleRef, name: "TierBoardItemSet" },
  columnItems: { module: rankingModuleRef, name: "ColumnItemSet" },
  topThreeItems: { module: rankingModuleRef, name: "TopThreeItemSet" },
  typewriterItems: { module: rankingModuleRef, name: "TypewriterItemSet" },
  tierProgram: { module: rankingModuleRef, name: "TierBoardProgram" },
  columnProgram: { module: rankingModuleRef, name: "ColumnProgram" },
  topThreeProgram: { module: rankingModuleRef, name: "TopThreeProgram" },
  typewriterProgram: { module: rankingModuleRef, name: "TypewriterListProgram" },
} satisfies Record<string, TypeRef>;

export const rankingProducers = {
  createSpecs: { module: rankingModuleRef, name: "create-ranking-item-specs" },
  appendSpec: { module: rankingModuleRef, name: "append-ranking-item-spec" },
  schedule: { module: rankingModuleRef, name: "build-ranking-schedule" },
  createTierItems: { module: rankingModuleRef, name: "create-tier-board-items" },
  appendTierItem: { module: rankingModuleRef, name: "append-tier-board-item" },
  createColumnItems: { module: rankingModuleRef, name: "create-column-items" },
  appendColumnItem: { module: rankingModuleRef, name: "append-column-item" },
  appendColumnIconItem: { module: rankingModuleRef, name: "append-column-icon-item" },
  createTopThreeItems: { module: rankingModuleRef, name: "create-top-three-items" },
  appendTopThreeItem: { module: rankingModuleRef, name: "append-top-three-item" },
  appendTopThreeIconItem: { module: rankingModuleRef, name: "append-top-three-icon-item" },
  createTypewriterItems: { module: rankingModuleRef, name: "create-typewriter-items" },
  appendTypewriterItem: { module: rankingModuleRef, name: "append-typewriter-item" },
  tierProgram: { module: rankingModuleRef, name: "build-tier-board-program" },
  columnProgram: { module: rankingModuleRef, name: "build-column-program" },
  topThreeProgram: { module: rankingModuleRef, name: "build-top-three-program" },
  typewriterProgram: { module: rankingModuleRef, name: "build-typewriter-list-program" },
  tierEvents: { module: rankingModuleRef, name: "build-tier-board-sound-events" },
  columnEvents: { module: rankingModuleRef, name: "build-column-sound-events" },
  topThreeEvents: { module: rankingModuleRef, name: "build-top-three-sound-events" },
  typewriterEvents: { module: rankingModuleRef, name: "build-typewriter-list-sound-events" },
  createSounds: { module: rankingModuleRef, name: "create-ranking-sounds" },
  appendAppearSound: { module: rankingModuleRef, name: "append-ranking-appear-sound" },
  appendMoveSound: { module: rankingModuleRef, name: "append-ranking-move-sound" },
  renderAudio: { module: rankingModuleRef, name: "render-ranking-audio" },
  renderTier: { module: rankingModuleRef, name: "render-tier-board" },
  renderColumn: { module: rankingModuleRef, name: "render-column" },
  renderTopThree: { module: rankingModuleRef, name: "render-top-three" },
  renderTypewriter: { module: rankingModuleRef, name: "render-typewriter-list" },
  materializeTextItem: { module: rankingModuleRef, name: "materialize-text-item" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true } as const;
const unsigned = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>, allowUnknown = false): ValueSchema => ({
  kind: "object", fields, ...(allowUnknown ? { allowUnknown: true } : {}),
});
const variants = { kind: "string", enum: ["tier-board", "column", "top-three", "typewriter-list"] } as const;
const itemBase = {
  id: { schema: string },
  stackingOrder: { schema: integer, optional: true },
} as const;
export const rankingHeaderSchema: ValueSchema = object({
  id: { schema: string }, variant: { schema: variants },
});
export const rankingItemSpecSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ variant: { schema: { kind: "literal", value: "tier-board" } }, ...itemBase, tier: { schema: string }, entry: { schema: { kind: "string", enum: ["direct", "stage"] } } }),
  object({ variant: { schema: { kind: "literal", value: "column" } }, ...itemBase, label: { schema: string } }),
  object({ variant: { schema: { kind: "literal", value: "top-three" } }, ...itemBase, label: { schema: string } }),
  object({ variant: { schema: { kind: "literal", value: "typewriter-list" } }, ...itemBase,
    text: { schema: string }, winner: { schema: { kind: "boolean" } },
    emphasis: { optional: true, schema: object({ start: { schema: unsigned }, endExclusive: { schema: unsigned } }) },
  }),
] };
export const rankingTextItemShellSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ variant: { schema: { kind: "literal", value: "column" } }, ...itemBase }),
  object({ variant: { schema: { kind: "literal", value: "top-three" } }, ...itemBase }),
  object({ variant: { schema: { kind: "literal", value: "typewriter-list" } }, ...itemBase,
    winner: { schema: { kind: "boolean" } },
    emphasis: { optional: true, schema: object({ start: { schema: unsigned }, endExclusive: { schema: unsigned } }) },
  }),
] };
export const rankingItemSpecSetSchema: ValueSchema = object({

  variant: { schema: variants }, items: { schema: { kind: "array", items: rankingItemSpecSchema } },
});
const frameSpan = object({ startFrame: { schema: unsigned }, endFrameExclusive: { schema: unsigned } });
export const rankingScheduleSchema: ValueSchema = object({
  id: { schema: string },
  variant: { schema: variants }, outer: { schema: frameSpan }, terminalFrame: { schema: unsigned },
  entries: { schema: { kind: "array", minItems: 1, items: object({
    itemId: { schema: string }, triggerFrame: { schema: unsigned },
    stage: { schema: frameSpan }, cumulative: { schema: frameSpan }, settled: { schema: frameSpan },
  }) } },
});
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
  ["tier", rankingTypes.tierProgram, rankingTypes.tierStyle, rankingTypes.tierItems, rankingProducers.tierProgram, rankingProducers.tierEvents, rankingProducers.renderTier],
  ["column", rankingTypes.columnProgram, rankingTypes.columnStyle, rankingTypes.columnItems, rankingProducers.columnProgram, rankingProducers.columnEvents, rankingProducers.renderColumn],
  ["top-three", rankingTypes.topThreeProgram, rankingTypes.topThreeStyle, rankingTypes.topThreeItems, rankingProducers.topThreeProgram, rankingProducers.topThreeEvents, rankingProducers.renderTopThree],
  ["typewriter", rankingTypes.typewriterProgram, rankingTypes.typewriterStyle, rankingTypes.typewriterItems, rankingProducers.typewriterProgram, rankingProducers.typewriterEvents, rankingProducers.renderTypewriter],
] as const;

export const rankingMarkupSurfaces = [
    { name: "tier-style", tag: "TierBoardStyle", mode: "structured", outputs: [rankingTypes.tierStyle, rankingTypes.soundStyle] },
    { name: "column-style", tag: "ColumnStyle", mode: "structured", outputs: [rankingTypes.columnStyle, rankingTypes.soundStyle] },
    { name: "top-three-style", tag: "TopThreeStyle", mode: "structured", outputs: [rankingTypes.topThreeStyle, rankingTypes.soundStyle] },
    { name: "typewriter-style", tag: "TypewriterListStyle", mode: "structured", outputs: [rankingTypes.typewriterStyle, rankingTypes.soundStyle] },
    { name: "tier", tag: "TierBoard", mode: "structured", outputs: [rankingTypes.header, rankingTypes.itemSpec, rankingTypes.schedule, rankingTypes.tierProgram, compositionTypes.visualTrack, compositionTypes.audioTrack] },
    { name: "column", tag: "Column", mode: "structured", outputs: [rankingTypes.header, rankingTypes.itemSpec, rankingTypes.textItemShell, rankingTypes.schedule, rankingTypes.columnProgram, compositionTypes.visualTrack, compositionTypes.audioTrack] },
    { name: "top-three", tag: "TopThree", mode: "structured", outputs: [rankingTypes.header, rankingTypes.itemSpec, rankingTypes.textItemShell, rankingTypes.schedule, rankingTypes.topThreeProgram, compositionTypes.visualTrack, compositionTypes.audioTrack] },
    { name: "typewriter", tag: "TypewriterList", mode: "structured", outputs: [rankingTypes.header, rankingTypes.itemSpec, rankingTypes.textItemShell, textTypes.text, rankingTypes.schedule, rankingTypes.typewriterProgram, compositionTypes.visualTrack, compositionTypes.audioTrack] },
  ] as const;


export const rankingManifest: ModuleManifest = {
  format: "narratage.module@1", name: rankingModuleRef.name, version: rankingModuleRef.version,
  dependencies: [artifactDependency, mediaDependency, narrativeDependency, semanticMapDependency, programSpaceDependency, spatialDependency, temporalDependency, compositionDependency, textDependency],
  types: [
    { name: rankingTypes.header.name },
    { name: rankingTypes.itemSpec.name },
    { name: rankingTypes.textItemShell.name },
    { name: rankingTypes.itemSpecs.name },
    { name: rankingTypes.schedule.name },
    { name: rankingTypes.soundStyle.name },
    { name: rankingTypes.soundEvents.name },
    { name: rankingTypes.sounds.name },
    { name: rankingTypes.tierStyle.name },
    { name: rankingTypes.columnStyle.name },
    { name: rankingTypes.topThreeStyle.name },
    { name: rankingTypes.typewriterStyle.name },
    { name: rankingTypes.tierItems.name },
    { name: rankingTypes.columnItems.name },
    { name: rankingTypes.topThreeItems.name },
    { name: rankingTypes.typewriterItems.name },
    { name: rankingTypes.tierProgram.name },
    { name: rankingTypes.columnProgram.name },
    { name: rankingTypes.topThreeProgram.name },
    { name: rankingTypes.typewriterProgram.name },
  ],
  capabilities: [],
  producers: [
    { name: rankingProducers.materializeTextItem.name, inputs: [{ name: "shell", type: rankingTypes.textItemShell }, { name: "content", type: textTypes.text }], outputs: [{ name: "spec", type: rankingTypes.itemSpec }], needs: [] },
    { name: rankingProducers.createSpecs.name, inputs: [{ name: "header", type: rankingTypes.header }], outputs: [{ name: "set", type: rankingTypes.itemSpecs }], needs: [] },
    { name: rankingProducers.appendSpec.name, inputs: [{ name: "set", type: rankingTypes.itemSpecs }, { name: "spec", type: rankingTypes.itemSpec }], outputs: [{ name: "set", type: rankingTypes.itemSpecs }], needs: [] },
    { name: rankingProducers.schedule.name, inputs: [
      { name: "header", type: rankingTypes.header }, { name: "items", type: rankingTypes.itemSpecs },
      { name: "map", type: semanticMapTypes.complete }, { name: "space", type: programSpaceTypes.programSpace },
      { name: "outer", type: narrativeTypes.selection }, { name: "triggers", type: narrativeTypes.moment }, { name: "terminal", type: narrativeTypes.moment },
    ], outputs: [{ name: "schedule", type: rankingTypes.schedule }], needs: [] },
    ...([
      [rankingProducers.createTierItems, rankingTypes.tierItems],
      [rankingProducers.createColumnItems, rankingTypes.columnItems],
      [rankingProducers.createTopThreeItems, rankingTypes.topThreeItems],
      [rankingProducers.createTypewriterItems, rankingTypes.typewriterItems],
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
    { name: rankingProducers.appendTypewriterItem.name, inputs: [{ name: "set", type: rankingTypes.typewriterItems }, { name: "spec", type: rankingTypes.itemSpec }], outputs: [{ name: "set", type: rankingTypes.typewriterItems }], needs: [] },
    ...programDefinitions.flatMap(([name, programType, styleType, setType, programProducer, eventProducer, renderProducer]) => [
      { name: programProducer.name, inputs: [
        { name: "header", type: rankingTypes.header },
        ...(name === "typewriter" ? [{ name: "title", type: textTypes.text }] : []),
        { name: "frame", type: spatialTypes.frame }, { name: "schedule", type: rankingTypes.schedule },
        { name: "style", type: styleType }, { name: "set", type: setType },
      ], outputs: [{ name: "program", type: programType }], needs: [] },
      { name: eventProducer.name, inputs: [
        { name: "schedule", type: rankingTypes.schedule }, { name: "style", type: styleType }, { name: "specs", type: rankingTypes.itemSpecs },
      ], outputs: [{ name: "events", type: rankingTypes.soundEvents }], needs: [] },
      { name: renderProducer.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: programType }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
    ]),
    { name: rankingProducers.createSounds.name, inputs: [], outputs: [{ name: "sounds", type: rankingTypes.sounds }], needs: [] },
    ...([
      rankingProducers.appendAppearSound,
      rankingProducers.appendMoveSound,
    ] as const).map((producer) => ({
      name: producer.name, inputs: [{ name: "sounds", type: rankingTypes.sounds }, { name: "media", type: mediaTypes.synchronized }], outputs: [{ name: "sounds", type: rankingTypes.sounds }], needs: [],
    })),
    { name: rankingProducers.renderAudio.name, inputs: [
      { name: "space", type: programSpaceTypes.programSpace }, { name: "events", type: rankingTypes.soundEvents },
      { name: "style", type: rankingTypes.soundStyle }, { name: "sounds", type: rankingTypes.sounds },
    ], outputs: [{ name: "track", type: compositionTypes.audioTrack }], needs: [] },
  ],
};

export const rankingDependency = { module: rankingModuleRef } as const;
