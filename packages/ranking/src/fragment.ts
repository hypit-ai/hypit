import { compositionTypes } from "@narratage/composition";
import { sealGraphFragment } from "@narratage/elaborator";
import type { FragmentOperation, GraphFragment } from "@narratage/elaborator";
import { mediaTypes } from "@narratage/media";
import { narrativeTypes } from "@narratage/narrative";
import { programSpaceTypes } from "@narratage/program-space";
import { semanticMapTypes } from "@narratage/semantic-map";
import { spatialTypes } from "@narratage/spatial";
import { textTypes } from "@narratage/text";

import { rankingProducers, rankingTypes } from "./manifest.js";
import type { RankingVariant } from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export type RankingFragmentItem = {
  readonly suffix: string;
  readonly specName: string;
  readonly iconName?: string;
  readonly contentName?: string;
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
  if (variant === "top-three") return {
    style: rankingTypes.topThreeStyle, set: rankingTypes.topThreeItems, program: rankingTypes.topThreeProgram,
    create: rankingProducers.createTopThreeItems, append: rankingProducers.appendTopThreeItem,
    appendIcon: rankingProducers.appendTopThreeIconItem, build: rankingProducers.topThreeProgram,
    events: rankingProducers.topThreeEvents, render: rankingProducers.renderTopThree,
  } as const;
  return {
    style: rankingTypes.typewriterStyle, set: rankingTypes.typewriterItems, program: rankingTypes.typewriterProgram,
    create: rankingProducers.createTypewriterItems, append: rankingProducers.appendTypewriterItem,
    appendIcon: rankingProducers.appendTypewriterItem, build: rankingProducers.typewriterProgram,
    events: rankingProducers.typewriterEvents, render: rankingProducers.renderTypewriter,
  } as const;
};

export function createRankingFragment(
  variant: RankingVariant,
  items: readonly RankingFragmentItem[],
  sound: RankingFragmentSound,
  name = `@narratage/ranking/dynamic-${variant}@1`,
) {
  if (items.length === 0) throw new Error("Ranking Fragment requires at least one Item.");
  const selected = definition(variant);
  const inputs: Array<GraphFragment["inputs"][number]> = [
    { name: "header", type: rankingTypes.header },
    { name: "map", type: semanticMapTypes.complete },
    { name: "space", type: programSpaceTypes.programSpace },
    { name: "outer", type: narrativeTypes.selection },
    { name: "triggers", type: narrativeTypes.moment },
    { name: "terminal", type: narrativeTypes.moment },
    { name: "frame", type: spatialTypes.frame },
    { name: "style", type: selected.style },
  ];
  if (variant === "typewriter-list") inputs.push({ name: "title", type: textTypes.text });
  const operations: FragmentOperation[] = [
    { id: "specs", producer: rankingProducers.createSpecs, inputs: { header: input("header") }, result: { kind: "output", name: "set" } },
    { id: "resolved", producer: selected.create, inputs: {}, result: { kind: "output", name: "set" } },
  ];
  let specs = operation("specs");
  let resolved = operation("resolved");
  for (const item of items) {
    inputs.push({ name: item.specName, type: item.contentName === undefined ? rankingTypes.itemSpec : rankingTypes.textItemShell });
    if (item.contentName !== undefined) inputs.push({ name: item.contentName, type: textTypes.text });
    if (item.iconName !== undefined) inputs.push({ name: item.iconName, type: mediaTypes.blobArtifact });
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
  }
  operations.push({
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
      ...(variant === "typewriter-list" ? { title: input("title") } : {}),
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
    name,
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
