import type { ComponentPackage, ProducerHandlerContext } from "@narratage/component-kit";
import type { SynchronizedMedia } from "@narratage/media";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import { canonicalize } from "@narratage/protocol";
import type { BlobRef, StoredValue } from "@narratage/protocol";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import type { SpatialFrame } from "@narratage/spatial";
import type { Text } from "@narratage/text";

import { rankingProducers, rankingTypes } from "./manifest.js";
import {
  appendColumnItem,
  appendRankingItemSpec,
  appendRankingSound,
  appendTierBoardItem,
  appendTopThreeItem,
  appendTypewriterItem,
  assertColumnProgram,
  assertRankingSchedule,
  assertRankingSoundEventPlan,
  assertTierBoardProgram,
  assertTopThreeProgram,
  assertTypewriterListProgram,
  buildColumnProgram,
  buildColumnSoundEvents,
  buildRankingSchedule,
  buildTierBoardProgram,
  buildTierBoardSoundEvents,
  buildTopThreeProgram,
  buildTopThreeSoundEvents,
  buildTypewriterListProgram,
  buildTypewriterSoundEvents,
  createColumnItemSet,
  createRankingItemSpecSet,
  createRankingSoundSet,
  createTierBoardItemSet,
  createTopThreeItemSet,
  createTypewriterItemSet,
  rankingImplementationDigests,
  rankingValidatorDigests,
  materializeRankingTextItem,
} from "./schedule.js";
import {
  renderColumn,
  renderRankingAudio,
  renderTierBoard,
  renderTopThree,
  renderTypewriterList,
} from "./render.js";
import type {
  ColumnItemSet,
  ColumnItemSpec,
  ColumnProgram,
  ColumnStyle,
  RankingHeader,
  RankingItemSpec,
  RankingItemSpecSet,
  RankingTextItemShell,
  RankingSchedule,
  RankingSoundEventPlan,
  RankingSoundSet,
  RankingSoundStyle,
  TierBoardItemSet,
  TierBoardItemSpec,
  TierBoardProgram,
  TierBoardStyle,
  TopThreeItemSet,
  TopThreeItemSpec,
  TopThreeProgram,
  TopThreeStyle,
  TypewriterItemSet,
  TypewriterItemSpec,
  TypewriterListProgram,
  TypewriterListStyle,
} from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}

/**
 * An icon arrives as an Artifact Blob, whose Type stores the reference itself
 * rather than wrapping it, so it is read as a blob rather than as inline.
 */
function blob(value: StoredValue | undefined, label: string): BlobRef {
  if (value?.kind !== "blob") throw new Error(`${label} must be a blob Artifact.`);
  return value;
}

const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

function programInputs(inputs: ProducerHandlerContext["inputs"]) {
  return {
    header: inline<RankingHeader>(inputs.header?.value, "RankingHeader"),
    frame: inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
    schedule: inline<RankingSchedule>(inputs.schedule?.value, "RankingSchedule"),
  };
}

export const rankingComponent = {
  name: "@narratage/ranking",
  producers: [
    {
      producer: rankingProducers.materializeTextItem,
      implementationDigest: rankingImplementationDigests.materializeTextItem,
      handler: ({ inputs }) => ({ outputs: { spec: output(materializeRankingTextItem(
        inline<RankingTextItemShell>(inputs.shell?.value, "RankingTextItemShell"),
        inline<Text>(inputs.content?.value, "Text"),
      )) }, needs: {} }),
    },
    {
      producer: rankingProducers.createSpecs,
      implementationDigest: rankingImplementationDigests.createSpecs,
      handler: ({ inputs }) => ({ outputs: { set: output(createRankingItemSpecSet(inline(inputs.header?.value, "RankingHeader"))) }, needs: {} }),
    },
    {
      producer: rankingProducers.appendSpec,
      implementationDigest: rankingImplementationDigests.appendSpec,
      handler: ({ inputs }) => ({ outputs: { set: output(appendRankingItemSpec(
        inline(inputs.set?.value, "RankingItemSpecSet"), inline(inputs.spec?.value, "RankingItemSpec"),
      )) }, needs: {} }),
    },
    {
      producer: rankingProducers.schedule,
      implementationDigest: rankingImplementationDigests.schedule,
      handler: ({ inputs }) => ({ outputs: { schedule: output(buildRankingSchedule({
        header: inline(inputs.header?.value, "RankingHeader"), items: inline(inputs.items?.value, "RankingItemSpecSet"),
        map: inline(inputs.map?.value, "CompleteSemanticMap"), space: inline(inputs.space?.value, "ProgramSpace"),
        outer: inline(inputs.outer?.value, "NarrativeSelectionRef"), triggers: inline(inputs.triggers?.value, "NarrativeMomentRef"),
        terminal: inline(inputs.terminal?.value, "NarrativeMomentRef"),
      })) }, needs: {} }),
    },
    ...([
      [rankingProducers.createTierItems, rankingImplementationDigests.createTierItems, createTierBoardItemSet],
      [rankingProducers.createColumnItems, rankingImplementationDigests.createColumnItems, createColumnItemSet],
      [rankingProducers.createTopThreeItems, rankingImplementationDigests.createTopThreeItems, createTopThreeItemSet],
      [rankingProducers.createTypewriterItems, rankingImplementationDigests.createTypewriterItems, createTypewriterItemSet],
    ] as const).map(([producer, implementationDigest, create]) => ({
      producer, implementationDigest,
      handler: () => ({ outputs: { set: output(create()) }, needs: {} }),
    })),
    {
      producer: rankingProducers.appendTierItem,
      implementationDigest: rankingImplementationDigests.appendTierItem,
      handler: ({ inputs }) => ({ outputs: { set: output(appendTierBoardItem(
        inline<TierBoardItemSet>(inputs.set?.value, "TierBoardItemSet"),
        inline<TierBoardItemSpec>(inputs.spec?.value, "TierBoardItemSpec"),
        blob(inputs.icon?.value, "TierBoard icon"),
      )) }, needs: {} }),
    },
    ...([
      [rankingProducers.appendColumnItem, rankingImplementationDigests.appendColumnItem, false],
      [rankingProducers.appendColumnIconItem, rankingImplementationDigests.appendColumnIconItem, true],
    ] as const).map(([producer, implementationDigest, hasIcon]) => ({
      producer, implementationDigest,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { set: output(appendColumnItem(
        inline<ColumnItemSet>(inputs.set?.value, "ColumnItemSet"),
        inline<ColumnItemSpec>(inputs.spec?.value, "ColumnItemSpec"),
        ...(hasIcon ? [blob(inputs.icon?.value, "Column icon")] : []),
      )) }, needs: {} }),
    })),
    ...([
      [rankingProducers.appendTopThreeItem, rankingImplementationDigests.appendTopThreeItem, false],
      [rankingProducers.appendTopThreeIconItem, rankingImplementationDigests.appendTopThreeIconItem, true],
    ] as const).map(([producer, implementationDigest, hasIcon]) => ({
      producer, implementationDigest,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { set: output(appendTopThreeItem(
        inline<TopThreeItemSet>(inputs.set?.value, "TopThreeItemSet"),
        inline<TopThreeItemSpec>(inputs.spec?.value, "TopThreeItemSpec"),
        ...(hasIcon ? [blob(inputs.icon?.value, "TopThree icon")] : []),
      )) }, needs: {} }),
    })),
    {
      producer: rankingProducers.appendTypewriterItem,
      implementationDigest: rankingImplementationDigests.appendTypewriterItem,
      handler: ({ inputs }) => ({ outputs: { set: output(appendTypewriterItem(
        inline<TypewriterItemSet>(inputs.set?.value, "TypewriterItemSet"),
        inline<TypewriterItemSpec>(inputs.spec?.value, "TypewriterItemSpec"),
      )) }, needs: {} }),
    },
    {
      producer: rankingProducers.tierProgram,
      implementationDigest: rankingImplementationDigests.tierProgram,
      handler: ({ inputs }) => {
        const common = programInputs(inputs);
        return { outputs: { program: output(buildTierBoardProgram(common.header, common.frame, common.schedule,
          inline<TierBoardStyle>(inputs.style?.value, "TierBoardStyle"), inline<TierBoardItemSet>(inputs.set?.value, "TierBoardItemSet"))) }, needs: {} };
      },
    },
    {
      producer: rankingProducers.columnProgram,
      implementationDigest: rankingImplementationDigests.columnProgram,
      handler: ({ inputs }) => {
        const common = programInputs(inputs);
        return { outputs: { program: output(buildColumnProgram(common.header, common.frame, common.schedule,
          inline<ColumnStyle>(inputs.style?.value, "ColumnStyle"), inline<ColumnItemSet>(inputs.set?.value, "ColumnItemSet"))) }, needs: {} };
      },
    },
    {
      producer: rankingProducers.topThreeProgram,
      implementationDigest: rankingImplementationDigests.topThreeProgram,
      handler: ({ inputs }) => {
        const common = programInputs(inputs);
        return { outputs: { program: output(buildTopThreeProgram(common.header, common.frame, common.schedule,
          inline<TopThreeStyle>(inputs.style?.value, "TopThreeStyle"), inline<TopThreeItemSet>(inputs.set?.value, "TopThreeItemSet"))) }, needs: {} };
      },
    },
    {
      producer: rankingProducers.typewriterProgram,
      implementationDigest: rankingImplementationDigests.typewriterProgram,
      handler: ({ inputs }) => {
        const common = programInputs(inputs);
        const title = inline<Text>(inputs.title?.value, "Text");
        return { outputs: { program: output(buildTypewriterListProgram(common.header, title.value, common.frame, common.schedule,
          inline<TypewriterListStyle>(inputs.style?.value, "TypewriterListStyle"), inline<TypewriterItemSet>(inputs.set?.value, "TypewriterItemSet"))) }, needs: {} };
      },
    },
    ...([
      [rankingProducers.tierEvents, rankingImplementationDigests.tierEvents, buildTierBoardSoundEvents, "TierBoardStyle"],
      [rankingProducers.columnEvents, rankingImplementationDigests.columnEvents, buildColumnSoundEvents, "ColumnStyle"],
      [rankingProducers.topThreeEvents, rankingImplementationDigests.topThreeEvents, buildTopThreeSoundEvents, "TopThreeStyle"],
      [rankingProducers.typewriterEvents, rankingImplementationDigests.typewriterEvents, buildTypewriterSoundEvents, "TypewriterListStyle"],
    ] as const).map(([producer, implementationDigest, build, styleLabel]) => ({
      producer, implementationDigest,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { events: output(build(
        inline(inputs.schedule?.value, "RankingSchedule"),
        inline(inputs.style?.value, styleLabel) as never,
        inline(inputs.specs?.value, "RankingItemSpecSet"),
      )) }, needs: {} }),
    })),
    {
      producer: rankingProducers.createSounds,
      implementationDigest: rankingImplementationDigests.createSounds,
      handler: () => ({ outputs: { sounds: output(createRankingSoundSet()) }, needs: {} }),
    },
    ...([
      [rankingProducers.appendAppearSound, rankingImplementationDigests.appendAppearSound, "appear"],
      [rankingProducers.appendMoveSound, rankingImplementationDigests.appendMoveSound, "move"],
    ] as const).map(([producer, implementationDigest, kind]) => ({
      producer, implementationDigest,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { sounds: output(appendRankingSound(
        inline<RankingSoundSet>(inputs.sounds?.value, "RankingSoundSet"), kind,
        inline<SynchronizedMedia>(inputs.media?.value, `Ranking ${kind} sound`),
      )) }, needs: {} }),
    })),
    {
      producer: rankingProducers.renderAudio,
      implementationDigest: rankingImplementationDigests.renderAudio,
      handler: ({ inputs }) => ({ outputs: { track: output(renderRankingAudio(
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<RankingSoundEventPlan>(inputs.events?.value, "RankingSoundEventPlan"),
        inline<RankingSoundStyle>(inputs.style?.value, "RankingSoundStyle"),
        inline<RankingSoundSet>(inputs.sounds?.value, "RankingSoundSet"),
      )) }, needs: {} }),
    },
    ...([
      [rankingProducers.renderTier, rankingImplementationDigests.renderTier, renderTierBoard, "TierBoardProgram"],
      [rankingProducers.renderColumn, rankingImplementationDigests.renderColumn, renderColumn, "ColumnProgram"],
      [rankingProducers.renderTopThree, rankingImplementationDigests.renderTopThree, renderTopThree, "TopThreeProgram"],
      [rankingProducers.renderTypewriter, rankingImplementationDigests.renderTypewriter, renderTypewriterList, "TypewriterListProgram"],
    ] as const).map(([producer, implementationDigest, render, label]) => ({
      producer, implementationDigest,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { track: output(render(
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline(inputs.program?.value, label) as never,
      )) }, needs: {} }),
    })),
  ],
  validators: [
    { type: rankingTypes.schedule, implementationDigest: rankingValidatorDigests.schedule,
      handler: ({ value }) => assertRankingSchedule(inline<RankingSchedule>(value, "RankingSchedule")) },
    { type: rankingTypes.tierProgram, implementationDigest: rankingValidatorDigests.tierProgram,
      handler: ({ value }) => assertTierBoardProgram(inline<TierBoardProgram>(value, "TierBoardProgram")) },
    { type: rankingTypes.columnProgram, implementationDigest: rankingValidatorDigests.columnProgram,
      handler: ({ value }) => assertColumnProgram(inline<ColumnProgram>(value, "ColumnProgram")) },
    { type: rankingTypes.topThreeProgram, implementationDigest: rankingValidatorDigests.topThreeProgram,
      handler: ({ value }) => assertTopThreeProgram(inline<TopThreeProgram>(value, "TopThreeProgram")) },
    { type: rankingTypes.typewriterProgram, implementationDigest: rankingValidatorDigests.typewriterProgram,
      handler: ({ value }) => assertTypewriterListProgram(inline<TypewriterListProgram>(value, "TypewriterListProgram")) },
    { type: rankingTypes.soundEvents, implementationDigest: rankingValidatorDigests.events,
      handler: ({ value }) => assertRankingSoundEventPlan(inline<RankingSoundEventPlan>(value, "RankingSoundEventPlan")) },
  ],
} satisfies ComponentPackage;
