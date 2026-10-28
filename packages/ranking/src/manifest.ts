import { frameSpanSchema, timelineTypes, timelineDependency } from "@hypit/timeline";

import { blobDependency } from "@hypit/hypit/blob";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { mediaOperationsModuleRef } from "@hypit/media-operations";

import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { temporalDependency, temporalInstantSchema, temporalTypes, temporalWindowSchema } from "@hypit/temporal";
import { textDependency, textTypes } from "@hypit/hypit/text";

export const rankingModuleRef = { name: "@hypit/ranking", version: "1" } as const;
export const rankingTypes = {
  header: { module: rankingModuleRef, name: "RankingHeader" },
  itemSpec: { module: rankingModuleRef, name: "RankingItemSpec" },
  textItemShell: { module: rankingModuleRef, name: "RankingTextItemShell" },
  itemSpecs: { module: rankingModuleRef, name: "RankingItemSpecSet" },
  triggeredCandidates: { module: rankingModuleRef, name: "TriggeredRankingCandidateSet" },
  tierWindows: { module: rankingModuleRef, name: "TierBoardWindowSet" },
  columnWindows: { module: rankingModuleRef, name: "ColumnWindowSet" },
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
  createTriggeredCandidates: { module: rankingModuleRef, name: "create-triggered-ranking-candidates" },
  appendTriggeredCandidate: { module: rankingModuleRef, name: "append-triggered-ranking-candidate" },
  schedule: { module: rankingModuleRef, name: "build-ranking-schedule" },
  createTierWindows: { module: rankingModuleRef, name: "create-tier-board-windows" },
  appendTierWindow: { module: rankingModuleRef, name: "append-tier-board-window" },
  tierSchedule: { module: rankingModuleRef, name: "build-tier-board-schedule" },
  createColumnWindows: { module: rankingModuleRef, name: "create-column-windows" },
  appendColumnWindow: { module: rankingModuleRef, name: "append-column-window" },
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
  object({ variant: { schema: { kind: "literal", value: "tier-board" } }, ...itemBase,
    tier: { schema: string }, preset: { schema: { kind: "literal", value: true } },
  }),
  object({ variant: { schema: { kind: "literal", value: "tier-board" } }, ...itemBase,
    tier: { schema: string }, preset: { schema: { kind: "literal", value: false } }, entry: { schema: { kind: "string", enum: ["direct", "drop"] } },
  }),
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
export const triggeredRankingCandidateSetSchema: ValueSchema = object({
  entries: { schema: { kind: "array", items: object({
    itemId: { schema: string }, activation: { schema: temporalInstantSchema },
  }) } },
});
export const rankingWindowSetSchema: ValueSchema = object({
  entries: { schema: { kind: "array", items: object({
    itemId: { schema: string }, window: { schema: temporalWindowSchema },
  }) } },
});
export const tierBoardWindowSetSchema = rankingWindowSetSchema;
export const columnWindowSetSchema = rankingWindowSetSchema;
const triggeredScheduleSchema: ValueSchema = object({
  id: { schema: string },
  variant: { schema: { kind: "literal", value: "top-three" } },
  outer: { schema: frameSpanSchema }, terminalFrame: { schema: unsigned },
  entries: { schema: { kind: "array", minItems: 1, items: object({
    itemId: { schema: string }, triggerFrame: { schema: unsigned },
    stage: { schema: frameSpanSchema }, cumulative: { schema: frameSpanSchema }, settled: { schema: frameSpanSchema },
  }) } },
});
const windowedScheduleSchema = (variant: "tier-board" | "column"): ValueSchema => object({
  id: { schema: string }, variant: { schema: { kind: "literal", value: variant } }, outer: { schema: frameSpanSchema },
  entries: { schema: { kind: "array", minItems: 1, items: { kind: "oneOf", variants: [
    object({ itemId: { schema: string }, mode: { schema: { kind: "literal", value: "preset" } }, settled: { schema: frameSpanSchema } }),
    object({ itemId: { schema: string }, mode: { schema: { kind: "literal", value: "reveal" } },
      window: { schema: frameSpanSchema }, settled: { schema: frameSpanSchema },
    }),
  ] } } },
});
export const rankingScheduleSchema: ValueSchema = { kind: "oneOf", variants: [
  triggeredScheduleSchema, windowedScheduleSchema("tier-board"), windowedScheduleSchema("column"),
] };
const styleSchema = (): ValueSchema => object({}, true);
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


export const rankingManifest: ModuleManifest = {
  format: "hypit.module@1", name: rankingModuleRef.name, version: rankingModuleRef.version,
  dependencies: [blobDependency, mediaDependency, mediaOperationsModuleRef, timelineDependency, spatialDependency, temporalDependency, compositionDependency, textDependency],
  types: [
    rankingTypes.header.name,
    rankingTypes.itemSpec.name,
    rankingTypes.textItemShell.name,
    rankingTypes.itemSpecs.name,
    rankingTypes.triggeredCandidates.name,
    rankingTypes.tierWindows.name,
    rankingTypes.columnWindows.name,
    rankingTypes.schedule.name,
    rankingTypes.soundStyle.name,
    rankingTypes.soundEvents.name,
    rankingTypes.sounds.name,
    rankingTypes.tierStyle.name,
    rankingTypes.columnStyle.name,
    rankingTypes.topThreeStyle.name,
    rankingTypes.tierItems.name,
    rankingTypes.columnItems.name,
    rankingTypes.topThreeItems.name,
    rankingTypes.tierProgram.name,
    rankingTypes.columnProgram.name,
    rankingTypes.topThreeProgram.name,
  ],
  capabilities: [],
  producers: [
    { name: rankingProducers.materializeTextItem.name, inputs: [{ name: "shell", type: rankingTypes.textItemShell }, { name: "content", type: textTypes.text }], result: { kind: "output" as const, name: "spec", type: rankingTypes.itemSpec } },
    { name: rankingProducers.createSpecs.name, inputs: [{ name: "header", type: rankingTypes.header }], result: { kind: "output" as const, name: "set", type: rankingTypes.itemSpecs } },
    { name: rankingProducers.appendSpec.name, inputs: [{ name: "set", type: rankingTypes.itemSpecs }, { name: "spec", type: rankingTypes.itemSpec }], result: { kind: "output" as const, name: "set", type: rankingTypes.itemSpecs } },
    { name: rankingProducers.createTriggeredCandidates.name, inputs: [], result: { kind: "output" as const, name: "set", type: rankingTypes.triggeredCandidates } },
    { name: rankingProducers.appendTriggeredCandidate.name, inputs: [
      { name: "set", type: rankingTypes.triggeredCandidates }, { name: "spec", type: rankingTypes.itemSpec },
      { name: "activation", type: temporalTypes.instant },
    ], result: { kind: "output" as const, name: "set", type: rankingTypes.triggeredCandidates } },
    { name: rankingProducers.schedule.name, inputs: [
      { name: "header", type: rankingTypes.header }, { name: "items", type: rankingTypes.itemSpecs },
      { name: "timeline", type: timelineTypes.timeline },
      { name: "outer", type: temporalTypes.window }, { name: "candidates", type: rankingTypes.triggeredCandidates },
      { name: "terminal", type: temporalTypes.instant },
    ], result: { kind: "output" as const, name: "schedule", type: rankingTypes.schedule } },
    { name: rankingProducers.createTierWindows.name, inputs: [], result: { kind: "output" as const, name: "set", type: rankingTypes.tierWindows } },
    { name: rankingProducers.appendTierWindow.name, inputs: [
      { name: "set", type: rankingTypes.tierWindows }, { name: "spec", type: rankingTypes.itemSpec },
      { name: "window", type: temporalTypes.window },
    ], result: { kind: "output" as const, name: "set", type: rankingTypes.tierWindows } },
    { name: rankingProducers.tierSchedule.name, inputs: [
      { name: "header", type: rankingTypes.header }, { name: "items", type: rankingTypes.itemSpecs },
      { name: "timeline", type: timelineTypes.timeline },
      { name: "outer", type: temporalTypes.window }, { name: "windows", type: rankingTypes.tierWindows },
    ], result: { kind: "output" as const, name: "schedule", type: rankingTypes.schedule } },
    { name: rankingProducers.createColumnWindows.name, inputs: [], result: { kind: "output" as const, name: "set", type: rankingTypes.columnWindows } },
    { name: rankingProducers.appendColumnWindow.name, inputs: [
      { name: "set", type: rankingTypes.columnWindows }, { name: "spec", type: rankingTypes.itemSpec },
      { name: "window", type: temporalTypes.window },
    ], result: { kind: "output" as const, name: "set", type: rankingTypes.columnWindows } },
    { name: rankingProducers.columnSchedule.name, inputs: [
      { name: "header", type: rankingTypes.header }, { name: "items", type: rankingTypes.itemSpecs },
      { name: "timeline", type: timelineTypes.timeline },
      { name: "outer", type: temporalTypes.window }, { name: "windows", type: rankingTypes.columnWindows },
    ], result: { kind: "output" as const, name: "schedule", type: rankingTypes.schedule } },
    ...([
      [rankingProducers.createTierItems, rankingTypes.tierItems],
      [rankingProducers.createColumnItems, rankingTypes.columnItems],
      [rankingProducers.createTopThreeItems, rankingTypes.topThreeItems],
    ] as const).map(([producer, type]) => ({
      name: producer.name, inputs: [], result: { kind: "output" as const, name: "set", type },
    })),
    { name: rankingProducers.appendTierItem.name, inputs: [{ name: "set", type: rankingTypes.tierItems }, { name: "spec", type: rankingTypes.itemSpec }, { name: "icon", type: mediaTypes.blobArtifact }], result: { kind: "output" as const, name: "set", type: rankingTypes.tierItems } },
    ...([
      [rankingProducers.appendColumnItem, rankingTypes.columnItems],
      [rankingProducers.appendTopThreeItem, rankingTypes.topThreeItems],
    ] as const).map(([producer, type]) => ({
      name: producer.name, inputs: [{ name: "set", type }, { name: "spec", type: rankingTypes.itemSpec }], result: { kind: "output" as const, name: "set", type },
    })),
    ...([
      [rankingProducers.appendColumnIconItem, rankingTypes.columnItems],
      [rankingProducers.appendTopThreeIconItem, rankingTypes.topThreeItems],
    ] as const).map(([producer, type]) => ({
      name: producer.name, inputs: [{ name: "set", type }, { name: "spec", type: rankingTypes.itemSpec }, { name: "icon", type: mediaTypes.blobArtifact }], result: { kind: "output" as const, name: "set", type },
    })),
    ...programDefinitions.flatMap(([programType, styleType, setType, programProducer, eventProducer, renderProducer]) => [
      { name: programProducer.name, inputs: [
        { name: "header", type: rankingTypes.header },
        ...(programType === rankingTypes.columnProgram || programType === rankingTypes.tierProgram
          ? [{ name: "within", type: spatialTypes.frame }] : []),
        { name: "frame", type: spatialTypes.frame }, { name: "schedule", type: rankingTypes.schedule },
        { name: "style", type: styleType }, { name: "set", type: setType },
      ], result: { kind: "output" as const, name: "program", type: programType } },
      { name: eventProducer.name, inputs: [
        { name: "schedule", type: rankingTypes.schedule }, { name: "style", type: styleType }, { name: "specs", type: rankingTypes.itemSpecs },
      ], result: { kind: "output" as const, name: "events", type: rankingTypes.soundEvents } },
      { name: renderProducer.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "program", type: programType }], result: { kind: "output" as const, name: "track", type: compositionTypes.visualTrack } },
    ]),
    { name: rankingProducers.createSounds.name, inputs: [], result: { kind: "output" as const, name: "sounds", type: rankingTypes.sounds } },
    ...([
      rankingProducers.appendAppearSound,
      rankingProducers.appendMoveSound,
    ] as const).map((producer) => ({
      name: producer.name, inputs: [{ name: "sounds", type: rankingTypes.sounds }, { name: "media", type: mediaTypes.prepared }], result: { kind: "output" as const, name: "sounds", type: rankingTypes.sounds },
    })),
    { name: rankingProducers.renderAudio.name, inputs: [
      { name: "timeline", type: timelineTypes.timeline }, { name: "events", type: rankingTypes.soundEvents },
      { name: "style", type: rankingTypes.soundStyle }, { name: "sounds", type: rankingTypes.sounds },
    ], result: { kind: "output" as const, name: "track", type: compositionTypes.audioTrack } },
  ],
};

export const rankingDependency = rankingModuleRef;
