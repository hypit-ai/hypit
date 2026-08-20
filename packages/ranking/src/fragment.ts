import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation, GraphFragment } from "@hypit/elaborator";
import { mediaTypes } from "@hypit/media";
import { narrativeTypes } from "@hypit/narrative";
import { programSpaceTypes } from "@hypit/program-space";
import { semanticMapTypes } from "@hypit/semantic-map";
import { spatialTypes } from "@hypit/spatial";
import { textTypes } from "@hypit/text";

import { rankingProducers, rankingTypes } from "./manifest.js";
import type { RankingVariant } from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export type RankingFragmentItem = {
  readonly suffix: string;
  readonly specName: string;
  readonly iconName?: string;
  readonly contentName?: string;
  readonly timingName?: string;
};

export type RankingFragmentSound = {
  readonly appearName?: string;
  readonly moveName?: string;
};

const definition = (variant: RankingVariant) => {
  if (variant === "tier-board") return {
    style: rankingTypes.tierStyle, set: rankingTypes.tierItems, program: rankingTypes.tierProgram,
    create: rankingProducers.createTierItems, append: rankingProducers.appendTierItem,
    appendIcon: rankingProducers.appendTierItem, build: rankingProducers.tierProgram,
    events: rankingProducers.tierEvents, render: rankingProducers.renderTier,
  } as const;
  if (variant === "column") return {
    style: rankingTypes.columnStyle, set: rankingTypes.columnItems, program: rankingTypes.columnProgram,
    create: rankingProducers.createColumnItems, append: rankingProducers.appendColumnItem,
    appendIcon: rankingProducers.appendColumnIconItem, build: rankingProducers.columnProgram,
    events: rankingProducers.columnEvents, render: rankingProducers.renderColumn,
  } as const;
  return {
    style: rankingTypes.topThreeStyle, set: rankingTypes.topThreeItems, program: rankingTypes.topThreeProgram,
    create: rankingProducers.createTopThreeItems, append: rankingProducers.appendTopThreeItem,
    appendIcon: rankingProducers.appendTopThreeIconItem, build: rankingProducers.topThreeProgram,
    events: rankingProducers.topThreeEvents, render: rankingProducers.renderTopThree,
  } as const;
};

export function createRankingFragment(
  variant: RankingVariant,
  items: readonly RankingFragmentItem[],
  sound: RankingFragmentSound,
  outerKind: "selection" | "segment" = "selection",
) {
  if (items.length === 0) throw new Error("Ranking Fragment requires at least one Item.");
  const selected = definition(variant);
  const inputs: Array<GraphFragment["inputs"][number]> = [
    { name: "header", type: rankingTypes.header },
    { name: "map", type: semanticMapTypes.complete },
    { name: "space", type: programSpaceTypes.programSpace },
    { name: "outer", type: outerKind === "selection" ? narrativeTypes.selection : narrativeTypes.excerpt },
    ...(variant === "column" ? [] : [
      { name: "triggers", type: narrativeTypes.moment },
      { name: "terminal", type: narrativeTypes.moment },
    ]),
    ...(variant === "column" ? [{ name: "canvas", type: spatialTypes.canvas }] : []),
    { name: "frame", type: spatialTypes.frame },
    { name: "style", type: selected.style },
  ];
  const operations: FragmentOperation[] = [
    { id: "specs", producer: rankingProducers.createSpecs, inputs: { header: input("header") }, result: { kind: "output", name: "set" } },
    { id: "resolved", producer: selected.create, inputs: {}, result: { kind: "output", name: "set" } },
    ...(variant === "column" ? [{ id: "candidates", producer: rankingProducers.createColumnCandidates, inputs: {}, result: { kind: "output" as const, name: "set" } }] : []),
  ];
  let specs = operation("specs");
  let resolved = operation("resolved");
  let candidates = operation("candidates");
  for (const item of items) {
    inputs.push({ name: item.specName, type: item.contentName === undefined ? rankingTypes.itemSpec : rankingTypes.textItemShell });
    if (item.contentName !== undefined) inputs.push({ name: item.contentName, type: textTypes.text });
    if (item.iconName !== undefined) inputs.push({ name: item.iconName, type: mediaTypes.blobArtifact });
    if (item.timingName !== undefined) inputs.push({ name: item.timingName, type: narrativeTypes.selection });
    const materializedId = `materialize-${item.suffix}`;
    if (item.contentName !== undefined) operations.push({
      id: materializedId,
      producer: rankingProducers.materializeTextItem,
      inputs: { shell: input(item.specName), content: input(item.contentName) },
      result: { kind: "output", name: "spec" },
    });
    const resolvedSpec = item.contentName === undefined ? input(item.specName) : operation(materializedId);
    const semanticId = `spec-${item.suffix}`;
    operations.push({
      id: semanticId,
      producer: rankingProducers.appendSpec,
      inputs: { set: specs, spec: resolvedSpec },
      result: { kind: "output", name: "set" },
    });
    specs = operation(semanticId);
    const visualId = `item-${item.suffix}`;
    operations.push({
      id: visualId,
      producer: item.iconName === undefined ? selected.append : selected.appendIcon,
      inputs: {
        set: resolved,
        spec: resolvedSpec,
        ...(item.iconName === undefined ? {} : { icon: input(item.iconName) }),
      },
      result: { kind: "output", name: "set" },
    });
    resolved = operation(visualId);
    if (item.timingName !== undefined) {
      const timingId = `timing-${item.suffix}`;
      operations.push({
        id: timingId,
        producer: rankingProducers.appendColumnCandidate,
        inputs: {
          set: candidates, spec: resolvedSpec, map: input("map"), space: input("space"), selection: input(item.timingName),
        },
        result: { kind: "output", name: "set" },
      });
      candidates = operation(timingId);
    }
  }
  if (variant === "column") {
    operations.push({
      id: "outer-window",
      producer: outerKind === "selection" ? rankingProducers.projectColumnSelectionOuter : rankingProducers.projectColumnSegmentOuter,
      inputs: { map: input("map"), space: input("space"), [outerKind]: input("outer") },
      result: { kind: "output", name: "outer" },
    });
    operations.push({
      id: "schedule",
      producer: rankingProducers.columnSchedule,
      inputs: { header: input("header"), items: specs, outer: operation("outer-window"), candidates },
      result: { kind: "output", name: "schedule" },
    });
  } else operations.push({
      id: "schedule",
      producer: rankingProducers.schedule,
      inputs: {
        header: input("header"), items: specs, map: input("map"), space: input("space"),
        outer: input("outer"), triggers: input("triggers"), terminal: input("terminal"),
      },
      result: { kind: "output", name: "schedule" },
    });
  operations.push({
    id: "program",
    producer: selected.build,
    inputs: {
      header: input("header"),
      ...(variant === "column" ? { canvas: input("canvas") } : {}),
      frame: input("frame"), schedule: operation("schedule"), style: input("style"), set: resolved,
    },
    result: { kind: "output", name: "program" },
  });
  operations.push({
    id: "visual",
    producer: selected.render,
    inputs: { space: input("space"), program: operation("program") },
    result: { kind: "output", name: "track" },
  });
  const hasAudio = sound.appearName !== undefined || sound.moveName !== undefined;
  if (hasAudio) {
    inputs.push({ name: "sound-style", type: rankingTypes.soundStyle });
    operations.push({
      id: "events", producer: selected.events,
      inputs: { schedule: operation("schedule"), style: input("style"), specs },
      result: { kind: "output", name: "events" },
    });
    operations.push({
      id: "sounds", producer: rankingProducers.createSounds, inputs: {}, result: { kind: "output", name: "sounds" },
    });
    let sounds = operation("sounds");
    for (const [kind, inputName, producer] of [
      ["appear", sound.appearName, rankingProducers.appendAppearSound],
      ["move", sound.moveName, rankingProducers.appendMoveSound],
    ] as const) {
      if (inputName === undefined) continue;
      inputs.push({ name: inputName, type: mediaTypes.synchronized });
      const id = `sound-${kind}`;
      operations.push({
        id, producer, inputs: { sounds, media: input(inputName) }, result: { kind: "output", name: "sounds" },
      });
      sounds = operation(id);
    }
    operations.push({
      id: "audio", producer: rankingProducers.renderAudio,
      inputs: { space: input("space"), events: operation("events"), style: input("sound-style"), sounds },
      result: { kind: "output", name: "track" },
    });
  }
  return sealGraphFragment({
    inputs,
    operations,
    exports: [
      { name: "schedule", type: rankingTypes.schedule, root: operation("schedule") },
      { name: "program", type: selected.program, root: operation("program") },
      { name: "visual", type: compositionTypes.visualTrack, root: operation("visual") },
      ...(hasAudio ? [{ name: "audio", type: compositionTypes.audioTrack, root: operation("audio") }] : []),
    ],
  });
}
