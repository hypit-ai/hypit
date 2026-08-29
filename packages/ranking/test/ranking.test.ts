import assert from "node:assert/strict";
import test from "node:test";
import { videoContractManifests } from "../../../test/support/video-domain.js";
import { fixtureDigest } from "../../../test/fixture-digest.js";
import { semanticTrackFixture } from "../../../test/semantic-track-fixture.js";
import { projectMomentInstantFixture, projectSegmentWindow, projectSelectionWindow } from "../../../test/temporal-fixture.js";

import { createResolvedClosure } from "@hypit/core";
import type { FontArtifactRef, SynchronizedMedia } from "@hypit/media";
import { mediaTypes } from "@hypit/media";
import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { sealProgramSpace } from "@hypit/program-space";
import { sealCanvasSpace, sealSpatialFrame } from "@hypit/spatial";
import type { SvsRecipe } from "@hypit/svs";

import {
  appendColumnItem,
  appendColumnWindow,
  appendRankingItemSpec,
  appendRankingSound,
  appendTierBoardItem,
  appendTierBoardWindow,
  appendTopThreeItem,
  appendTriggeredRankingCandidate as appendProjectedTriggeredRankingCandidate,
  buildColumnProgram,
  buildColumnSchedule,
  buildColumnSoundEvents,
  buildTriggeredRankingSchedule,
  buildTierBoardProgram,
  buildTierBoardSchedule,
  buildTierBoardSoundEvents,
  buildTopThreeProgram,
  buildTopThreeSoundEvents,
  createColumnItemSet,
  createColumnWindowSet,
  createRankingItemSpecSet,
  createRankingSoundSet,
  createTierBoardItemSet,
  createTierBoardWindowSet,
  createTopThreeItemSet,
  createTriggeredRankingCandidateSet,
  decodeColumnStyle,
  decodeColumnStyleSurface,
  decodeColumnSurface,
  directTierItemPose,
  decodeTierBoardStyle,
  decodeTierBoardStyleSurface,
  decodeTierBoardSurface,
  decodeTopThreeStyle,
  decodeTopThreeStyleSurface,
  decodeTopThreeSurface,
  fromHighTierItemPose,
  renderColumn,
  renderRankingAudio,
  renderTierBoard,
  renderTopThree,
  rankingComponent,
  rankingManifest,
  rankingMarkupSurfaces,
  rankingProducers,
  rankingTypes,
  resolveTierBoardMotion,
  sealRankingHeader,
  tierBoardGeometry,
  tierCell,
  tierStageGeometry,
} from "@hypit/ranking";
import type {
  ColumnItemSpec,
  ColumnSchedule,
  RankingHeader,
  RankingItemSpec,
  RankingItemSpecSet,
  TriggeredRankingSchedule,
  TriggeredRankingCandidateSet,
  TierBoardSchedule,
  TierBoardItemSpec,
  TopThreeItemSpec,
} from "@hypit/ranking";
import { narrativeTypes } from "@hypit/narrative";
import { semanticTrackTypes } from "@hypit/semantic-track";
import { spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import { sealText, textManifest, textTypes } from "@hypit/text";
import { temporalProducers } from "@hypit/temporal";
import type { TemporalWindow } from "@hypit/temporal";
import type {
  StructuredElement,
  StructuredNode,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@hypit/markup";

const space = sealProgramSpace({ id: "test-space", narrativeId: "test-narrative",
  durationSec: 8,
  frameRate: { numerator: 30, denominator: 1 },
});
const canvas = sealCanvasSpace({
  widthPx: 1080, heightPx: 1920,
  origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square",
});
const frame = sealSpatialFrame({
  xPx: 40, yPx: 80, widthPx: 720, heightPx: 560,
});
const tierFrame = sealSpatialFrame({
  xPx: 40, yPx: 360, widthPx: 720, heightPx: 280,
});
const semanticTrack = semanticTrackFixture(space, {
  segments: [
    { id: "opening", frameCount: 10 },
    { id: "ranking", frameCount: 220 },
    { id: "ending", frameCount: 10 },
  ],
  anchors: [
    { identity: "outer-start", frame: 10 },
    { identity: "early-start", frame: 25 },
    { identity: "one", frame: 30 },
    { identity: "early-end", frame: 65 },
    { identity: "overlap-start", frame: 55 },
    { identity: "two", frame: 70 },
    { identity: "overlap-end", frame: 95 },
    { identity: "three", frame: 110 },
    { identity: "late-start", frame: 120 },
    { identity: "four", frame: 150 },
    { identity: "late-end", frame: 160 },
    { identity: "terminal", frame: 190 },
    { identity: "outer-end", frame: 230 },
  ],
});
const outer: NarrativeSelectionRef = {
  narrativeId: space.narrativeId,
  id: "ranking-window",
  startAnchorId: "outer-start",
  endAnchorId: "outer-end",
};
const terminal: NarrativeMomentRef = {
  narrativeId: space.narrativeId,
  id: "ranking-complete",
  anchorId: "terminal",
};
const rankingSegment: NarrativeExcerpt = { narrativeId: space.narrativeId, kind: "segment", id: "ranking", tokenStart: 0, tokenEndExclusive: 1 };
const selection = (id: string, startAnchorId: string, endAnchorId: string): NarrativeSelectionRef => ({
  narrativeId: space.narrativeId, id, startAnchorId, endAnchorId,
});
const early = selection("early", "early-start", "early-end");
const overlapping = selection("overlapping", "overlap-start", "overlap-end");
const middle = selection("middle", "early-end", "overlap-end");
const late = selection("late", "late-start", "late-end");
const triggerAnchors = ["one", "two", "three", "four"] as const;
const font: FontArtifactRef = {
  sources: [{ artifact: { kind: "blob", digest: fixtureDigest("ranking-font"), size: 32, mediaType: "font/woff2" } }],
  weight: 700,
  style: "normal",
};
const recipe = (path: string, properties: SvsRecipe["properties"] = {}): SvsRecipe => ({
  path, properties,
});
const image = (id: string) => ({ kind: "blob" as const, digest: fixtureDigest(`ranking-image:${id}`), size: 64, mediaType: "image/png" });
const header = (variant: RankingHeader["variant"], id: string = variant) => sealRankingHeader({
  id, variant,
});

function specs(headerValue: RankingHeader, values: readonly RankingItemSpec[]) {
  let set = createRankingItemSpecSet(headerValue);
  for (const value of values) set = appendRankingItemSpec(set, value);
  return set;
}

function schedule(
  headerValue: RankingHeader,
  values: readonly RankingItemSpec[],
  anchors: readonly string[] = triggerAnchors,
): TriggeredRankingSchedule {
  let candidates = createTriggeredRankingCandidateSet();
  for (const [index, value] of values.entries()) {
    candidates = appendTriggeredRankingCandidate(candidates, value, semanticTrack, {
      narrativeId: space.narrativeId,
      id: `${value.id}-moment`,
      anchorId: anchors[index]!,
    });
  }
  return buildRankingSchedule({ header: headerValue, items: specs(headerValue, values), semantic: semanticTrack, outer, candidates, terminal });
}

function appendTriggeredRankingCandidate(
  set: ReturnType<typeof createTriggeredRankingCandidateSet>, spec: RankingItemSpec,
  semantic: typeof semanticTrack, moment: NarrativeMomentRef,
) {
  return appendProjectedTriggeredRankingCandidate(set, spec, projectMomentInstantFixture({
    itemId: spec.id, semantic, moment,
    projection: { ref: "moment.cue" },
  }));
}

function buildRankingSchedule(input: {
  readonly header: RankingHeader;
  readonly items: RankingItemSpecSet;
  readonly semantic: typeof semanticTrack;
  readonly outer: NarrativeSelectionRef;
  readonly candidates: TriggeredRankingCandidateSet;
  readonly terminal: NarrativeMomentRef;
}): TriggeredRankingSchedule {
  return buildTriggeredRankingSchedule({
    header: input.header,
    items: input.items,
    space,
    outer: projectSelectionWindow({
      itemId: input.outer.id, subjectId: input.header.id, semantic: input.semantic, selection: input.outer,
      projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
    }),
    candidates: input.candidates,
    terminal: projectMomentInstantFixture({
      itemId: input.terminal.id, subjectId: input.header.id, semantic: input.semantic, moment: input.terminal,
      projection: { ref: "moment.cue" },
    }),
  });
}

function appendProjectedColumnWindow(
  set: ReturnType<typeof createColumnWindowSet>, spec: ColumnItemSpec,
  semantic: typeof semanticTrack, selection: NarrativeSelectionRef,
) {
  return appendColumnWindow(set, spec, projectSelectionWindow({
    itemId: spec.id, semantic, selection,
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  }));
}

function appendProjectedTierWindow(
  set: ReturnType<typeof createTierBoardWindowSet>, spec: TierBoardItemSpec,
  semantic: typeof semanticTrack, selectionValue: NarrativeSelectionRef,
) {
  return appendTierBoardWindow(set, spec, projectSelectionWindow({
    itemId: spec.id, semantic, selection: selectionValue,
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  }));
}

function projectColumnSegmentOuterWindow(semantic: typeof semanticTrack, segment: NarrativeExcerpt, subjectId: string): TemporalWindow {
  return projectSegmentWindow({
    itemId: `${segment.id}:outer`, subjectId, semantic, segment,
    projection: { start: { ref: "segment.start" }, end: { ref: "segment.end" } },
  });
}

const tierSpec = (id: string, tier: string, entry: "direct" | "drop" = "direct", preset = false): TierBoardItemSpec => ({
  variant: "tier-board", id, tier, ...(preset ? { preset: true } : { preset: false, entry }),
} as TierBoardItemSpec);
const columnSpec = (id: string, rank: number, preset = false): ColumnItemSpec => ({
  variant: "column", id, label: id.toUpperCase(), rank, preset,
});
const topSpec = (id: string): TopThreeItemSpec => ({
  variant: "top-three", id, label: id.toUpperCase(),
});

function columnSchedule(
  owner: RankingHeader,
  values: readonly ColumnItemSpec[],
  windows: Readonly<Record<string, NarrativeSelectionRef>>,
  outerWindow = projectColumnSegmentOuterWindow(semanticTrack, rankingSegment, owner.id),
): ColumnSchedule {
  let set = createColumnWindowSet();
  for (const value of values) {
    if (value.preset) continue;
    const timing = windows[value.id];
    if (timing === undefined) throw new Error(`Missing test Selection for ${value.id}.`);
    set = appendProjectedColumnWindow(set, value, semanticTrack, timing);
  }
  return buildColumnSchedule({ header: owner, items: specs(owner, values), space, outer: outerWindow, windows: set });
}

function tierSchedule(
  owner: RankingHeader,
  values: readonly TierBoardItemSpec[],
  windows: Readonly<Record<string, NarrativeSelectionRef>>,
  outerWindow = projectSelectionWindow({
    itemId: outer.id, subjectId: owner.id, semantic: semanticTrack, selection: outer,
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  }),
): TierBoardSchedule {
  let set = createTierBoardWindowSet();
  for (const value of values) {
    if (value.preset) continue;
    const timing = windows[value.id];
    if (timing === undefined) throw new Error(`Missing test Selection for ${value.id}.`);
    set = appendProjectedTierWindow(set, value, semanticTrack, timing);
  }
  return buildTierBoardSchedule({ header: owner, items: specs(owner, values), space, outer: outerWindow, windows: set });
}

test("RankingSchedule derives chronological Item order from item-owned Moments and preserves a settled suffix", () => {
  const owner = header("top-three", "tools");
  const value = schedule(owner, [topSpec("fourth"), topSpec("third"), topSpec("second")]);
  assert.deepEqual(value.entries.map((entry) => [entry.itemId, entry.stage, entry.cumulative]), [
    ["fourth", { startFrame: 30, endFrameExclusive: 70 }, { startFrame: 30, endFrameExclusive: 230 }],
    ["third", { startFrame: 70, endFrameExclusive: 110 }, { startFrame: 70, endFrameExclusive: 230 }],
    ["second", { startFrame: 110, endFrameExclusive: 190 }, { startFrame: 110, endFrameExclusive: 230 }],
  ]);
  assert.deepEqual(value.entries.at(-1)?.settled, { startFrame: 190, endFrameExclusive: 230 });
});

test("RankingSchedule requires one item-owned Moment per Item and distinct chronological frames", () => {
  const owner = header("top-three");
  const values = [topSpec("a"), topSpec("b")];
  let missing = createTriggeredRankingCandidateSet();
  missing = appendTriggeredRankingCandidate(missing, values[0]!, semanticTrack, { narrativeId: space.narrativeId, id: "a-at", anchorId: "one" });
  assert.throws(() => buildRankingSchedule({
    header: owner, items: specs(owner, values), semantic: semanticTrack, outer, candidates: missing, terminal,
  }), /item-owned Moments differ/u);
  assert.throws(() => schedule(owner, values, ["one", "one"]), /strictly increasing/u);
});

test("variant Style decoders reject unknown Recipes and keep exact fonts and independent stacks", () => {
  const tier = decodeTierBoardStyle(recipe("ranking.tier", {
    rows: [{ id: "s", label: "S", color: "#ef4444" }, { id: "a", label: "A", color: "#22c55e" }], "board-stack": 8, "item-stack": 31,
  }), font);
  assert.deepEqual(tier.style.rows.map((row) => row.id), ["s", "a"]);
  assert.equal(tier.style.fonts[0]?.sources[0]?.artifact.digest, font.sources[0]!.artifact.digest);
  assert.deepEqual([tier.style.boardStackingOrder, tier.style.itemStackingOrder], [8, 31]);
  assert.throws(() => decodeTierBoardStyle(recipe("ranking.tier", { padding: 18 }), font), /does not accept padding/u);
  assert.throws(() => decodeColumnStyle(recipe("ranking.column", { "tier-only": 1 }), font), /does not accept/u);
  assert.equal(decodeTopThreeStyle(recipe("ranking.top"), font).style.slotColors.length, 3);
  assert.throws(() => decodeTopThreeStyle(recipe("ranking.top", {
    "slot-colors": ["#111111", "#222222", "#333333", "#444444"],
  }), font), /exactly three/u);
});

test("TierBoard separates its board Frame from the Canvas stage and holds drop Items until the final curved glide", () => {
  const owner = header("tier-board", "tiers");
  const semantic = [
    tierSpec("late", "s", "drop"),
    tierSpec("preset", "s", "direct", true),
    tierSpec("early", "s"),
  ];
  const style = decodeTierBoardStyle(recipe("ranking.tier", {
    rows: [{ id: "s", label: "S", color: "#ef4444" }, { id: "a", label: "A", color: "#22c55e" }], "appear-frames": 5, "move-frames": 8,
  }), font).style;
  let set = createTierBoardItemSet();
  for (const item of semantic) set = appendTierBoardItem(set, item, image(item.id));
  const value = tierSchedule(owner, semantic, { early, late });
  const program = buildTierBoardProgram(owner, canvas, tierFrame, value, style, set);
  const track = renderTierBoard(space, program);
  assert.deepEqual(value.entries.map((entry) => entry.itemId), ["preset", "early", "late"]);
  assert.deepEqual(program.items.map((item) => item.id), ["preset", "early", "late"]);
  assert.equal(track.presents.some((item) => item.id.endsWith(":item:preset:reveal")), false);
  assert.equal(track.presents.find((item) => item.id.endsWith(":item:preset:settled"))?.span.startFrame, 10);
  const direct = track.presents.find((item) => item.id.endsWith(":item:early:reveal"))!;
  const drop = track.presents.find((item) => item.id.endsWith(":item:late:reveal"))!;
  assert.ok(direct.elements[0]?.animation);
  const geometry = tierBoardGeometry(tierFrame.widthPx, tierFrame.heightPx, style);
  const stage = tierStageGeometry(canvas.widthPx, canvas.heightPx, style);
  assert.deepEqual({
    rowHeight: geometry.rowHeight, labelWidth: geometry.labelWidth,
    gap: geometry.gap, iconSize: geometry.iconSize,
  }, { rowHeight: 140, labelWidth: 210, gap: 4, iconSize: 132 });
  assert.deepEqual(stage, { centerX: 216, centerY: 576, size: 168 });
  const boardRow = track.presents.find((item) => item.id.endsWith(":board"))?.elements
    .find((item) => item.id === "tier-row-s");
  assert.equal(boardRow?.style.find((item) => item.name === "top")?.value, "0px");
  const relativeCell = tierCell(geometry, 0, 2);
  const cell = { x: tierFrame.xPx + relativeCell.x, y: tierFrame.yPx + relativeCell.y, size: relativeCell.size };
  const duration = 40;
  const phases = resolveTierBoardMotion(duration, style.motion.appearFrames, style.motion.moveFrames);
  assert.deepEqual(phases, { appearEndFrame: 5, moveStartFrame: 32, moveEndFrame: 40 });
  const directMiddle = directTierItemPose(4, cell, 8);
  assert.deepEqual([directMiddle.x, directMiddle.y], [cell.x, cell.y]);
  assert.ok(directMiddle.scale > 1, "direct entrance overshoots in place before settling");
  const stageMiddle = fromHighTierItemPose(4, duration, stage, cell, 8, 8);
  assert.deepEqual([stageMiddle.x, stageMiddle.y], [stage.centerX - cell.size / 2, stage.centerY - cell.size / 2]);
  assert.ok(stageMiddle.scale > stage.size / cell.size, "stage entrance overshoots in place before settling");
  assert.deepEqual(fromHighTierItemPose(20, duration, stage, cell, 5, 8), {
    x: stage.centerX - cell.size / 2, y: stage.centerY - cell.size / 2, scale: stage.size / cell.size,
    opacity: 1, rotateDeg: 0, blurPx: 0,
    shadowY: 16, shadowBlur: 24, shadowOpacity: 0.3,
  });
  const curvedMiddle = fromHighTierItemPose(36, duration, stage, cell, 5, 8);
  assert.notEqual(curvedMiddle.x, stage.centerX - cell.size / 2);
  assert.ok(curvedMiddle.y < ((stage.centerY - cell.size / 2) + cell.y) / 2,
    "drop motion follows an arc above the linear midpoint");
  assert.equal(fromHighTierItemPose(40, duration, stage, cell, 5, 8).x, cell.x);
  assert.equal(drop.elements[0]?.animation?.keyframes.find((item) => item.atFrame === 20)
    ?.style.find((item) => item.name === "transform")?.value,
  "translate(-376px,146px) scale(1.272727) rotate(0deg)");
  assert.deepEqual(buildTierBoardSoundEvents(value, style, specs(owner, semantic)).events
    .map((item) => [item.kind, item.frame]), [["appear", 25], ["appear", 120], ["move", 152]]);
  assert.throws(() => tierSchedule(owner, [semantic[0]!, semantic[2]!], { late: overlapping, early }), /overlap/u);
});

test("Column consumes explicit disjoint reveal windows without changing them", () => {
  const owner = header("column", "column");
  const semantic = [
    columnSpec("late-rank-one", 1),
    columnSpec("preset-rank-three", 3, true),
    columnSpec("early-rank-five", 5),
    columnSpec("overlap-rank-two", 2),
  ];
  const style = decodeColumnStyle(recipe("ranking.column", { "appear-frames": 4, "move-frames": 6 }), font).style;
  let set = createColumnItemSet();
  set = appendColumnItem(set, semantic[0]!);
  set = appendColumnItem(set, semantic[1]!, image("preset"));
  set = appendColumnItem(set, semantic[2]!);
  set = appendColumnItem(set, semantic[3]!, image("overlap"));
  const outerWindow = projectColumnSegmentOuterWindow(semanticTrack, rankingSegment, owner.id);
  assert.deepEqual(outerWindow.span, { startFrame: 10, endFrameExclusive: 230 });
  const value = columnSchedule(owner, semantic, {
    "late-rank-one": late,
    "early-rank-five": early,
    "overlap-rank-two": middle,
  }, outerWindow);
  const program = buildColumnProgram(owner, canvas, frame, value, style, set);
  const track = renderColumn(space, program);
  assert.deepEqual(program.items.map((item) => [item.id, item.rank]), [
    ["late-rank-one", 1], ["overlap-rank-two", 2], ["preset-rank-three", 3], ["early-rank-five", 5],
  ]);
  const windows = value.entries.filter((entry) => entry.mode === "reveal")
    .map((entry) => [entry.itemId, entry.window]);
  assert.deepEqual(windows, [
    ["late-rank-one", { startFrame: 120, endFrameExclusive: 160 }],
    ["overlap-rank-two", { startFrame: 65, endFrameExclusive: 95 }],
    ["early-rank-five", { startFrame: 25, endFrameExclusive: 65 }],
  ]);
  const preset = value.entries.find((entry) => entry.itemId === "preset-rank-three")!;
  assert.deepEqual(preset, { itemId: "preset-rank-three", mode: "preset", settled: outerWindow.span });
  const stages = track.presents.filter((item) => item.id.includes(":item:") && item.id.endsWith(":stage"));
  assert.deepEqual(stages.map((item) => item.span.startFrame).sort((a, b) => a - b), [25, 65, 120]);
  assert.equal(stages.find((item) => item.id.includes("overlap-rank-two"))?.elements.some((item) => item.kind === "image"), true);
  assert.equal(track.presents.some((item) => item.id.endsWith(":item:preset-rank-three:stage")), false);
  assert.equal(track.presents.find((item) => item.id.endsWith(":item:preset-rank-three:settled"))?.span.startFrame, 10);
});

test("Column rejects overlapping or out-of-bounds reveal windows", () => {
  const owner = header("column", "strict-column");
  const values = [columnSpec("one", 1), columnSpec("two", 2)];
  assert.throws(() => columnSchedule(owner, values, { one: early, two: overlapping }),
    /windows one and two overlap/u);

  const outerWindow = projectColumnSegmentOuterWindow(semanticTrack, rankingSegment, owner.id);
  let windows = createColumnWindowSet();
  const projected = projectSelectionWindow({
    itemId: "one", semantic: semanticTrack, selection: early,
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  });
  windows = appendColumnWindow(windows, values[0]!, {
    ...projected,
    start: { ...projected.start, frame: outerWindow.span.startFrame - 1 },
    span: { startFrame: outerWindow.span.startFrame - 1, endFrameExclusive: projected.span.endFrameExclusive },
  });
  assert.throws(() => buildColumnSchedule({
    header: owner, items: specs(owner, [values[0]!]), space, outer: outerWindow, windows,
  }), /one window is outside/u);
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

const sound = (id: string): SynchronizedMedia => ({
  timeline: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 3 },
  audio: {
    artifact: { kind: "blob", digest: fixtureDigest(`ranking-sound:${id}`), size: 128, mediaType: "audio/wav" },
  },
});

test("visual and sound event plans share exact phase frames while absent sound stays an independent branch", () => {
  const owner = header("column", "sound-column");
  const semantic = [columnSpec("one", 7), columnSpec("two", 2)];
  const decoded = decodeColumnStyle(recipe("ranking.column", {
    "appear-frames": 4, "move-frames": 6, "appear-gain": 0.8, "move-gain": 0.6,
  }), font);
  const value = columnSchedule(owner, semantic, { one: early, two: middle });
  const events = buildColumnSoundEvents(value, decoded.style, specs(owner, semantic));
  assert.deepEqual(events.events.map((item) => [item.kind, item.frame]), [
    ["appear", 25], ["move", 59], ["appear", 65], ["move", 89],
  ]);
  let sounds = createRankingSoundSet();
  sounds = appendRankingSound(sounds, "appear", sound("appear"));
  sounds = appendRankingSound(sounds, "move", sound("move"));
  const audio = renderRankingAudio(space, events, decoded.sound, sounds);
  assert.deepEqual(audio.clips.map((clip) => clip.target.startSample), [40_000, 94_400, 104_000, 142_400]);
  assert.deepEqual(audio.clips.map((clip) => clip.gain), [0.8, 0.6, 0.8, 0.6]);
});

test("each component owns a distinct event law and repeated lowering is canonical", () => {
  const tierOwner = header("tier-board", "tier-events");
  const tierItems = [tierSpec("direct", "s"), tierSpec("drop", "a", "drop")];
  const tier = decodeTierBoardStyle(recipe("ranking.tier", { rows: [{ id: "s", label: "S", color: "#ef4444" }, { id: "a", label: "A", color: "#22c55e" }] }), font).style;
  assert.deepEqual(buildTierBoardSoundEvents(tierSchedule(tierOwner, tierItems, { direct: early, drop: late }), tier, specs(tierOwner, tierItems)).events.map((item) => item.kind),
    ["appear", "appear", "move"]);

  const topOwner = header("top-three", "top-events");
  const topItems = [topSpec("one")];
  const top = decodeTopThreeStyle(recipe("ranking.top"), font).style;
  assert.deepEqual(buildTopThreeSoundEvents(schedule(topOwner, topItems), top, specs(topOwner, topItems)).events.map((item) => item.kind), ["appear"]);

  const columnOwner = header("column", "deterministic");
  const columnItems = [columnSpec("one", 3)];
  const columnStyle = decodeColumnStyle(recipe("ranking.column"), font).style;
  let set = appendColumnItem(createColumnItemSet(), columnItems[0]!);
  const program = buildColumnProgram(columnOwner, canvas, frame, columnSchedule(columnOwner, columnItems, { one: early }), columnStyle, set);
  assert.deepEqual(renderColumn(space, program), renderColumn(space, program));
});

test("all three author Surfaces preserve explicit semantic, spatial, font, image and optional sound graph edges", async () => {
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
    ["semantic", plain("semantic", semanticTrackTypes.track)],
    ["canvas", plain("canvas", spatialTypes.canvas)],
    ["frame", plain("frame", spatialTypes.frame)],
    ["outer", plain("outer", narrativeTypes.selection)],
    ["ranking-segment", plain("ranking-segment", narrativeTypes.excerpt)],
    ["tier-reveal", plain("tier-reveal", narrativeTypes.selection)],
    ["column-reveal", plain("column-reveal", narrativeTypes.selection)],
    ["moment-one", plain("moment-one", narrativeTypes.moment)],
    ["moment-two", plain("moment-two", narrativeTypes.moment)],
    ["terminal", plain("terminal", narrativeTypes.moment)],
    ["icon-1", plain("icon-1", mediaTypes.blobArtifact)],
    ["icon-2", plain("icon-2", mediaTypes.blobArtifact)],
    ["appear", plain("appear", mediaTypes.synchronized)],
    ["move", plain("move", mediaTypes.synchronized)],
    ["font", inlineReference("font", mediaTypes.fontArtifact, font)],
    ["copy", inlineReference("copy", textTypes.text, sealText("Dynamic ranking copy"))],
  ]);
  const styleCases = [
    ["tier-style", rankingTypes.tierStyle, decodeTierBoardStyleSurface, { rows: [{ id: "s", label: "S", color: "#ef4444" }, { id: "a", label: "A", color: "#22c55e" }] }],
    ["column-style", rankingTypes.columnStyle, decodeColumnStyleSurface, {}],
    ["top-style", rankingTypes.topThreeStyle, decodeTopThreeStyleSurface, {}],
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
      id: "tier", semantic: ref("semantic"), canvas: ref("canvas"), frame: ref("frame"), during: "program",
      style: ref("tier-style"),
    }, [node("ranking:TierItem", { id: "tier-one", tier: "s", entry: "drop", icon: ref("icon-1"), during: ref("ranking-segment") })])],
    [decodeColumnSurface, node("ranking:Column", {
      id: "column", semantic: ref("semantic"), canvas: ref("canvas"), frame: ref("frame"), during: ref("ranking-segment"),
      style: ref("column-style"),
      "appear-sound": ref("appear"), "move-sound": ref("move"),
    }, [
      node("ranking:ColumnItem", { id: "column-one", rank: "1", label: ref("copy"), during: ref("column-reveal") }),
      node("ranking:ColumnItem", { id: "column-two", rank: "5", preset: "true", label: "Two", icon: ref("icon-2") }),
    ])],
    [decodeTopThreeSurface, node("ranking:TopThree", {
      id: "top", semantic: ref("semantic"), frame: ref("frame"), during: ref("outer"),
      terminal: ref("terminal"), style: ref("top-style"),
    }, [node("ranking:TopThreeItem", { label: "First", at: ref("moment-one") }), node("ranking:TopThreeItem", { label: "Second", icon: ref("icon-1"), at: ref("moment-two") })])],
  ] as const;
  for (const [handler, element] of cases) {
    const result = await handler({
      sourceName: "ranking.svml", element,
      resolveReference: (path) => references.get(path),
      resolveAsset: async () => { throw new Error("no asset resolution expected"); },
    });
    assert.equal(result.components.filter((component) => component.outputs.visual !== undefined).length, 1);
    const fragment = result.fragments.find((candidate) => candidate.exports.some((output) => output.name === "visual"))!;
    assert.ok(fragment.exports.some((output) => output.name === "schedule"));
    assert.ok(fragment.exports.some((output) => output.name === "program"));
    assert.ok(fragment.exports.some((output) => output.name === "visual"));
    assert.ok(fragment.inputs.some((input) => input.name === "frame"));
    const temporalSubjects = new Set(result.records.flatMap((record) =>
      record.value.kind === "inline"
        && typeof record.value.value === "object"
        && record.value.value !== null
        && "subjectId" in record.value.value
        ? [String((record.value.value as { readonly subjectId: unknown }).subjectId)]
        : []));
    assert.ok(temporalSubjects.has(String(element.attributes.id)));
    for (const child of element.children) {
      if (child.kind === "element" && child.attributes.id !== undefined && child.attributes.preset !== "true") {
        assert.ok(temporalSubjects.has(String(child.attributes.id)));
      }
    }
  }
  const programTier = await decodeTierBoardSurface({
    sourceName: "ranking.svml", element: cases[0][1],
    resolveReference: (path) => references.get(path),
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  const tierFragment = programTier.fragments.find((candidate) => candidate.exports.some((output) => output.name === "visual"))!;
  assert.equal(tierFragment.inputs.find((input) => input.name === "outer")?.type.name, "TemporalWindow");
  assert.ok(programTier.fragments.some((fragment) => fragment.operations.some((operation) =>
    operation.producer.name === temporalProducers.projectProgramInstant.name)));
  assert.ok(programTier.fragments.some((fragment) => fragment.operations.some((operation) =>
    operation.producer.name === temporalProducers.projectSegmentInstant.name)));
  const column = await decodeColumnSurface({
    sourceName: "ranking.svml", element: cases[1][1],
    resolveReference: (path) => references.get(path),
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  const columnFragment = column.fragments.find((candidate) => candidate.exports.some((output) => output.name === "visual"))!;
  const audio = columnFragment.exports.find((output) => output.name === "audio");
  assert.ok(columnFragment.operations.some((operation) => operation.producer.name === rankingProducers.materializeTextItem.name));
  assert(audio !== undefined);
  assert.deepEqual(Object.keys(column.components.find((component) => component.outputs.visual !== undefined)!.outputs).sort(), ["audio", "program", "schedule", "visual"]);
});

test("Ranking Surfaces declare their sealed Records and icon Producers consume Blob values", async () => {
  for (const name of ["column", "top-three"]) {
    const surface = rankingMarkupSurfaces.find((item) => item.name === name);
    assert.ok(surface?.outputs.some((type) => type.name === rankingTypes.header.name), `${name} header output`);
    assert.ok(surface?.outputs.some((type) => type.name === rankingTypes.itemSpec.name), `${name} item output`);
  }

  const producer = rankingComponent.producers.find((item) =>
    item.producer.name === rankingProducers.appendTierItem.name);
  assert.ok(producer !== undefined);
  const icon = image("producer");
  const result = await producer.handler({
    inputs: {
      set: { value: { kind: "inline", value: createTierBoardItemSet() } },
      spec: { value: { kind: "inline", value: tierSpec("one", "s") } },
      icon: { value: icon },
    },
  } as never);
  const set = (result.outputs as { readonly set: { readonly kind: "inline"; readonly value: unknown } }).set;
  assert.equal(set.kind, "inline");
  assert.deepEqual((set.value as { readonly items: readonly { readonly icon: unknown }[] }).items[0]?.icon, icon);
});

test("Ranking author Surfaces fail closed on impossible image and sound combinations", async () => {
  const range = { source: "ranking.svml", start: 0, end: 1 };
  const ref = (path: string): MarkupAttributeValue => ({ kind: "reference", path });
  const plain = (path: string, type: SurfaceResolvedReference["type"]): SurfaceResolvedReference => ({ path, ref: { kind: "record", id: path }, type });
  const references = new Map<string, SurfaceResolvedReference>([
    ["semantic", plain("semantic", semanticTrackTypes.track)],
    ["canvas", plain("canvas", spatialTypes.canvas)],
    ["frame", plain("frame", spatialTypes.frame)], ["outer", plain("outer", narrativeTypes.selection)],
    ["icon", plain("icon", mediaTypes.blobArtifact)],
    ["style", plain("style", rankingTypes.tierStyle)], ["style.sound", plain("style.sound", rankingTypes.soundStyle)],
    ["move", plain("move", mediaTypes.synchronized)],
  ]);
  const common = { id: "bad", semantic: ref("semantic"), canvas: ref("canvas"), frame: ref("frame"), during: ref("outer"), style: ref("style") };
  const context = (element: StructuredElement) => ({
    sourceName: "ranking.svml", element, resolveReference: (path: string) => references.get(path),
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  assert.throws(() => decodeTierBoardSurface(context({
    kind: "element", name: "ranking:TierBoard", attributes: common,
    children: [{ kind: "element", name: "ranking:TierItem", attributes: { tier: "s", entry: "direct", during: ref("outer") }, children: [], range }], range,
  })), /icon/u);
  assert.throws(() => decodeTierBoardSurface(context({
    kind: "element", name: "ranking:TierBoard", attributes: { ...common, "move-sound": ref("move") },
    children: [{ kind: "element", name: "ranking:TierItem", attributes: { tier: "s", entry: "direct", icon: ref("icon"), during: ref("outer") }, children: [], range }], range,
  })), /move-sound/u);
});
