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
import { textDependency, textTypes } from "@narratage/text";

import { rankingImplementationDigests, rankingValidatorDigests } from "./schedule.js";

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
const registered = (digest: ReturnType<typeof digestOf>) => ({ digest });
const validator = (digest: ReturnType<typeof digestOf>) => ({ implementation: registered(digest) });

const programDefinitions = [
  ["tier", rankingTypes.tierProgram, rankingTypes.tierStyle, rankingTypes.tierItems, rankingProducers.tierProgram, rankingProducers.tierEvents, rankingProducers.renderTier, rankingImplementationDigests.tierProgram, rankingImplementationDigests.tierEvents, rankingImplementationDigests.renderTier],
  ["column", rankingTypes.columnProgram, rankingTypes.columnStyle, rankingTypes.columnItems, rankingProducers.columnProgram, rankingProducers.columnEvents, rankingProducers.renderColumn, rankingImplementationDigests.columnProgram, rankingImplementationDigests.columnEvents, rankingImplementationDigests.renderColumn],
  ["top-three", rankingTypes.topThreeProgram, rankingTypes.topThreeStyle, rankingTypes.topThreeItems, rankingProducers.topThreeProgram, rankingProducers.topThreeEvents, rankingProducers.renderTopThree, rankingImplementationDigests.topThreeProgram, rankingImplementationDigests.topThreeEvents, rankingImplementationDigests.renderTopThree],
  ["typewriter", rankingTypes.typewriterProgram, rankingTypes.typewriterStyle, rankingTypes.typewriterItems, rankingProducers.typewriterProgram, rankingProducers.typewriterEvents, rankingProducers.renderTypewriter, rankingImplementationDigests.typewriterProgram, rankingImplementationDigests.typewriterEvents, rankingImplementationDigests.renderTypewriter],
] as const;

export const rankingMarkupSurfaces = [
    { name: "tier-style", tag: "TierBoardStyle", mode: "structured", outputs: [rankingTypes.tierStyle, rankingTypes.soundStyle], implementation: { digest: rankingSurfaceImplementationDigests.tierStyle } },
    { name: "column-style", tag: "ColumnStyle", mode: "structured", outputs: [rankingTypes.columnStyle, rankingTypes.soundStyle], implementation: { digest: rankingSurfaceImplementationDigests.columnStyle } },
    { name: "top-three-style", tag: "TopThreeStyle", mode: "structured", outputs: [rankingTypes.topThreeStyle, rankingTypes.soundStyle], implementation: { digest: rankingSurfaceImplementationDigests.topThreeStyle } },
    { name: "typewriter-style", tag: "TypewriterListStyle", mode: "structured", outputs: [rankingTypes.typewriterStyle, rankingTypes.soundStyle], implementation: { digest: rankingSurfaceImplementationDigests.typewriterStyle } },
    { name: "tier", tag: "TierBoard", mode: "structured", outputs: [rankingTypes.header, rankingTypes.itemSpec, rankingTypes.schedule, rankingTypes.tierProgram, compositionTypes.visualTrack, compositionTypes.audioTrack], implementation: { digest: rankingSurfaceImplementationDigests.tier } },
    { name: "column", tag: "Column", mode: "structured", outputs: [rankingTypes.header, rankingTypes.itemSpec, rankingTypes.textItemShell, rankingTypes.schedule, rankingTypes.columnProgram, compositionTypes.visualTrack, compositionTypes.audioTrack], implementation: { digest: rankingSurfaceImplementationDigests.column } },
    { name: "top-three", tag: "TopThree", mode: "structured", outputs: [rankingTypes.header, rankingTypes.itemSpec, rankingTypes.textItemShell, rankingTypes.schedule, rankingTypes.topThreeProgram, compositionTypes.visualTrack, compositionTypes.audioTrack], implementation: { digest: rankingSurfaceImplementationDigests.topThree } },
    { name: "typewriter", tag: "TypewriterList", mode: "structured", outputs: [rankingTypes.header, rankingTypes.itemSpec, rankingTypes.textItemShell, textTypes.text, rankingTypes.schedule, rankingTypes.typewriterProgram, compositionTypes.visualTrack, compositionTypes.audioTrack], implementation: { digest: rankingSurfaceImplementationDigests.typewriter } },
  ] as const;


export const rankingManifest: ModuleManifest = {
  format: "svml.module@1", name: rankingModuleRef.name, version: rankingModuleRef.version,
  dependencies: [artifactDependency, mediaDependency, narrativeDependency, semanticMapDependency, programSpaceDependency, spatialDependency, temporalDependency, compositionDependency, textDependency],
  types: [
    { name: rankingTypes.header.name, schema: rankingHeaderSchema },
    { name: rankingTypes.itemSpec.name, schema: rankingItemSpecSchema },
    { name: rankingTypes.textItemShell.name, schema: rankingTextItemShellSchema },
    { name: rankingTypes.itemSpecs.name, schema: rankingItemSpecSetSchema },
    { name: rankingTypes.schedule.name, schema: rankingScheduleSchema, validator: validator(rankingValidatorDigests.schedule) },
    { name: rankingTypes.soundStyle.name, schema: rankingSoundStyleSchema },
    { name: rankingTypes.soundEvents.name, schema: rankingSoundEventsSchema, validator: validator(rankingValidatorDigests.events) },
    { name: rankingTypes.sounds.name, schema: rankingSoundSetSchema },
    { name: rankingTypes.tierStyle.name, schema: styleSchema() },
    { name: rankingTypes.columnStyle.name, schema: styleSchema() },
    { name: rankingTypes.topThreeStyle.name, schema: styleSchema() },
    { name: rankingTypes.typewriterStyle.name, schema: styleSchema() },
    { name: rankingTypes.tierItems.name, schema: setSchema() },
    { name: rankingTypes.columnItems.name, schema: setSchema() },
    { name: rankingTypes.topThreeItems.name, schema: setSchema() },
    { name: rankingTypes.typewriterItems.name, schema: setSchema() },
    { name: rankingTypes.tierProgram.name, schema: programSchema(), validator: validator(rankingValidatorDigests.tierProgram) },
    { name: rankingTypes.columnProgram.name, schema: programSchema(), validator: validator(rankingValidatorDigests.columnProgram) },
    { name: rankingTypes.topThreeProgram.name, schema: programSchema(), validator: validator(rankingValidatorDigests.topThreeProgram) },
    { name: rankingTypes.typewriterProgram.name, schema: programSchema(), validator: validator(rankingValidatorDigests.typewriterProgram) },
  ],
  capabilities: [],
  producers: [
    { name: rankingProducers.materializeTextItem.name, inputs: [{ name: "shell", type: rankingTypes.textItemShell }, { name: "content", type: textTypes.text }], outputs: [{ name: "spec", type: rankingTypes.itemSpec }], needs: [], implementation: registered(rankingImplementationDigests.materializeTextItem) },
    { name: rankingProducers.createSpecs.name, inputs: [{ name: "header", type: rankingTypes.header }], outputs: [{ name: "set", type: rankingTypes.itemSpecs }], needs: [], implementation: registered(rankingImplementationDigests.createSpecs) },
    { name: rankingProducers.appendSpec.name, inputs: [{ name: "set", type: rankingTypes.itemSpecs }, { name: "spec", type: rankingTypes.itemSpec }], outputs: [{ name: "set", type: rankingTypes.itemSpecs }], needs: [], implementation: registered(rankingImplementationDigests.appendSpec) },
    { name: rankingProducers.schedule.name, inputs: [
      { name: "header", type: rankingTypes.header }, { name: "items", type: rankingTypes.itemSpecs },
      { name: "map", type: semanticMapTypes.complete }, { name: "space", type: programSpaceTypes.programSpace },
      { name: "outer", type: narrativeTypes.selection }, { name: "triggers", type: narrativeTypes.moment }, { name: "terminal", type: narrativeTypes.moment },
    ], outputs: [{ name: "schedule", type: rankingTypes.schedule }], needs: [], implementation: registered(rankingImplementationDigests.schedule) },
    ...([
      [rankingProducers.createTierItems, rankingTypes.tierItems, rankingImplementationDigests.createTierItems],
      [rankingProducers.createColumnItems, rankingTypes.columnItems, rankingImplementationDigests.createColumnItems],
      [rankingProducers.createTopThreeItems, rankingTypes.topThreeItems, rankingImplementationDigests.createTopThreeItems],
      [rankingProducers.createTypewriterItems, rankingTypes.typewriterItems, rankingImplementationDigests.createTypewriterItems],
    ] as const).map(([producer, type, implementationDigest]) => ({
      name: producer.name, inputs: [], outputs: [{ name: "set", type }], needs: [], implementation: registered(implementationDigest),
    })),
    { name: rankingProducers.appendTierItem.name, inputs: [{ name: "set", type: rankingTypes.tierItems }, { name: "spec", type: rankingTypes.itemSpec }, { name: "icon", type: mediaTypes.blobArtifact }], outputs: [{ name: "set", type: rankingTypes.tierItems }], needs: [], implementation: registered(rankingImplementationDigests.appendTierItem) },
    ...([
      [rankingProducers.appendColumnItem, rankingTypes.columnItems, rankingImplementationDigests.appendColumnItem],
      [rankingProducers.appendTopThreeItem, rankingTypes.topThreeItems, rankingImplementationDigests.appendTopThreeItem],
    ] as const).map(([producer, type, implementationDigest]) => ({
      name: producer.name, inputs: [{ name: "set", type }, { name: "spec", type: rankingTypes.itemSpec }], outputs: [{ name: "set", type }], needs: [], implementation: registered(implementationDigest),
    })),
    ...([
      [rankingProducers.appendColumnIconItem, rankingTypes.columnItems, rankingImplementationDigests.appendColumnIconItem],
      [rankingProducers.appendTopThreeIconItem, rankingTypes.topThreeItems, rankingImplementationDigests.appendTopThreeIconItem],
    ] as const).map(([producer, type, implementationDigest]) => ({
      name: producer.name, inputs: [{ name: "set", type }, { name: "spec", type: rankingTypes.itemSpec }, { name: "icon", type: mediaTypes.blobArtifact }], outputs: [{ name: "set", type }], needs: [], implementation: registered(implementationDigest),
    })),
    { name: rankingProducers.appendTypewriterItem.name, inputs: [{ name: "set", type: rankingTypes.typewriterItems }, { name: "spec", type: rankingTypes.itemSpec }], outputs: [{ name: "set", type: rankingTypes.typewriterItems }], needs: [], implementation: registered(rankingImplementationDigests.appendTypewriterItem) },
    ...programDefinitions.flatMap(([name, programType, styleType, setType, programProducer, eventProducer, renderProducer, programDigest, eventDigest, renderDigest]) => [
      { name: programProducer.name, inputs: [
        { name: "header", type: rankingTypes.header },
        ...(name === "typewriter" ? [{ name: "title", type: textTypes.text }] : []),
        { name: "frame", type: spatialTypes.frame }, { name: "schedule", type: rankingTypes.schedule },
        { name: "style", type: styleType }, { name: "set", type: setType },
      ], outputs: [{ name: "program", type: programType }], needs: [], implementation: registered(programDigest) },
      { name: eventProducer.name, inputs: [
        { name: "schedule", type: rankingTypes.schedule }, { name: "style", type: styleType }, { name: "specs", type: rankingTypes.itemSpecs },
      ], outputs: [{ name: "events", type: rankingTypes.soundEvents }], needs: [], implementation: registered(eventDigest) },
      { name: renderProducer.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: programType }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [], implementation: registered(renderDigest) },
    ]),
    { name: rankingProducers.createSounds.name, inputs: [], outputs: [{ name: "sounds", type: rankingTypes.sounds }], needs: [], implementation: registered(rankingImplementationDigests.createSounds) },
    ...([
      [rankingProducers.appendAppearSound, rankingImplementationDigests.appendAppearSound],
      [rankingProducers.appendMoveSound, rankingImplementationDigests.appendMoveSound],
    ] as const).map(([producer, implementationDigest]) => ({
      name: producer.name, inputs: [{ name: "sounds", type: rankingTypes.sounds }, { name: "media", type: mediaTypes.synchronized }], outputs: [{ name: "sounds", type: rankingTypes.sounds }], needs: [], implementation: registered(implementationDigest),
    })),
    { name: rankingProducers.renderAudio.name, inputs: [
      { name: "space", type: programSpaceTypes.programSpace }, { name: "events", type: rankingTypes.soundEvents },
      { name: "style", type: rankingTypes.soundStyle }, { name: "sounds", type: rankingTypes.sounds },
    ], outputs: [{ name: "track", type: compositionTypes.audioTrack }], needs: [], implementation: registered(rankingImplementationDigests.renderAudio) },
  ],
};

export const rankingManifestDigest = digestOf(rankingManifest);
export const rankingDependency = { module: rankingModuleRef, digest: rankingManifestDigest } as const;
