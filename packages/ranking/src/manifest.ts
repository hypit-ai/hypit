import { artifactDependency } from "@narratage/artifact";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import { mediaDependency, mediaTypes } from "@narratage/media";
import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import { spatialDependency, spatialFrameSchema, spatialTypes } from "@narratage/spatial";
import { temporalDependency } from "@narratage/temporal";

import { rankingImplementationDigests, rankingValidatorDigests } from "./schedule.js";

export const rankingModuleRef = { name: "@narratage/ranking", version: "0.0.0-dev" } as const;
export const rankingTypes = {
  header: { module: rankingModuleRef, name: "RankingHeader" },
  itemSpec: { module: rankingModuleRef, name: "RankingItemSpec" },
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
  title: { module: rankingModuleRef, name: "RankingTitle" },
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
  contract: { schema: { kind: "literal", value: "svml.ranking-header@1" } }, id: { schema: string }, variant: { schema: variants },
});
export const rankingItemSpecSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ contract: { schema: { kind: "literal", value: "svml.tier-board-item-spec@1" } }, variant: { schema: { kind: "literal", value: "tier-board" } }, ...itemBase, tier: { schema: string }, entry: { schema: { kind: "string", enum: ["direct", "stage"] } } }),
  object({ contract: { schema: { kind: "literal", value: "svml.column-item-spec@1" } }, variant: { schema: { kind: "literal", value: "column" } }, ...itemBase, label: { schema: string } }),
  object({ contract: { schema: { kind: "literal", value: "svml.top-three-item-spec@1" } }, variant: { schema: { kind: "literal", value: "top-three" } }, ...itemBase, label: { schema: string } }),
  object({ contract: { schema: { kind: "literal", value: "svml.typewriter-item-spec@1" } }, variant: { schema: { kind: "literal", value: "typewriter-list" } }, ...itemBase,
    text: { schema: string }, winner: { schema: { kind: "boolean" } },
    emphasis: { optional: true, schema: object({ start: { schema: unsigned }, endExclusive: { schema: unsigned } }) },
  }),
] };
export const rankingItemSpecSetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.ranking-item-spec-set@1" } },
  variant: { schema: variants }, items: { schema: { kind: "array", items: rankingItemSpecSchema } },
});
const frameSpan = object({ startFrame: { schema: unsigned }, endFrameExclusive: { schema: unsigned } });
export const rankingScheduleSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.ranking-schedule@1" } }, id: { schema: string },
  variant: { schema: variants }, outer: { schema: frameSpan }, terminalFrame: { schema: unsigned },
  entries: { schema: { kind: "array", minItems: 1, items: object({
    itemId: { schema: string }, triggerOccurrenceId: { schema: string }, triggerFrame: { schema: unsigned },
    stage: { schema: frameSpan }, cumulative: { schema: frameSpan }, settled: { schema: frameSpan },
  }) } },
});
const styleSchema = (contract: string): ValueSchema => object({ contract: { schema: { kind: "literal", value: contract } } }, true);
const setSchema = (contract: string): ValueSchema => object({
  contract: { schema: { kind: "literal", value: contract } }, items: { schema: { kind: "array", items: object({}, true) } },
});
const programSchema = (contract: string): ValueSchema => object({
  contract: { schema: { kind: "literal", value: contract } }, id: { schema: string }, frame: { schema: spatialFrameSchema },
  schedule: { schema: rankingScheduleSchema }, style: { schema: object({}, true) }, items: { schema: { kind: "array", minItems: 1, items: object({}, true) } },
}, true);
export const rankingSoundStyleSchema = styleSchema("svml.ranking-sound-style@1");
export const rankingSoundEventsSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.ranking-sound-event-plan@1" } }, id: { schema: string }, variant: { schema: variants },
  events: { schema: { kind: "array", items: object({ id: { schema: string }, itemId: { schema: string }, kind: { schema: { kind: "string", enum: ["appear", "move"] } }, frame: { schema: unsigned } }) } },
});
export const rankingSoundSetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.ranking-sound-set@1" } },
  appear: { schema: object({}, true), optional: true }, move: { schema: object({}, true), optional: true },
});
export const rankingTitleSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.ranking-title@1" } }, value: { schema: string },
});

export const rankingSurfaceImplementationDigests = {
  tierStyle: digestOf("@narratage/ranking/tier-board-style-surface@1"),
  columnStyle: digestOf("@narratage/ranking/column-style-surface@1"),
  topThreeStyle: digestOf("@narratage/ranking/top-three-style-surface@1"),
  typewriterStyle: digestOf("@narratage/ranking/typewriter-list-style-surface@1"),
  tier: digestOf("@narratage/ranking/tier-board-surface@1"),
  column: digestOf("@narratage/ranking/column-surface@1"),
  topThree: digestOf("@narratage/ranking/top-three-surface@1"),
  typewriter: digestOf("@narratage/ranking/typewriter-list-surface@1"),
} as const;
const registered = (locator: string, digest: ReturnType<typeof digestOf>) => ({ kind: "registered" as const, locator, digest });
const validator = (locator: string, digest: ReturnType<typeof digestOf>) => ({ abi: "svml.type-validator@1" as const, implementation: registered(locator, digest) });

const programDefinitions = [
  ["tier", rankingTypes.tierProgram, rankingTypes.tierStyle, rankingTypes.tierItems, rankingProducers.tierProgram, rankingProducers.tierEvents, rankingProducers.renderTier, rankingImplementationDigests.tierProgram, rankingImplementationDigests.tierEvents, rankingImplementationDigests.renderTier],
  ["column", rankingTypes.columnProgram, rankingTypes.columnStyle, rankingTypes.columnItems, rankingProducers.columnProgram, rankingProducers.columnEvents, rankingProducers.renderColumn, rankingImplementationDigests.columnProgram, rankingImplementationDigests.columnEvents, rankingImplementationDigests.renderColumn],
  ["top-three", rankingTypes.topThreeProgram, rankingTypes.topThreeStyle, rankingTypes.topThreeItems, rankingProducers.topThreeProgram, rankingProducers.topThreeEvents, rankingProducers.renderTopThree, rankingImplementationDigests.topThreeProgram, rankingImplementationDigests.topThreeEvents, rankingImplementationDigests.renderTopThree],
  ["typewriter", rankingTypes.typewriterProgram, rankingTypes.typewriterStyle, rankingTypes.typewriterItems, rankingProducers.typewriterProgram, rankingProducers.typewriterEvents, rankingProducers.renderTypewriter, rankingImplementationDigests.typewriterProgram, rankingImplementationDigests.typewriterEvents, rankingImplementationDigests.renderTypewriter],
] as const;

export const rankingManifest: ModuleManifest = {
  format: "svml.module@1", name: rankingModuleRef.name, version: rankingModuleRef.version,
  dependencies: [artifactDependency, mediaDependency, narrativeDependency, semanticMapDependency, programSpaceDependency, spatialDependency, temporalDependency, compositionDependency],
  types: [
    { name: rankingTypes.header.name, schema: rankingHeaderSchema },
    { name: rankingTypes.itemSpec.name, schema: rankingItemSpecSchema },
    { name: rankingTypes.itemSpecs.name, schema: rankingItemSpecSetSchema },
    { name: rankingTypes.schedule.name, schema: rankingScheduleSchema, validator: validator("@narratage/ranking/validate-schedule", rankingValidatorDigests.schedule) },
    { name: rankingTypes.soundStyle.name, schema: rankingSoundStyleSchema },
    { name: rankingTypes.soundEvents.name, schema: rankingSoundEventsSchema, validator: validator("@narratage/ranking/validate-sound-events", rankingValidatorDigests.events) },
    { name: rankingTypes.sounds.name, schema: rankingSoundSetSchema },
    { name: rankingTypes.tierStyle.name, schema: styleSchema("svml.tier-board-style@1") },
    { name: rankingTypes.columnStyle.name, schema: styleSchema("svml.column-style@1") },
    { name: rankingTypes.topThreeStyle.name, schema: styleSchema("svml.top-three-style@1") },
    { name: rankingTypes.typewriterStyle.name, schema: styleSchema("svml.typewriter-list-style@1") },
    { name: rankingTypes.tierItems.name, schema: setSchema("svml.tier-board-item-set@1") },
    { name: rankingTypes.columnItems.name, schema: setSchema("svml.column-item-set@1") },
    { name: rankingTypes.topThreeItems.name, schema: setSchema("svml.top-three-item-set@1") },
    { name: rankingTypes.typewriterItems.name, schema: setSchema("svml.typewriter-item-set@1") },
    { name: rankingTypes.tierProgram.name, schema: programSchema("svml.tier-board-program@1"), validator: validator("@narratage/ranking/validate-tier-board-program", rankingValidatorDigests.tierProgram) },
    { name: rankingTypes.columnProgram.name, schema: programSchema("svml.column-program@1"), validator: validator("@narratage/ranking/validate-column-program", rankingValidatorDigests.columnProgram) },
    { name: rankingTypes.topThreeProgram.name, schema: programSchema("svml.top-three-program@1"), validator: validator("@narratage/ranking/validate-top-three-program", rankingValidatorDigests.topThreeProgram) },
    { name: rankingTypes.typewriterProgram.name, schema: programSchema("svml.typewriter-list-program@1"), validator: validator("@narratage/ranking/validate-typewriter-list-program", rankingValidatorDigests.typewriterProgram) },
    { name: rankingTypes.title.name, schema: rankingTitleSchema },
  ],
  capabilities: [],
  surfaces: [
    { name: "tier-style", tag: "TierBoardStyle", mode: "structured", outputs: [rankingTypes.tierStyle, rankingTypes.soundStyle], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/ranking/tier-board-style-surface", digest: rankingSurfaceImplementationDigests.tierStyle } },
    { name: "column-style", tag: "ColumnStyle", mode: "structured", outputs: [rankingTypes.columnStyle, rankingTypes.soundStyle], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/ranking/column-style-surface", digest: rankingSurfaceImplementationDigests.columnStyle } },
    { name: "top-three-style", tag: "TopThreeStyle", mode: "structured", outputs: [rankingTypes.topThreeStyle, rankingTypes.soundStyle], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/ranking/top-three-style-surface", digest: rankingSurfaceImplementationDigests.topThreeStyle } },
    { name: "typewriter-style", tag: "TypewriterListStyle", mode: "structured", outputs: [rankingTypes.typewriterStyle, rankingTypes.soundStyle], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/ranking/typewriter-list-style-surface", digest: rankingSurfaceImplementationDigests.typewriterStyle } },
    { name: "tier", tag: "TierBoard", mode: "structured", outputs: [rankingTypes.schedule, rankingTypes.tierProgram, compositionTypes.visualTrack, compositionTypes.audioTrack], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/ranking/tier-board-surface", digest: rankingSurfaceImplementationDigests.tier } },
    { name: "column", tag: "Column", mode: "structured", outputs: [rankingTypes.schedule, rankingTypes.columnProgram, compositionTypes.visualTrack, compositionTypes.audioTrack], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/ranking/column-surface", digest: rankingSurfaceImplementationDigests.column } },
    { name: "top-three", tag: "TopThree", mode: "structured", outputs: [rankingTypes.schedule, rankingTypes.topThreeProgram, compositionTypes.visualTrack, compositionTypes.audioTrack], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/ranking/top-three-surface", digest: rankingSurfaceImplementationDigests.topThree } },
    { name: "typewriter", tag: "TypewriterList", mode: "structured", outputs: [rankingTypes.schedule, rankingTypes.typewriterProgram, compositionTypes.visualTrack, compositionTypes.audioTrack], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/ranking/typewriter-list-surface", digest: rankingSurfaceImplementationDigests.typewriter } },
  ],
  producers: [
    { name: rankingProducers.createSpecs.name, inputs: [{ name: "header", type: rankingTypes.header }], outputs: [{ name: "set", type: rankingTypes.itemSpecs }], needs: [], implementation: registered("@narratage/ranking/create-item-specs", rankingImplementationDigests.createSpecs) },
    { name: rankingProducers.appendSpec.name, inputs: [{ name: "set", type: rankingTypes.itemSpecs }, { name: "spec", type: rankingTypes.itemSpec }], outputs: [{ name: "set", type: rankingTypes.itemSpecs }], needs: [], implementation: registered("@narratage/ranking/append-item-spec", rankingImplementationDigests.appendSpec) },
    { name: rankingProducers.schedule.name, inputs: [
      { name: "header", type: rankingTypes.header }, { name: "items", type: rankingTypes.itemSpecs },
      { name: "map", type: semanticMapTypes.complete }, { name: "space", type: programSpaceTypes.programSpace },
      { name: "outer", type: narrativeTypes.selection }, { name: "triggers", type: narrativeTypes.moment }, { name: "terminal", type: narrativeTypes.moment },
    ], outputs: [{ name: "schedule", type: rankingTypes.schedule }], needs: [], implementation: registered("@narratage/ranking/build-schedule", rankingImplementationDigests.schedule) },
    ...([
      [rankingProducers.createTierItems, rankingTypes.tierItems, rankingImplementationDigests.createTierItems, "@narratage/ranking/create-tier-items"],
      [rankingProducers.createColumnItems, rankingTypes.columnItems, rankingImplementationDigests.createColumnItems, "@narratage/ranking/create-column-items"],
      [rankingProducers.createTopThreeItems, rankingTypes.topThreeItems, rankingImplementationDigests.createTopThreeItems, "@narratage/ranking/create-top-three-items"],
      [rankingProducers.createTypewriterItems, rankingTypes.typewriterItems, rankingImplementationDigests.createTypewriterItems, "@narratage/ranking/create-typewriter-items"],
    ] as const).map(([producer, type, implementationDigest, locator]) => ({
      name: producer.name, inputs: [], outputs: [{ name: "set", type }], needs: [], implementation: registered(locator, implementationDigest),
    })),
    { name: rankingProducers.appendTierItem.name, inputs: [{ name: "set", type: rankingTypes.tierItems }, { name: "spec", type: rankingTypes.itemSpec }, { name: "icon", type: mediaTypes.blobArtifact }], outputs: [{ name: "set", type: rankingTypes.tierItems }], needs: [], implementation: registered("@narratage/ranking/append-tier-item", rankingImplementationDigests.appendTierItem) },
    ...([
      [rankingProducers.appendColumnItem, rankingTypes.columnItems, rankingImplementationDigests.appendColumnItem, "@narratage/ranking/append-column-item"],
      [rankingProducers.appendTopThreeItem, rankingTypes.topThreeItems, rankingImplementationDigests.appendTopThreeItem, "@narratage/ranking/append-top-three-item"],
    ] as const).map(([producer, type, implementationDigest, locator]) => ({
      name: producer.name, inputs: [{ name: "set", type }, { name: "spec", type: rankingTypes.itemSpec }], outputs: [{ name: "set", type }], needs: [], implementation: registered(locator, implementationDigest),
    })),
    ...([
      [rankingProducers.appendColumnIconItem, rankingTypes.columnItems, rankingImplementationDigests.appendColumnIconItem, "@narratage/ranking/append-column-icon-item"],
      [rankingProducers.appendTopThreeIconItem, rankingTypes.topThreeItems, rankingImplementationDigests.appendTopThreeIconItem, "@narratage/ranking/append-top-three-icon-item"],
    ] as const).map(([producer, type, implementationDigest, locator]) => ({
      name: producer.name, inputs: [{ name: "set", type }, { name: "spec", type: rankingTypes.itemSpec }, { name: "icon", type: mediaTypes.blobArtifact }], outputs: [{ name: "set", type }], needs: [], implementation: registered(locator, implementationDigest),
    })),
    { name: rankingProducers.appendTypewriterItem.name, inputs: [{ name: "set", type: rankingTypes.typewriterItems }, { name: "spec", type: rankingTypes.itemSpec }], outputs: [{ name: "set", type: rankingTypes.typewriterItems }], needs: [], implementation: registered("@narratage/ranking/append-typewriter-item", rankingImplementationDigests.appendTypewriterItem) },
    ...programDefinitions.flatMap(([name, programType, styleType, setType, programProducer, eventProducer, renderProducer, programDigest, eventDigest, renderDigest]) => [
      { name: programProducer.name, inputs: [
        { name: "header", type: rankingTypes.header },
        ...(name === "typewriter" ? [{ name: "title", type: rankingTypes.title }] : []),
        { name: "frame", type: spatialTypes.frame }, { name: "schedule", type: rankingTypes.schedule },
        { name: "style", type: styleType }, { name: "set", type: setType },
      ], outputs: [{ name: "program", type: programType }], needs: [], implementation: registered(`@narratage/ranking/build-${name}-program`, programDigest) },
      { name: eventProducer.name, inputs: [
        { name: "schedule", type: rankingTypes.schedule }, { name: "style", type: styleType }, { name: "specs", type: rankingTypes.itemSpecs },
      ], outputs: [{ name: "events", type: rankingTypes.soundEvents }], needs: [], implementation: registered(`@narratage/ranking/build-${name}-events`, eventDigest) },
      { name: renderProducer.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: programType }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [], implementation: registered(`@narratage/ranking/render-${name}`, renderDigest) },
    ]),
    { name: rankingProducers.createSounds.name, inputs: [], outputs: [{ name: "sounds", type: rankingTypes.sounds }], needs: [], implementation: registered("@narratage/ranking/create-sounds", rankingImplementationDigests.createSounds) },
    ...([
      [rankingProducers.appendAppearSound, rankingImplementationDigests.appendAppearSound, "@narratage/ranking/append-appear-sound"],
      [rankingProducers.appendMoveSound, rankingImplementationDigests.appendMoveSound, "@narratage/ranking/append-move-sound"],
    ] as const).map(([producer, implementationDigest, locator]) => ({
      name: producer.name, inputs: [{ name: "sounds", type: rankingTypes.sounds }, { name: "media", type: mediaTypes.synchronized }], outputs: [{ name: "sounds", type: rankingTypes.sounds }], needs: [], implementation: registered(locator, implementationDigest),
    })),
    { name: rankingProducers.renderAudio.name, inputs: [
      { name: "space", type: programSpaceTypes.programSpace }, { name: "events", type: rankingTypes.soundEvents },
      { name: "style", type: rankingTypes.soundStyle }, { name: "sounds", type: rankingTypes.sounds },
    ], outputs: [{ name: "track", type: compositionTypes.audioTrack }], needs: [], implementation: registered("@narratage/ranking/render-audio", rankingImplementationDigests.renderAudio) },
  ],
};

export const rankingManifestDigest = digestOf(rankingManifest);
export const rankingDependency = { module: rankingModuleRef, digest: rankingManifestDigest } as const;
