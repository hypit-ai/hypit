import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import type { SynchronizedMedia } from "@hypit/media";
import type { ProgramSpace } from "@hypit/program-space";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, StoredValue } from "@hypit/protocol";
import type { SemanticTrack } from "@hypit/semantic-track";
import { projectSemanticProgramSpace } from "@hypit/semantic-track";
import type { TemporalWindow } from "@hypit/temporal";
import type { CanvasSpace, SpatialFrame } from "@hypit/spatial";
import type { Text } from "@hypit/text";

import { rankingProducers, rankingTypes } from "./manifest.js";
import { appendColumnItem, appendColumnWindowCandidateWindow, appendRankingItemSpec, appendRankingSound, appendTierBoardItem, appendTopThreeItem, appendTriggeredRankingCandidateWindow, assertColumnProgram, assertRankingSchedule, assertRankingSoundEventPlan, assertTierBoardProgram, assertTopThreeProgram, buildColumnProgram, buildColumnSchedule, buildColumnSoundEvents, buildRankingScheduleFromWindows, buildTierBoardProgram, buildTierBoardSoundEvents, buildTopThreeProgram, buildTopThreeSoundEvents, createColumnItemSet, createColumnWindowCandidateSet, createRankingItemSpecSet, createRankingSoundSet, createTierBoardItemSet, createTopThreeItemSet, createTriggeredRankingCandidateSet, materializeRankingTextItem } from "./schedule.js";
import {
  renderColumn,
  renderRankingAudio,
  renderTierBoard,
  renderTopThree,
} from "./render.js";
import type {
  ColumnItemSet,
  ColumnItemSpec,
  ColumnProgram,
  ColumnStyle,
  ColumnWindowCandidateSet,
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
  TriggeredRankingCandidateSet,
} from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}

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
  producers: [
    {
      producer: rankingProducers.materializeTextItem,
      handler: ({ inputs }) => ({ outputs: { spec: output(materializeRankingTextItem(
        inline<RankingTextItemShell>(inputs.shell?.value, "RankingTextItemShell"),
        inline<Text>(inputs.content?.value, "Text"),
      )) }, needs: {} }),
    },
    {
      producer: rankingProducers.createSpecs,
      handler: ({ inputs }) => ({ outputs: { set: output(createRankingItemSpecSet(inline(inputs.header?.value, "RankingHeader"))) }, needs: {} }),
    },
    {
      producer: rankingProducers.appendSpec,
      handler: ({ inputs }) => ({ outputs: { set: output(appendRankingItemSpec(
        inline(inputs.set?.value, "RankingItemSpecSet"), inline(inputs.spec?.value, "RankingItemSpec"),
      )) }, needs: {} }),
    },
    {
      producer: rankingProducers.createTriggeredCandidates,
      handler: () => ({ outputs: { set: output(createTriggeredRankingCandidateSet()) }, needs: {} }),
    },
    {
      producer: rankingProducers.appendTriggeredCandidate,
      handler: ({ inputs }) => ({ outputs: { set: output(appendTriggeredRankingCandidateWindow(
        inline<TriggeredRankingCandidateSet>(inputs.set?.value, "TriggeredRankingCandidateSet"),
        inline<RankingItemSpec>(inputs.spec?.value, "RankingItemSpec"),
        inline<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
      )) }, needs: {} }),
    },
    {
      producer: rankingProducers.schedule,
      handler: ({ inputs }) => ({ outputs: { schedule: output(buildRankingScheduleFromWindows({
        header: inline(inputs.header?.value, "RankingHeader"), items: inline(inputs.items?.value, "RankingItemSpecSet"),
        semantic: inline(inputs.semantic?.value, "SemanticTrack"),
        outer: inline<TemporalWindow>(inputs.outer?.value, "TemporalWindow"),
        candidates: inline(inputs.candidates?.value, "TriggeredRankingCandidateSet"),
        terminal: inline<TemporalWindow>(inputs.terminal?.value, "TemporalWindow"),
      })) }, needs: {} }),
    },
    {
      producer: rankingProducers.createColumnCandidates,
      handler: () => ({ outputs: { set: output(createColumnWindowCandidateSet()) }, needs: {} }),
    },
    {
      producer: rankingProducers.appendColumnCandidate,
      handler: ({ inputs }) => ({ outputs: { set: output(appendColumnWindowCandidateWindow(
        inline<ColumnWindowCandidateSet>(inputs.set?.value, "ColumnWindowCandidateSet"),
        inline<ColumnItemSpec>(inputs.spec?.value, "ColumnItemSpec"),
        inline<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
      )) }, needs: {} }),
    },
    {
      producer: rankingProducers.columnSchedule,
      handler: ({ inputs }) => ({ outputs: { schedule: output(buildColumnSchedule({
        header: inline<RankingHeader>(inputs.header?.value, "RankingHeader"),
        items: inline<RankingItemSpecSet>(inputs.items?.value, "RankingItemSpecSet"),
        outer: inline<TemporalWindow>(inputs.outer?.value, "TemporalWindow"),
        candidates: inline<ColumnWindowCandidateSet>(inputs.candidates?.value, "ColumnWindowCandidateSet"),
      })) }, needs: {} }),
    },
    ...([
      [rankingProducers.createTierItems, createTierBoardItemSet],
      [rankingProducers.createColumnItems, createColumnItemSet],
      [rankingProducers.createTopThreeItems, createTopThreeItemSet],
    ] as const).map(([producer, create]) => ({
      producer,
      handler: () => ({ outputs: { set: output(create()) }, needs: {} }),
    })),
    {
      producer: rankingProducers.appendTierItem,
      handler: ({ inputs }) => ({ outputs: { set: output(appendTierBoardItem(
        inline<TierBoardItemSet>(inputs.set?.value, "TierBoardItemSet"),
        inline<TierBoardItemSpec>(inputs.spec?.value, "TierBoardItemSpec"),
        blob(inputs.icon?.value, "TierBoard icon"),
      )) }, needs: {} }),
    },
    ...([
      [rankingProducers.appendColumnItem, false],
      [rankingProducers.appendColumnIconItem, true],
    ] as const).map(([producer, hasIcon]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { set: output(appendColumnItem(
        inline<ColumnItemSet>(inputs.set?.value, "ColumnItemSet"),
        inline<ColumnItemSpec>(inputs.spec?.value, "ColumnItemSpec"),
        ...(hasIcon ? [blob(inputs.icon?.value, "Column icon")] : []),
      )) }, needs: {} }),
    })),
    ...([
      [rankingProducers.appendTopThreeItem, false],
      [rankingProducers.appendTopThreeIconItem, true],
    ] as const).map(([producer, hasIcon]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { set: output(appendTopThreeItem(
        inline<TopThreeItemSet>(inputs.set?.value, "TopThreeItemSet"),
        inline<TopThreeItemSpec>(inputs.spec?.value, "TopThreeItemSpec"),
        ...(hasIcon ? [blob(inputs.icon?.value, "TopThree icon")] : []),
      )) }, needs: {} }),
    })),
    {
      producer: rankingProducers.tierProgram,
      handler: ({ inputs }) => {
        const common = programInputs(inputs);
        return { outputs: { program: output(buildTierBoardProgram(common.header, common.frame, common.schedule,
          inline<TierBoardStyle>(inputs.style?.value, "TierBoardStyle"), inline<TierBoardItemSet>(inputs.set?.value, "TierBoardItemSet"))) }, needs: {} };
      },
    },
    {
      producer: rankingProducers.columnProgram,
      handler: ({ inputs }) => {
        const common = programInputs(inputs);
        return { outputs: { program: output(buildColumnProgram(common.header,
          inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace"), common.frame, common.schedule,
          inline<ColumnStyle>(inputs.style?.value, "ColumnStyle"), inline<ColumnItemSet>(inputs.set?.value, "ColumnItemSet"))) }, needs: {} };
      },
    },
    {
      producer: rankingProducers.topThreeProgram,
      handler: ({ inputs }) => {
        const common = programInputs(inputs);
        return { outputs: { program: output(buildTopThreeProgram(common.header, common.frame, common.schedule,
          inline<TopThreeStyle>(inputs.style?.value, "TopThreeStyle"), inline<TopThreeItemSet>(inputs.set?.value, "TopThreeItemSet"))) }, needs: {} };
      },
    },
    ...([
      [rankingProducers.tierEvents, buildTierBoardSoundEvents, "TierBoardStyle"],
      [rankingProducers.columnEvents, buildColumnSoundEvents, "ColumnStyle"],
      [rankingProducers.topThreeEvents, buildTopThreeSoundEvents, "TopThreeStyle"],
    ] as const).map(([producer, build, styleLabel]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { events: output(build(
        inline(inputs.schedule?.value, "RankingSchedule"),
        inline(inputs.style?.value, styleLabel) as never,
        inline(inputs.specs?.value, "RankingItemSpecSet"),
      )) }, needs: {} }),
    })),
    {
      producer: rankingProducers.createSounds,
      handler: () => ({ outputs: { sounds: output(createRankingSoundSet()) }, needs: {} }),
    },
    ...([
      [rankingProducers.appendAppearSound, "appear"],
      [rankingProducers.appendMoveSound, "move"],
    ] as const).map(([producer, kind]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { sounds: output(appendRankingSound(
        inline<RankingSoundSet>(inputs.sounds?.value, "RankingSoundSet"), kind,
        inline<SynchronizedMedia>(inputs.media?.value, `Ranking ${kind} sound`),
      )) }, needs: {} }),
    })),
    {
      producer: rankingProducers.renderAudio,
      handler: ({ inputs }) => ({ outputs: { track: output(renderRankingAudio(
        projectSemanticProgramSpace(inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack")),
        inline<RankingSoundEventPlan>(inputs.events?.value, "RankingSoundEventPlan"),
        inline<RankingSoundStyle>(inputs.style?.value, "RankingSoundStyle"),
        inline<RankingSoundSet>(inputs.sounds?.value, "RankingSoundSet"),
      )) }, needs: {} }),
    },
    ...([
      [rankingProducers.renderTier, renderTierBoard, "TierBoardProgram"],
      [rankingProducers.renderColumn, renderColumn, "ColumnProgram"],
      [rankingProducers.renderTopThree, renderTopThree, "TopThreeProgram"],
    ] as const).map(([producer, render, label]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { track: output(render(
        projectSemanticProgramSpace(inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack")), inline(inputs.program?.value, label) as never,
      )) }, needs: {} }),
    })),
  ],
  validators: [
    { type: rankingTypes.schedule,
      handler: ({ value }) => assertRankingSchedule(inline<RankingSchedule>(value, "RankingSchedule")) },
    { type: rankingTypes.tierProgram,
      handler: ({ value }) => assertTierBoardProgram(inline<TierBoardProgram>(value, "TierBoardProgram")) },
    { type: rankingTypes.columnProgram,
      handler: ({ value }) => assertColumnProgram(inline<ColumnProgram>(value, "ColumnProgram")) },
    { type: rankingTypes.topThreeProgram,
      handler: ({ value }) => assertTopThreeProgram(inline<TopThreeProgram>(value, "TopThreeProgram")) },
    { type: rankingTypes.soundEvents,
      handler: ({ value }) => assertRankingSoundEventPlan(inline<RankingSoundEventPlan>(value, "RankingSoundEventPlan")) },
  ],
} satisfies ComponentPackage;
