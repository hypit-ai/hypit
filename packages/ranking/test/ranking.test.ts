import assert from "node:assert/strict";
import test from "node:test";
import { videoContractManifests } from "../../test-support/video-domain.js";

import { createResolvedClosure } from "@narratage/core";
import type { FontArtifactRef, SynchronizedMedia } from "@narratage/media";
import { mediaTypes } from "@narratage/media";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import { sealProgramSpace } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import { sealSpatialFrame } from "@narratage/spatial";
import type { SvsRecipe } from "@narratage/svs";

import {
  appendColumnItem,
  appendRankingItemSpec,
  appendRankingSound,
  appendTierBoardItem,
  appendTopThreeItem,
  appendTypewriterItem,
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
  decodeColumnStyle,
  decodeColumnStyleSurface,
  decodeColumnSurface,
  decodeTierBoardStyle,
  decodeTierBoardStyleSurface,
  decodeTierBoardSurface,
  decodeTopThreeStyle,
  decodeTopThreeStyleSurface,
  decodeTopThreeSurface,
  decodeTypewriterListStyle,
  decodeTypewriterListStyleSurface,
  decodeTypewriterListSurface,
  graphemes,
  renderColumn,
  renderRankingAudio,
  renderTierBoard,
  renderTopThree,
  renderTypewriterList,
  rankingManifest,
  rankingProducers,
  rankingTypes,
  sealRankingHeader,
} from "@narratage/ranking";
import type {
  ColumnItemSpec,
  RankingHeader,
  RankingItemSpec,
  RankingSchedule,
  TierBoardItemSpec,
  TopThreeItemSpec,
  TypewriterItemSpec,
} from "@narratage/ranking";
import { narrativeTypes } from "@narratage/narrative";
import { programSpaceTypes } from "@narratage/program-space";
import { semanticMapTypes } from "@narratage/semantic-map";
import { spatialTypes } from "@narratage/spatial";
import { svsRecipeType } from "@narratage/svs";
import { sealText, textManifest, textTypes } from "@narratage/text";
import type {
  StructuredElement,
  StructuredNode,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@narratage/markup";

const space = sealProgramSpace({
  contract: "svml.program-space@1",
  durationSec: 8,
  frameRate: { numerator: 30, denominator: 1 },
});
const frame = sealSpatialFrame({
  contract: "svml.spatial-frame@1", xPx: 40, yPx: 80, widthPx: 720, heightPx: 560,
});
const map: CompleteSemanticMap = {
  contract: "svml.complete-semantic-map@1",
  tokens: [],
  anchors: [
    { identity: "outer-start", timeSec: 10 / 30, frame: 10 },
    { identity: "one", timeSec: 1, frame: 30 },
    { identity: "two", timeSec: 70 / 30, frame: 70 },
    { identity: "three", timeSec: 110 / 30, frame: 110 },
    { identity: "four", timeSec: 150 / 30, frame: 150 },
    { identity: "terminal", timeSec: 190 / 30, frame: 190 },
    { identity: "outer-end", timeSec: 230 / 30, frame: 230 },
  ],
};
const outer: NarrativeSelectionRef = {
  contract: "svml.narrative-selection@1", id: "ranking-window",
  occurrences: [{ occurrence: 0, startAnchorId: "outer-start", endAnchorId: "outer-end" }],
};
const terminal: NarrativeMomentRef = {
  contract: "svml.narrative-moment@1", id: "ranking-complete",
  occurrences: [{ occurrence: 0, anchorId: "terminal" }],
};
const triggers = (count: number): NarrativeMomentRef => ({
  contract: "svml.narrative-moment@1", id: "next-rank",
  occurrences: ["one", "two", "three", "four"].slice(0, count)
    .map((anchorId, occurrence) => ({ occurrence, anchorId })),
});
const font: FontArtifactRef = {
  contract: "svml.font-artifact@1",
  sources: [{ artifact: { kind: "blob", digest: digestOf("ranking-font"), size: 32, mediaType: "font/woff2" } }],
  weight: 700,
  style: "normal",
};
const recipe = (path: string, properties: SvsRecipe["properties"] = {}): SvsRecipe => ({
  contract: "svml.svs-recipe@1", path, properties,
});
const image = (id: string) => ({ kind: "blob" as const, digest: digestOf(`ranking-image:${id}`), size: 64, mediaType: "image/png" });
const header = (variant: RankingHeader["variant"], id: string = variant) => sealRankingHeader({
  contract: "svml.ranking-header@1", id, variant,
});

function specs(headerValue: RankingHeader, values: readonly RankingItemSpec[]) {
  let set = createRankingItemSpecSet(headerValue);
  for (const value of values) set = appendRankingItemSpec(set, value);
  return set;
}

function schedule(headerValue: RankingHeader, values: readonly RankingItemSpec[]): RankingSchedule {
  return buildRankingSchedule({
    header: headerValue, items: specs(headerValue, values), map, space, outer,
    triggers: triggers(values.length), terminal,
  });
}

const tierSpec = (id: string, tier: string, entry: "direct" | "stage" = "direct"): TierBoardItemSpec => ({
  contract: "svml.tier-board-item-spec@1", variant: "tier-board", id, tier, entry,
});
const columnSpec = (id: string): ColumnItemSpec => ({
  contract: "svml.column-item-spec@1", variant: "column", id, label: id.toUpperCase(),
});
const topSpec = (id: string): TopThreeItemSpec => ({
  contract: "svml.top-three-item-spec@1", variant: "top-three", id, label: id.toUpperCase(),
});
const typeSpec = (id: string, text: string, winner = false): TypewriterItemSpec => ({
  contract: "svml.typewriter-item-spec@1", variant: "typewriter-list", id, text, winner,
});

test("RankingSchedule zips authored item and Moment order and preserves a settled suffix", () => {
  const owner = header("column", "tools");
  const value = schedule(owner, [columnSpec("fourth"), columnSpec("third"), columnSpec("second")]);
  assert.deepEqual(value.entries.map((entry) => [entry.itemId, entry.triggerOccurrenceId, entry.stage, entry.cumulative]), [
    ["fourth", "next-rank#0", { startFrame: 30, endFrameExclusive: 70 }, { startFrame: 30, endFrameExclusive: 230 }],
    ["third", "next-rank#1", { startFrame: 70, endFrameExclusive: 110 }, { startFrame: 70, endFrameExclusive: 230 }],
    ["second", "next-rank#2", { startFrame: 110, endFrameExclusive: 190 }, { startFrame: 110, endFrameExclusive: 230 }],
  ]);
  assert.deepEqual(value.entries.at(-1)?.settled, { startFrame: 190, endFrameExclusive: 230 });
});

test("RankingSchedule rejects cardinality, outer/terminal ambiguity and authored physical reversal", () => {
  const owner = header("column");
  const values = [columnSpec("a"), columnSpec("b")];
  assert.throws(() => buildRankingSchedule({
    header: owner, items: specs(owner, values), map, space, outer, triggers: triggers(1), terminal,
  }), /cardinality/u);
  assert.throws(() => buildRankingSchedule({
    header: owner, items: specs(owner, values), map, space,
    outer: { ...outer, occurrences: [...outer.occurrences, { ...outer.occurrences[0]!, occurrence: 1 }] },
    triggers: triggers(2), terminal,
  }), /exactly one/u);
  assert.throws(() => buildRankingSchedule({
    header: owner, items: specs(owner, values), map, space, outer,
    triggers: { ...triggers(2), occurrences: [triggers(2).occurrences[1]!, triggers(2).occurrences[0]!] }, terminal,
  }), /strictly increasing/u);
});

test("variant Style decoders reject unknown Recipes and keep exact fonts and independent stacks", () => {
  const tier = decodeTierBoardStyle(recipe("ranking.tier", {
    rows: "s:S:#ef4444|a:A:#22c55e", "board-stack": 8, "stage-stack": 20, "item-stack": 31,
  }), font);
  assert.deepEqual(tier.style.rows.map((row) => row.id), ["s", "a"]);
  assert.equal(tier.style.text.fonts[0]?.sources[0]?.artifact.digest, font.sources[0]!.artifact.digest);
  assert.deepEqual([tier.style.boardStackingOrder, tier.style.stageStackingOrder, tier.style.itemStackingOrder], [8, 20, 31]);
  assert.throws(() => decodeColumnStyle(recipe("ranking.column", { "tier-only": 1 }), font), /does not accept/u);
  assert.equal(decodeTopThreeStyle(recipe("ranking.top"), font).style.slotColors.length, 3);
  assert.equal(decodeTypewriterListStyle(recipe("ranking.typewriter"), font).style.framesPerGrapheme, 2);
});

test("TierBoard owns cumulative direct/stage placement and rejects impossible stages", () => {
  const owner = header("tier-board", "tiers");
  const semantic = [tierSpec("alpha", "s", "stage"), tierSpec("beta", "a")];
  const style = decodeTierBoardStyle(recipe("ranking.tier", {
    rows: "s:S:#ef4444|a:A:#22c55e", "appear-frames": 5, "move-frames": 8,
  }), font).style;
  let set = createTierBoardItemSet();
  set = appendTierBoardItem(set, semantic[0]!, image("alpha"));
  set = appendTierBoardItem(set, semantic[1]!, image("beta"));
  const program = buildTierBoardProgram(owner, frame, schedule(owner, semantic), style, set);
  const track = renderTierBoard(space, program);
  assert.deepEqual(track.presents.map((item) => item.stacking.order).sort((a, b) => a - b), [20, 25, 30, 30, 30, 30]);
  assert.equal(track.presents.find((item) => item.id.endsWith(":item:alpha:settled"))?.span.endFrameExclusive, 230);
  const tightTerminal = { ...terminal, occurrences: [{ occurrence: 0, anchorId: "two" }] };
  assert.throws(() => buildRankingSchedule({
    header: owner, items: specs(owner, semantic), map, space, outer, triggers: triggers(2), terminal: tightTerminal,
  }), /outside|strictly increasing/u);
});

test("Column has one active stage, cumulative settled rows and truly optional icons", () => {
  const owner = header("column", "column");
  const semantic = [columnSpec("one"), columnSpec("two"), columnSpec("three")];
  const style = decodeColumnStyle(recipe("ranking.column", { "appear-frames": 4, "move-frames": 6 }), font).style;
  let set = createColumnItemSet();
  set = appendColumnItem(set, semantic[0]!);
  set = appendColumnItem(set, semantic[1]!, image("two"));
  set = appendColumnItem(set, semantic[2]!);
  const value = schedule(owner, semantic);
  const program = buildColumnProgram(owner, frame, value, style, set);
  const track = renderColumn(space, program);
  const items = track.presents.filter((item) => item.id.includes(":item:") && item.id.endsWith(":stage"));
  assert.deepEqual(items.map((item) => item.span.startFrame), [30, 70, 110]);
  assert.equal(items[0]?.elements.some((item) => item.kind === "image"), false);
  assert.equal(items[1]?.elements.some((item) => item.kind === "image"), true);
  assert.equal(value.entries.filter((entry) => entry.stage.startFrame <= 80 && 80 < entry.stage.endFrameExclusive).length, 1);
});

test("TopThree accepts one to three optional-image Items and removes active accent in the settled suffix", () => {
  const owner = header("top-three", "podium");
  const semantic = [topSpec("gold"), topSpec("silver"), topSpec("bronze")];
  const style = decodeTopThreeStyle(recipe("ranking.top", { "appear-frames": 4 }), font).style;
  let set = createTopThreeItemSet();
  set = appendTopThreeItem(set, semantic[0]!, image("gold"));
  set = appendTopThreeItem(set, semantic[1]!);
  set = appendTopThreeItem(set, semantic[2]!, image("bronze"));
  const value = schedule(owner, semantic);
  const program = buildTopThreeProgram(owner, frame, value, style, set);
  const track = renderTopThree(space, program);
  const active = track.presents.find((item) => item.id.endsWith(":item:bronze:stage"))!;
  const settled = track.presents.find((item) => item.id.endsWith(":item:bronze:settled"))!;
  const accent = active.elements.find((item) => item.id === "accent");
  assert.equal(accent?.animation?.keyframes.at(-1)?.atFrame, value.entries[2]!.stage.endFrameExclusive - value.entries[2]!.triggerFrame);
  assert.equal(settled.elements.some((item) => item.id === "accent"), false);
  const fourth = topSpec("fourth");
  let tooMany = appendTopThreeItem(set, fourth);
  assert.throws(() => buildTopThreeProgram(owner, frame,
    schedule(owner, [...semantic, fourth]), style, tooMany), /at most three/u);
});

test("Typewriter uses Unicode graphemes, explicit emphasis and winner timing without generic Text masquerading", () => {
  const owner = header("typewriter-list", "list");
  const first: TypewriterItemSpec = {
    ...typeSpec("first", "A👩‍💻B", true), emphasis: { start: 1, endExclusive: 2 },
  };
  const semantic = [first, typeSpec("second", "Done")];
  const style = decodeTypewriterListStyle(recipe("ranking.typewriter", {
    "frames-per-grapheme": 2, "winner-frames": 4,
  }), font).style;
  assert.deepEqual(graphemes(first.text), ["A", "👩‍💻", "B"]);
  let set = createTypewriterItemSet();
  set = appendTypewriterItem(set, first);
  set = appendTypewriterItem(set, semantic[1]!);
  const program = buildTypewriterListProgram(owner, "Tools", frame, schedule(owner, semantic), style, set);
  const track = renderTypewriterList(space, program);
  const row = track.presents.find((item) => item.id.endsWith(":item:first:stage"))!;
  const text = row.elements.find((item) => item.kind === "text-flow");
  assert.equal(text?.kind, "text-flow");
  assert.equal(text?.sequences[0]?.range.endExclusive, 3);
  const emphasis = text?.document.paragraphs[0]?.inlines[1];
  assert.equal(emphasis?.kind, "text");
  assert.equal(emphasis.kind === "text" ? emphasis.text : undefined, "👩‍💻");
  assert.ok(row.elements.some((item) => item.kind === "text" && item.text === "★"));
  assert.throws(() => buildTypewriterListProgram(owner, "Tools", frame, schedule(owner, semantic), {
    ...style, framesPerGrapheme: 20,
  }, set), /requires/u);
});

const sound = (id: string, sampleFrames = 4_800): SynchronizedMedia => ({
  contract: "svml.synchronized-media@1",
  timeline: { spanAuthority: "audio", frameRate: { numerator: 30, denominator: 1 }, frameCount: 3,
    sampleRate: 48_000, sampleFrames },
  sourceMap: {
    sourceOriginPts: { ticks: "0", timeBase: { numerator: 1, denominator: 48_000 } },
    sourceEndPts: { ticks: String(sampleFrames), timeBase: { numerator: 1, denominator: 48_000 } },
    audioTrimStartSamples: 0, audioTrimEndSamples: 0, audioHeadSamples: 0,
    audioContentSamples: sampleFrames, audioTailSamples: 0,
  },
  audio: {
    artifact: { kind: "blob", digest: digestOf(`ranking-sound:${id}`), size: 128, mediaType: "audio/wav" },
    sourceStreamIndex: 0, codec: "pcm_s16le", sampleRate: 48_000, channels: 2, sampleFrames, loudness: "preserved",
  },
});

test("visual and sound event plans share exact phase frames while absent sound stays an independent branch", () => {
  const owner = header("column", "sound-column");
  const semantic = [columnSpec("one"), columnSpec("two")];
  const decoded = decodeColumnStyle(recipe("ranking.column", {
    "appear-frames": 4, "move-frames": 6, "appear-gain": 0.8, "move-gain": 0.6,
  }), font);
  const value = schedule(owner, semantic);
  const events = buildColumnSoundEvents(value, decoded.style, specs(owner, semantic));
  assert.deepEqual(events.events.map((item) => [item.kind, item.frame]), [
    ["appear", 30], ["move", 64], ["appear", 70], ["move", 184],
  ]);
  let sounds = createRankingSoundSet();
  sounds = appendRankingSound(sounds, "appear", sound("appear"));
  sounds = appendRankingSound(sounds, "move", sound("move"));
  const audio = renderRankingAudio(space, events, decoded.sound, sounds);
  assert.deepEqual(audio.clips.map((clip) => clip.target.startSample), [48_000, 102_400, 112_000, 294_400]);
  assert.deepEqual(audio.clips.map((clip) => clip.gain), [0.8, 0.6, 0.8, 0.6]);
});

test("each component owns a distinct event law and repeated lowering is canonical", () => {
  const tierOwner = header("tier-board", "tier-events");
  const tierItems = [tierSpec("direct", "s"), tierSpec("stage", "a", "stage")];
  const tier = decodeTierBoardStyle(recipe("ranking.tier", { rows: "s:S:#ef4444|a:A:#22c55e" }), font).style;
  assert.deepEqual(buildTierBoardSoundEvents(schedule(tierOwner, tierItems), tier, specs(tierOwner, tierItems)).events.map((item) => item.kind),
    ["appear", "appear", "move"]);

  const topOwner = header("top-three", "top-events");
  const topItems = [topSpec("one")];
  const top = decodeTopThreeStyle(recipe("ranking.top"), font).style;
  assert.deepEqual(buildTopThreeSoundEvents(schedule(topOwner, topItems), top, specs(topOwner, topItems)).events.map((item) => item.kind), ["appear"]);

  const typeOwner = header("typewriter-list", "type-events");
  const typeItems = [typeSpec("winner", "ABC", true)];
  const type = decodeTypewriterListStyle(recipe("ranking.typewriter"), font).style;
  assert.deepEqual(buildTypewriterSoundEvents(schedule(typeOwner, typeItems), type, specs(typeOwner, typeItems)).events.map((item) => item.kind),
    ["appear", "move"]);

  const columnOwner = header("column", "deterministic");
  const columnItems = [columnSpec("one")];
  const columnStyle = decodeColumnStyle(recipe("ranking.column"), font).style;
  let set = appendColumnItem(createColumnItemSet(), columnItems[0]!);
  const program = buildColumnProgram(columnOwner, frame, schedule(columnOwner, columnItems), columnStyle, set);
  assert.deepEqual(renderColumn(space, program), renderColumn(space, program));
});

test("all four author Surfaces preserve explicit semantic, spatial, font, image and optional sound graph edges", async () => {
  createResolvedClosure([...videoContractManifests, textManifest, rankingManifest]);
  const range = { source: "ranking.svml", start: 0, end: 1 };
  const ref = (path: string): MarkupAttributeValue => ({ kind: "reference", path });
  const node = (name: string, attributes: Record<string, MarkupAttributeValue>, children: StructuredNode[] = []): StructuredElement => ({ kind: "element", name, attributes, children, range });
  const plain = (path: string, type: SurfaceResolvedReference["type"]): SurfaceResolvedReference => ({ path, ref: { kind: "record", id: path }, type });
  const inlineReference = (path: string, type: SurfaceResolvedReference["type"], value: unknown): SurfaceResolvedReference => ({
    path, ref: { kind: "record", id: path }, type,
    record: { value: { kind: "inline", value } } as never,
  });
  const references = new Map<string, SurfaceResolvedReference>([
    ["map", plain("map", semanticMapTypes.complete)],
    ["space", plain("space", programSpaceTypes.programSpace)],
    ["frame", plain("frame", spatialTypes.frame)],
    ["outer", plain("outer", narrativeTypes.selection)],
    ["triggers", plain("triggers", narrativeTypes.moment)],
    ["terminal", plain("terminal", narrativeTypes.moment)],
    ["icon-1", plain("icon-1", mediaTypes.blobArtifact)],
    ["icon-2", plain("icon-2", mediaTypes.blobArtifact)],
    ["appear", plain("appear", mediaTypes.synchronized)],
    ["move", plain("move", mediaTypes.synchronized)],
    ["font", inlineReference("font", mediaTypes.fontArtifact, font)],
    ["copy", inlineReference("copy", textTypes.text, sealText("Dynamic ranking copy"))],
  ]);
  const styleCases = [
    ["tier-style", rankingTypes.tierStyle, decodeTierBoardStyleSurface, { rows: "s:S:#ef4444|a:A:#22c55e" }],
    ["column-style", rankingTypes.columnStyle, decodeColumnStyleSurface, {}],
    ["top-style", rankingTypes.topThreeStyle, decodeTopThreeStyleSurface, {}],
    ["type-style", rankingTypes.typewriterStyle, decodeTypewriterListStyleSurface, {}],
  ] as const;
  for (const [id, type, handler, properties] of styleCases) {
    references.set(`${id}-recipe`, inlineReference(`${id}-recipe`, svsRecipeType, recipe(id, properties)));
    const result = await handler({
      sourceName: "ranking.svml",
      element: node(`ranking:${type.name.replace(/Style$/u, "Style")}`, { id, recipe: ref(`${id}-recipe`), font: ref("font") }),
      resolveReference: (path) => references.get(path),
      resolveAsset: async () => { throw new Error("no asset resolution expected"); },
    });
    assert.deepEqual(result.records.map((record) => record.id), [id, `${id}.sound`]);
    const visualRecord = result.records[0]!;
    const soundRecord = result.records[1]!;
    references.set(id, { path: id, ref: { kind: "record", id }, type, record: visualRecord as never });
    references.set(`${id}.sound`, { path: `${id}.sound`, ref: { kind: "record", id: `${id}.sound` }, type: rankingTypes.soundStyle, record: soundRecord as never });
  }
  const cases = [
    [decodeTierBoardSurface, node("ranking:TierBoard", {
      id: "tier", map: ref("map"), space: ref("space"), frame: ref("frame"), during: ref("outer"),
      triggers: ref("triggers"), terminal: ref("terminal"), style: ref("tier-style"),
    }, [node("ranking:TierItem", { id: "tier-one", tier: "s", entry: "stage", icon: ref("icon-1") })])],
    [decodeColumnSurface, node("ranking:Column", {
      id: "column", map: ref("map"), space: ref("space"), frame: ref("frame"), during: ref("outer"),
      triggers: ref("triggers"), terminal: ref("terminal"), style: ref("column-style"),
      "appear-sound": ref("appear"), "move-sound": ref("move"),
    }, [node("ranking:ColumnItem", { id: "column-one", label: ref("copy") }), node("ranking:ColumnItem", { id: "column-two", label: "Two", icon: ref("icon-2") })])],
    [decodeTopThreeSurface, node("ranking:TopThree", {
      id: "top", map: ref("map"), space: ref("space"), frame: ref("frame"), during: ref("outer"),
      triggers: ref("triggers"), terminal: ref("terminal"), style: ref("top-style"),
    }, [node("ranking:TopThreeItem", { label: "First" }), node("ranking:TopThreeItem", { label: "Second", icon: ref("icon-1") })])],
    [decodeTypewriterListSurface, node("ranking:TypewriterList", {
      id: "typed", title: "Proof", map: ref("map"), space: ref("space"), frame: ref("frame"), during: ref("outer"),
      triggers: ref("triggers"), terminal: ref("terminal"), style: ref("type-style"),
    }, [node("ranking:TypewriterItem", { winner: "true", "emphasis-start": "1", "emphasis-end": "2" }, [{ kind: "text", value: "A👩‍💻B", range }])])],
  ] as const;
  for (const [handler, element] of cases) {
    const result = await handler({
      sourceName: "ranking.svml", element,
      resolveReference: (path) => references.get(path),
      resolveAsset: async () => { throw new Error("no asset resolution expected"); },
    });
    assert.equal(result.components.length, 1);
    assert.equal(result.fragments.length, 1);
    const fragment = result.fragments[0]!;
    assert.ok(fragment.exports.some((output) => output.name === "schedule"));
    assert.ok(fragment.exports.some((output) => output.name === "program"));
    assert.ok(fragment.exports.some((output) => output.name === "visual"));
    assert.ok(fragment.exports.find((output) => output.name === "visual")?.semanticInputs.includes("frame"));
  }
  const column = await decodeColumnSurface({
    sourceName: "ranking.svml", element: cases[1][1],
    resolveReference: (path) => references.get(path),
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  const audio = column.fragments[0]!.exports.find((output) => output.name === "audio");
  assert.ok(column.fragments[0]!.operations.some((operation) => operation.producer.name === rankingProducers.materializeTextItem.name));
  assert(audio !== undefined);
  assert.equal(audio.semanticInputs.includes("frame"), false);
  assert.equal(audio.semanticInputs.some((name) => name.endsWith("icon")), false);
  assert.deepEqual(Object.keys(column.components[0]!.outputs).sort(), ["audio", "program", "schedule", "visual"]);
});

test("Ranking author Surfaces fail closed on impossible image and sound combinations", async () => {
  const range = { source: "ranking.svml", start: 0, end: 1 };
  const ref = (path: string): MarkupAttributeValue => ({ kind: "reference", path });
  const plain = (path: string, type: SurfaceResolvedReference["type"]): SurfaceResolvedReference => ({ path, ref: { kind: "record", id: path }, type });
  const references = new Map<string, SurfaceResolvedReference>([
    ["map", plain("map", semanticMapTypes.complete)], ["space", plain("space", programSpaceTypes.programSpace)],
    ["frame", plain("frame", spatialTypes.frame)], ["outer", plain("outer", narrativeTypes.selection)],
    ["triggers", plain("triggers", narrativeTypes.moment)], ["terminal", plain("terminal", narrativeTypes.moment)],
    ["style", plain("style", rankingTypes.tierStyle)], ["style.sound", plain("style.sound", rankingTypes.soundStyle)],
    ["move", plain("move", mediaTypes.synchronized)],
  ]);
  const common = { id: "bad", map: ref("map"), space: ref("space"), frame: ref("frame"), during: ref("outer"), triggers: ref("triggers"), terminal: ref("terminal"), style: ref("style") };
  const context = (element: StructuredElement) => ({
    sourceName: "ranking.svml", element, resolveReference: (path: string) => references.get(path),
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  assert.throws(() => decodeTierBoardSurface(context({
    kind: "element", name: "ranking:TierBoard", attributes: common,
    children: [{ kind: "element", name: "ranking:TierItem", attributes: { tier: "s" }, children: [], range }], range,
  })), /icon/u);
  assert.throws(() => decodeTierBoardSurface(context({
    kind: "element", name: "ranking:TierBoard", attributes: { ...common, "move-sound": ref("move") },
    children: [{ kind: "element", name: "ranking:TierItem", attributes: { tier: "s", icon: ref("missing") }, children: [], range }], range,
  })), /wrong Type|move-sound/u);
});
