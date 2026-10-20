import type { Timeline } from "@hypit/timeline";
import type { ProducerPackage, ProducerHandlerContext } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { SynchronizedMedia } from "@hypit/media";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, Value } from "@hypit/hypit/protocol";
import type { TemporalInstant, TemporalWindow } from "@hypit/temporal";
import type { SpatialFrame } from "@hypit/spatial";
import type { Text } from "@hypit/hypit/text";

import { rankingProducers, rankingTypes } from "./manifest.js";
import { appendColumnItem, appendColumnWindow, appendRankingItemSpec, appendRankingSound, appendTierBoardItem, appendTierBoardWindow, appendTopThreeItem, appendTriggeredRankingCandidate, assertColumnProgram, assertRankingSchedule, assertRankingSoundEventPlan, assertTierBoardProgram, assertTopThreeProgram, buildColumnProgram, buildColumnSchedule, buildColumnSoundEvents, buildTriggeredRankingSchedule, buildTierBoardProgram, buildTierBoardSchedule, buildTierBoardSoundEvents, buildTopThreeProgram, buildTopThreeSoundEvents, createColumnItemSet, createColumnWindowSet, createRankingItemSpecSet, createRankingSoundSet, createTierBoardItemSet, createTierBoardWindowSet, createTopThreeItemSet, createTriggeredRankingCandidateSet, materializeRankingTextItem } from "./schedule.js";
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
  ColumnWindowSet,
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
  TierBoardWindowSet,
  TopThreeItemSet,
  TopThreeItemSpec,
  TopThreeProgram,
  TopThreeStyle,
  TriggeredRankingCandidateSet,
} from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

function blob(value: Value | undefined, label: string): BlobRef {
  assertBlobRef(value, label);
  return value;
}

const output = (value: unknown) => ((canonicalize(value)));

function programInputs(inputs: ProducerHandlerContext["inputs"]) {
  return {
    header: valueOf<RankingHeader>(inputs.header?.value, "RankingHeader"),
    frame: valueOf<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
    schedule: valueOf<RankingSchedule>(inputs.schedule?.value, "RankingSchedule"),
  };
}

export const rankingComponent = {
  producers: [
    {
      producer: rankingProducers.materializeTextItem,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(materializeRankingTextItem(
        valueOf<RankingTextItemShell>(inputs.shell?.value, "RankingTextItemShell"),
        valueOf<Text>(inputs.content?.value, "Text"),
      )) }),
    },
    {
      producer: rankingProducers.createSpecs,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(createRankingItemSpecSet(valueOf(inputs.header?.value, "RankingHeader"))) }),
    },
    {
      producer: rankingProducers.appendSpec,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(appendRankingItemSpec(
        valueOf(inputs.set?.value, "RankingItemSpecSet"), valueOf(inputs.spec?.value, "RankingItemSpec"),
      )) }),
    },
    {
      producer: rankingProducers.createTriggeredCandidates,
      handler: () => ({ kind: "output" as const, value: output(createTriggeredRankingCandidateSet()) }),
    },
    {
      producer: rankingProducers.appendTriggeredCandidate,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(appendTriggeredRankingCandidate(
        valueOf<TriggeredRankingCandidateSet>(inputs.set?.value, "TriggeredRankingCandidateSet"),
        valueOf<RankingItemSpec>(inputs.spec?.value, "RankingItemSpec"),
        valueOf<TemporalInstant>(inputs.activation?.value, "TemporalInstant"),
      )) }),
    },
    {
      producer: rankingProducers.schedule,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(buildTriggeredRankingSchedule({
        header: valueOf(inputs.header?.value, "RankingHeader"), items: valueOf(inputs.items?.value, "RankingItemSpecSet"),
        timeline: valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        outer: valueOf<TemporalWindow>(inputs.outer?.value, "TemporalWindow"),
        candidates: valueOf(inputs.candidates?.value, "TriggeredRankingCandidateSet"),
        terminal: valueOf<TemporalInstant>(inputs.terminal?.value, "TemporalInstant"),
      })) }),
    },
    {
      producer: rankingProducers.createTierWindows,
      handler: () => ({ kind: "output" as const, value: output(createTierBoardWindowSet()) }),
    },
    {
      producer: rankingProducers.appendTierWindow,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(appendTierBoardWindow(
        valueOf<TierBoardWindowSet>(inputs.set?.value, "TierBoardWindowSet"),
        valueOf<TierBoardItemSpec>(inputs.spec?.value, "TierBoardItemSpec"),
        valueOf<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
      )) }),
    },
    {
      producer: rankingProducers.tierSchedule,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(buildTierBoardSchedule({
        header: valueOf<RankingHeader>(inputs.header?.value, "RankingHeader"),
        items: valueOf<RankingItemSpecSet>(inputs.items?.value, "RankingItemSpecSet"),
        timeline: valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        outer: valueOf<TemporalWindow>(inputs.outer?.value, "TemporalWindow"),
        windows: valueOf<TierBoardWindowSet>(inputs.windows?.value, "TierBoardWindowSet"),
      })) }),
    },
    {
      producer: rankingProducers.createColumnWindows,
      handler: () => ({ kind: "output" as const, value: output(createColumnWindowSet()) }),
    },
    {
      producer: rankingProducers.appendColumnWindow,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(appendColumnWindow(
        valueOf<ColumnWindowSet>(inputs.set?.value, "ColumnWindowSet"),
        valueOf<ColumnItemSpec>(inputs.spec?.value, "ColumnItemSpec"),
        valueOf<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
      )) }),
    },
    {
      producer: rankingProducers.columnSchedule,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(buildColumnSchedule({
        header: valueOf<RankingHeader>(inputs.header?.value, "RankingHeader"),
        items: valueOf<RankingItemSpecSet>(inputs.items?.value, "RankingItemSpecSet"),
        timeline: valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        outer: valueOf<TemporalWindow>(inputs.outer?.value, "TemporalWindow"),
        windows: valueOf<ColumnWindowSet>(inputs.windows?.value, "ColumnWindowSet"),
      })) }),
    },
    ...([
      [rankingProducers.createTierItems, createTierBoardItemSet],
      [rankingProducers.createColumnItems, createColumnItemSet],
      [rankingProducers.createTopThreeItems, createTopThreeItemSet],
    ] as const).map(([producer, create]) => ({
      producer,
      handler: () => ({ kind: "output" as const, value: output(create()) }),
    })),
    {
      producer: rankingProducers.appendTierItem,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(appendTierBoardItem(
        valueOf<TierBoardItemSet>(inputs.set?.value, "TierBoardItemSet"),
        valueOf<TierBoardItemSpec>(inputs.spec?.value, "TierBoardItemSpec"),
        blob(inputs.icon?.value, "TierBoard icon"),
      )) }),
    },
    ...([
      [rankingProducers.appendColumnItem, false],
      [rankingProducers.appendColumnIconItem, true],
    ] as const).map(([producer, hasIcon]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => ({ kind: "output" as const, value: output(appendColumnItem(
        valueOf<ColumnItemSet>(inputs.set?.value, "ColumnItemSet"),
        valueOf<ColumnItemSpec>(inputs.spec?.value, "ColumnItemSpec"),
        ...(hasIcon ? [blob(inputs.icon?.value, "Column icon")] : []),
      )) }),
    })),
    ...([
      [rankingProducers.appendTopThreeItem, false],
      [rankingProducers.appendTopThreeIconItem, true],
    ] as const).map(([producer, hasIcon]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => ({ kind: "output" as const, value: output(appendTopThreeItem(
        valueOf<TopThreeItemSet>(inputs.set?.value, "TopThreeItemSet"),
        valueOf<TopThreeItemSpec>(inputs.spec?.value, "TopThreeItemSpec"),
        ...(hasIcon ? [blob(inputs.icon?.value, "TopThree icon")] : []),
      )) }),
    })),
    {
      producer: rankingProducers.tierProgram,
      handler: ({ inputs }) => {
        const common = programInputs(inputs);
        return { kind: "output" as const, value: output(buildTierBoardProgram(common.header,
          valueOf<SpatialFrame>(inputs.within?.value, "SpatialFrame"), common.frame, common.schedule,
          valueOf<TierBoardStyle>(inputs.style?.value, "TierBoardStyle"), valueOf<TierBoardItemSet>(inputs.set?.value, "TierBoardItemSet"))) };
      },
    },
    {
      producer: rankingProducers.columnProgram,
      handler: ({ inputs }) => {
        const common = programInputs(inputs);
        return { kind: "output" as const, value: output(buildColumnProgram(common.header,
          valueOf<SpatialFrame>(inputs.within?.value, "SpatialFrame"), common.frame, common.schedule,
          valueOf<ColumnStyle>(inputs.style?.value, "ColumnStyle"), valueOf<ColumnItemSet>(inputs.set?.value, "ColumnItemSet"))) };
      },
    },
    {
      producer: rankingProducers.topThreeProgram,
      handler: ({ inputs }) => {
        const common = programInputs(inputs);
        return { kind: "output" as const, value: output(buildTopThreeProgram(common.header, common.frame, common.schedule,
          valueOf<TopThreeStyle>(inputs.style?.value, "TopThreeStyle"), valueOf<TopThreeItemSet>(inputs.set?.value, "TopThreeItemSet"))) };
      },
    },
    ...([
      [rankingProducers.tierEvents, buildTierBoardSoundEvents, "TierBoardStyle"],
      [rankingProducers.columnEvents, buildColumnSoundEvents, "ColumnStyle"],
      [rankingProducers.topThreeEvents, buildTopThreeSoundEvents, "TopThreeStyle"],
    ] as const).map(([producer, build, styleLabel]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => ({ kind: "output" as const, value: output(build(
        valueOf(inputs.schedule?.value, "RankingSchedule"),
        valueOf(inputs.style?.value, styleLabel) as never,
        valueOf(inputs.specs?.value, "RankingItemSpecSet"),
      )) }),
    })),
    {
      producer: rankingProducers.createSounds,
      handler: () => ({ kind: "output" as const, value: output(createRankingSoundSet()) }),
    },
    ...([
      [rankingProducers.appendAppearSound, "appear"],
      [rankingProducers.appendMoveSound, "move"],
    ] as const).map(([producer, kind]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => ({ kind: "output" as const, value: output(appendRankingSound(
        valueOf<RankingSoundSet>(inputs.sounds?.value, "RankingSoundSet"), kind,
        valueOf<SynchronizedMedia>(inputs.media?.value, `Ranking ${kind} sound`),
      )) }),
    })),
    {
      producer: rankingProducers.renderAudio,
      handler: ({ inputs }) => ({ kind: "output" as const, value: output(renderRankingAudio(
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        valueOf<RankingSoundEventPlan>(inputs.events?.value, "RankingSoundEventPlan"),
        valueOf<RankingSoundStyle>(inputs.style?.value, "RankingSoundStyle"),
        valueOf<RankingSoundSet>(inputs.sounds?.value, "RankingSoundSet"),
      )) }),
    },
    ...([
      [rankingProducers.renderTier, renderTierBoard, "TierBoardProgram"],
      [rankingProducers.renderColumn, renderColumn, "ColumnProgram"],
      [rankingProducers.renderTopThree, renderTopThree, "TopThreeProgram"],
    ] as const).map(([producer, render, label]) => ({
      producer,
      handler: ({ inputs }: ProducerHandlerContext) => ({ kind: "output" as const, value: output(render(
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"), valueOf(inputs.program?.value, label) as never,
      )) }),
    })),
  ],
  refinements: [
    { type: rankingTypes.schedule,
      handler: ({ value }) => assertRankingSchedule(valueOf<RankingSchedule>(value, "RankingSchedule")) },
    { type: rankingTypes.tierProgram,
      handler: ({ value }) => assertTierBoardProgram(valueOf<TierBoardProgram>(value, "TierBoardProgram")) },
    { type: rankingTypes.columnProgram,
      handler: ({ value }) => assertColumnProgram(valueOf<ColumnProgram>(value, "ColumnProgram")) },
    { type: rankingTypes.topThreeProgram,
      handler: ({ value }) => assertTopThreeProgram(valueOf<TopThreeProgram>(value, "TopThreeProgram")) },
    { type: rankingTypes.soundEvents,
      handler: ({ value }) => assertRankingSoundEventPlan(valueOf<RankingSoundEventPlan>(value, "RankingSoundEventPlan")) },
  ],
} satisfies ProducerPackage & RefinementPackage;
