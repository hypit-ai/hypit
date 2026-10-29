import { sealTimeline, timelineManifest, timelineTypes } from "@hypit/timeline";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { narrativeProjectionFixture, timelineFixture } from "../../../test/timeline-fixture.js";
import { projectMomentInstantFixture, projectSegmentWindow, projectSelectionWindow } from "../../../test/temporal-fixture.js";

import { createResolvedClosure } from "@hypit/kernel";
import type { AuthorDeclarationCompiler, AuthorResolvedReference } from "@hypit/author";
import { blobManifest } from "@hypit/blob";
import { audioTrackClips, compositionManifest, visualElements } from "@hypit/composition";
import type { VisualItem } from "@hypit/composition";
import type { FontArtifactRef, PreparedMedia } from "@hypit/media";
import { mediaManifest, mediaTypes } from "@hypit/media";
import { mediaOperationsManifest } from "@hypit/media-operations";
import { exactTemporalValueFromFrames, exactTemporalZero, identityTemporalMap, temporalValueInFrames } from "@hypit/temporal";
import type { NarrativeSegmentRef, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { sealCanvas, sealSpatialFrame, spatialManifest } from "@hypit/spatial";
import type { Recipe } from "@hypit/recipe";

function itemElements(item: VisualItem | undefined) {
  assert.equal(item?.kind, "present");
  return visualElements(item!.root);
}

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
  directTierItemPose,
  decodeTierBoardStyle,
  decodeTopThreeStyle,
  fromHighTierItemPose,
  renderColumn,
  renderRankingAudio,
  renderTierBoard,
  renderTopThree,
  rankingComponent,
  rankingManifest,
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
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/recipe";
import { sealText, textManifest, textTypes } from "@hypit/text";
import { temporalManifest, temporalTypes } from "@hypit/temporal";
import type { TemporalWindow } from "@hypit/temporal";
import { compileMarkupDeclaration } from "../../../test/compile-markup-declaration.js";
import {
  columnAuthorDeclaration,
  columnStyleAuthorDeclaration,
  rankingMarkupDeclarations,
  tierBoardAuthorDeclaration,
  tierBoardStyleAuthorDeclaration,
  topThreeAuthorDeclaration,
  topThreeStyleAuthorDeclaration,
} from "../src/declaration.js";
import { rankingModuleRef } from "../src/index.js";

const space = sealTimeline({ id: "test-space", frameCount: 240, frameRate: { numerator: 30, denominator: 1 },
});
const canvas = sealCanvas({
  widthPx: 1080, heightPx: 1920,
});
const canvasBounds = { xPx: 0, yPx: 0, widthPx: canvas.widthPx, heightPx: canvas.heightPx };
const frame = sealSpatialFrame({
  xPx: 40, yPx: 80, widthPx: 720, heightPx: 560,
});
const tierFrame = sealSpatialFrame({
  xPx: 40, yPx: 360, widthPx: 720, heightPx: 280,
});
const semanticOptions = {
  narrativeId: "script",
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
} as const;
const timeline = timelineFixture(space, semanticOptions);
const narrativeProjection = narrativeProjectionFixture(timeline, semanticOptions);
const outer: NarrativeSelectionRef = {
  narrativeId: "script",
  id: "ranking-window",
  startAnchorId: "outer-start",
  endAnchorId: "outer-end",
};
const terminal: NarrativeMomentRef = {
  narrativeId: "script",
  id: "ranking-complete",
  anchorId: "terminal",
};
const rankingSegment: NarrativeSegmentRef = { narrativeId: "script", kind: "segment", id: "ranking", tokenStart: 0, tokenEndExclusive: 1 };
const selection = (id: string, startAnchorId: string, endAnchorId: string): NarrativeSelectionRef => ({
  narrativeId: "script", id, startAnchorId, endAnchorId,
});
const early = selection("early", "early-start", "early-end");
const overlapping = selection("overlapping", "overlap-start", "overlap-end");
const middle = selection("middle", "early-end", "overlap-end");
const late = selection("late", "late-start", "late-end");
const triggerAnchors = ["one", "two", "three", "four"] as const;
const font: FontArtifactRef = {
  sources: [{ artifact: { kind: "blob", resource: fixtureResource("ranking-font"), size: 32, mediaType: "font/woff2" } }],
  weight: 700,
  style: "normal",
};
const recipe = (path: string, properties: Recipe["properties"] = {}): Recipe => ({
  path, properties,
});
const image = (id: string) => ({ kind: "blob" as const, resource: fixtureResource(`ranking-image:${id}`), size: 64, mediaType: "image/png" });
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
    candidates = appendTriggeredRankingCandidate(candidates, value, timeline, {
      narrativeId: "script",
      id: `${value.id}-moment`,
      anchorId: anchors[index]!,
    });
  }
  return buildRankingSchedule({ header: headerValue, items: specs(headerValue, values), semantic: timeline, outer, candidates, terminal });
}

function appendTriggeredRankingCandidate(
  set: ReturnType<typeof createTriggeredRankingCandidateSet>, spec: RankingItemSpec,
  semantic: typeof timeline, moment: NarrativeMomentRef,
) {
  return appendProjectedTriggeredRankingCandidate(set, spec, projectMomentInstantFixture({
    itemId: spec.id, semantic, narrative: narrativeProjection, moment,
    projection: { ref: "moment.cue" },
  }));
}

function buildRankingSchedule(input: {
  readonly header: RankingHeader;
  readonly items: RankingItemSpecSet;
  readonly semantic: typeof timeline;
  readonly outer: NarrativeSelectionRef;
  readonly candidates: TriggeredRankingCandidateSet;
  readonly terminal: NarrativeMomentRef;
}): TriggeredRankingSchedule {
  return buildTriggeredRankingSchedule({
    header: input.header,
    items: input.items,
    timeline: space,
    outer: projectSelectionWindow({
      itemId: input.outer.id, subjectId: input.header.id, semantic: input.semantic, narrative: narrativeProjection, selection: input.outer,
      projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
    }),
    candidates: input.candidates,
    terminal: projectMomentInstantFixture({
      itemId: input.terminal.id, subjectId: input.header.id, semantic: input.semantic, narrative: narrativeProjection, moment: input.terminal,
      projection: { ref: "moment.cue" },
    }),
  });
}

function appendProjectedColumnWindow(
  set: ReturnType<typeof createColumnWindowSet>, spec: ColumnItemSpec,
  semantic: typeof timeline, selection: NarrativeSelectionRef,
) {
  return appendColumnWindow(set, spec, projectSelectionWindow({
    itemId: spec.id, semantic, narrative: narrativeProjection, selection,
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  }));
}

function appendProjectedTierWindow(
  set: ReturnType<typeof createTierBoardWindowSet>, spec: TierBoardItemSpec,
  semantic: typeof timeline, selectionValue: NarrativeSelectionRef,
) {
  return appendTierBoardWindow(set, spec, projectSelectionWindow({
    itemId: spec.id, semantic, narrative: narrativeProjection, selection: selectionValue,
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  }));
}

function projectColumnSegmentOuterWindow(semantic: typeof timeline, segment: NarrativeSegmentRef, subjectId: string): TemporalWindow {
  return projectSegmentWindow({
    itemId: `${segment.id}:outer`, subjectId, semantic, narrative: narrativeProjection, segment,
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
  outerWindow = projectColumnSegmentOuterWindow(timeline, rankingSegment, owner.id),
): ColumnSchedule {
  let set = createColumnWindowSet();
  for (const value of values) {
    if (value.preset) continue;
    const timing = windows[value.id];
    if (timing === undefined) throw new Error(`Missing test Selection for ${value.id}.`);
    set = appendProjectedColumnWindow(set, value, timeline, timing);
  }
  return buildColumnSchedule({ header: owner, items: specs(owner, values), timeline: space, outer: outerWindow, windows: set });
}

function tierSchedule(
  owner: RankingHeader,
  values: readonly TierBoardItemSpec[],
  windows: Readonly<Record<string, NarrativeSelectionRef>>,
  outerWindow = projectSelectionWindow({
    itemId: outer.id, subjectId: owner.id, semantic: timeline, narrative: narrativeProjection, selection: outer,
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  }),
): TierBoardSchedule {
  let set = createTierBoardWindowSet();
  for (const value of values) {
    if (value.preset) continue;
    const timing = windows[value.id];
    if (timing === undefined) throw new Error(`Missing test Selection for ${value.id}.`);
    set = appendProjectedTierWindow(set, value, timeline, timing);
  }
  return buildTierBoardSchedule({ header: owner, items: specs(owner, values), timeline: space, outer: outerWindow, windows: set });
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
  missing = appendTriggeredRankingCandidate(missing, values[0]!, timeline, { narrativeId: "script", id: "a-at", anchorId: "one" });
  assert.throws(() => buildRankingSchedule({
    header: owner, items: specs(owner, values), semantic: timeline, outer, candidates: missing, terminal,
  }), /item-owned Moments differ/u);
  assert.throws(() => schedule(owner, values, ["one", "one"]), /strictly increasing/u);
});

test("variant Style decoders reject unknown Recipes and keep exact fonts and independent stacks", () => {
  const tier = decodeTierBoardStyle(recipe("ranking.tier", {
    rows: [{ id: "s", label: "S", color: "#ef4444" }, { id: "a", label: "A", color: "#22c55e" }], "board-stack": 8, "item-stack": 31,
  }), font);
  assert.deepEqual(tier.style.rows.map((row) => row.id), ["s", "a"]);
  assert.equal(tier.style.fonts[0]?.sources[0]?.artifact.resource, font.sources[0]!.artifact.resource);
  assert.deepEqual([tier.style.boardStackingOrder, tier.style.itemStackingOrder], [8, 31]);
  assert.throws(() => decodeTierBoardStyle(recipe("ranking.tier", { padding: 18 }), font), /does not accept padding/u);
  assert.throws(() => decodeColumnStyle(recipe("ranking.column", { "tier-only": 1 }), font), /does not accept/u);
  assert.equal(decodeTopThreeStyle(recipe("ranking.top"), font).style.slotColors.length, 3);
  assert.throws(() => decodeTopThreeStyle(recipe("ranking.top", {
    "slot-colors": ["#111111", "#222222", "#333333", "#444444"],
  }), font), /exactly three/u);
});

test("Ranking owns its color vocabulary independently of Studio presentation", () => {
  const value = decodeColumnStyle(recipe("ranking.column", {
    "text-color": "transparent",
    "rank-colors": ["#abc", "#11223344"],
  }), font).style;
  assert.equal(value.text.color, "transparent");
  assert.deepEqual(value.rankColors, ["#abc", "#11223344"]);
  assert.throws(() => decodeColumnStyle(recipe("ranking.column", { "text-color": "red" }), font), /hexadecimal color/u);
});

test("TierBoard separates its board Frame from the outer placement Frame and holds drop Items until the final curved glide", () => {
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
  const program = buildTierBoardProgram(owner, canvasBounds, tierFrame, value, style, set);
  const track = renderTierBoard(space, program);
  assert.deepEqual(value.entries.map((entry) => entry.itemId), ["preset", "early", "late"]);
  assert.deepEqual(program.items.map((item) => item.id), ["preset", "early", "late"]);
  assert.equal(track.items.some((item) => item.id.endsWith(":item:preset:reveal")), false);
  assert.equal(track.items.find((item) => item.id.endsWith(":item:preset:settled"))?.span.startFrame, 10);
  const direct = track.items.find((item) => item.id.endsWith(":item:early:reveal"))!;
  assert.ok(track.items.find((item) => item.id.endsWith(":item:late:reveal")));
  assert.equal(direct.subjectId, "early");
  assert.equal(track.items.find((item) => item.id.endsWith(":item:early:settled"))?.subjectId, "early");
  assert.equal(track.items.find((item) => item.id.endsWith(":board"))?.subjectId, program.id);
  const geometry = tierBoardGeometry(tierFrame.widthPx, tierFrame.heightPx, style);
  const stage = tierStageGeometry(canvas.widthPx, canvas.heightPx, style);
  assert.deepEqual({
    rowHeight: geometry.rowHeight, labelWidth: geometry.labelWidth,
    gap: geometry.gap, iconSize: geometry.iconSize,
  }, { rowHeight: 140, labelWidth: 210, gap: 4, iconSize: 132 });
  assert.deepEqual(stage, { centerX: 216, centerY: 576, size: 168 });
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
  const outerWindow = projectColumnSegmentOuterWindow(timeline, rankingSegment, owner.id);
  assert.deepEqual(outerWindow.span, { startFrame: 10, endFrameExclusive: 230 });
  const value = columnSchedule(owner, semantic, {
    "late-rank-one": late,
    "early-rank-five": early,
    "overlap-rank-two": middle,
  }, outerWindow);
  const program = buildColumnProgram(owner, canvasBounds, frame, value, style, set);
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
  const stages = track.items.filter((item) => item.id.includes(":item:") && item.id.endsWith(":stage"));
  assert.deepEqual(stages.map((item) => item.span.startFrame).sort((a, b) => a - b), [25, 65, 120]);
  assert.equal(itemElements(stages.find((item) => item.id.includes("overlap-rank-two"))).some((item) => item.kind === "image"), true);
  assert.equal(track.items.some((item) => item.id.endsWith(":item:preset-rank-three:stage")), false);
  assert.equal(track.items.find((item) => item.id.endsWith(":item:preset-rank-three:settled"))?.span.startFrame, 10);
});

test("Column rejects overlapping or out-of-bounds reveal windows", () => {
  const owner = header("column", "strict-column");
  const values = [columnSpec("one", 1), columnSpec("two", 2)];
  assert.throws(() => columnSchedule(owner, values, { one: early, two: overlapping }),
    /windows one and two overlap/u);

  const outerWindow = projectColumnSegmentOuterWindow(timeline, rankingSegment, owner.id);
  let windows = createColumnWindowSet();
  const projected = projectSelectionWindow({
    itemId: "one", semantic: timeline, narrative: narrativeProjection, selection: early,
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  });
  windows = appendColumnWindow(windows, values[0]!, {
    ...projected,
    start: { ...projected.start, frame: outerWindow.span.startFrame - 1 },
    span: { startFrame: outerWindow.span.startFrame - 1, endFrameExclusive: projected.span.endFrameExclusive },
  });
  assert.throws(() => buildColumnSchedule({
    header: owner, items: specs(owner, [values[0]!]), timeline: space, outer: outerWindow, windows,
  }), /one window is outside/u);
});

test("TopThree accepts one to three optional-image Items and separates active and settled suffixes", () => {
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
  const active = track.items.find((item) => item.id.endsWith(":item:bronze:stage"))!;
  const settled = track.items.find((item) => item.id.endsWith(":item:bronze:settled"))!;
  assert.deepEqual(active.span, value.entries[2]!.stage);
  assert.equal(settled.span.startFrame, value.entries[2]!.stage.endFrameExclusive);
  const fourth = topSpec("fourth");
  let tooMany = appendTopThreeItem(set, fourth);
  assert.throws(() => buildTopThreeProgram(owner, frame,
    schedule(owner, [...semantic, fourth]), style, tooMany), /at most three/u);
});

const sound = (id: string): PreparedMedia => {
  const domain = { id: `ranking-sound:${id}`, duration: exactTemporalValueFromFrames(4_800,
    { frameRate: { numerator: 48_000, denominator: 1 } }) };
  return {
    source: { kind: "blob", resource: fixtureResource(`ranking-sound:${id}`), size: 128, mediaType: "audio/wav" },
    domain,
    audio: { streamIndex: 0, presentationStart: exactTemporalZero(), sourceDomain: domain,
      map: identityTemporalMap(domain), interpretation: { sampleRate: 48_000, channels: 2 } },
  };
};

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
  assert.deepEqual(audioTrackClips(audio).map((clip) => Number(temporalValueInFrames(clip.target.start,
    { frameRate: { numerator: 48_000, denominator: 1 } }).numerator)), [40_000, 94_400, 104_000, 142_400]);
  assert.deepEqual(audioTrackClips(audio).map((clip) => clip.gain), [0.8, 0.6, 0.8, 0.6]);
});

test("each component owns a distinct event law", () => {
  const tierOwner = header("tier-board", "tier-events");
  const tierItems = [tierSpec("direct", "s"), tierSpec("drop", "a", "drop")];
  const tier = decodeTierBoardStyle(recipe("ranking.tier", { rows: [{ id: "s", label: "S", color: "#ef4444" }, { id: "a", label: "A", color: "#22c55e" }] }), font).style;
  assert.deepEqual(buildTierBoardSoundEvents(tierSchedule(tierOwner, tierItems, { direct: early, drop: late }), tier, specs(tierOwner, tierItems)).events.map((item) => item.kind),
    ["appear", "appear", "move"]);

  const topOwner = header("top-three", "top-events");
  const topItems = [topSpec("one")];
  const top = decodeTopThreeStyle(recipe("ranking.top"), font).style;
  assert.deepEqual(buildTopThreeSoundEvents(schedule(topOwner, topItems), top, specs(topOwner, topItems)).events.map((item) => item.kind), ["appear"]);

});

test("all three author declarations preserve absolute temporal, spatial, font, image and optional sound graph edges", async () => {
  createResolvedClosure([
    blobManifest,
    timelineManifest,
    temporalManifest,
    mediaManifest,
    mediaOperationsManifest,
    spatialManifest,
    compositionManifest,
    textManifest,
    rankingManifest,
  ]);
  const plain = (path: string, type: AuthorResolvedReference["type"]): AuthorResolvedReference => ({ path, ref: { kind: "record", id: path }, type });
  const inlineReference = (path: string, type: AuthorResolvedReference["type"], value: unknown): AuthorResolvedReference => ({
    path, ref: { kind: "record", id: path }, type,
    record: { id: path, type, value } as never,
  });
  const references = new Map<string, AuthorResolvedReference>([
    ["semantic", plain("semantic", timelineTypes.timeline)],
    ["frame", plain("frame", spatialTypes.frame)],
    ["outer", plain("outer", temporalTypes.window)],
    ["ranking-segment", plain("ranking-segment", temporalTypes.window)],
    ["tier-reveal", plain("tier-reveal", temporalTypes.window)],
    ["column-reveal", plain("column-reveal", temporalTypes.window)],
    ["moment-one", plain("moment-one", temporalTypes.instant)],
    ["moment-two", plain("moment-two", temporalTypes.instant)],
    ["terminal", plain("terminal", temporalTypes.instant)],
    ["icon-1", plain("icon-1", mediaTypes.blobArtifact)],
    ["icon-2", plain("icon-2", mediaTypes.blobArtifact)],
    ["appear", plain("appear", mediaTypes.prepared)],
    ["move", plain("move", mediaTypes.prepared)],
    ["font", inlineReference("font", mediaTypes.fontArtifact, font)],
    ["copy", inlineReference("copy", textTypes.text, sealText("Dynamic ranking copy"))],
  ]);
  const decode = async (source: string, compiler: AuthorDeclarationCompiler) => await compileMarkupDeclaration({
    source, module: rankingModuleRef, alias: "ranking", compilers: [compiler],
    syntax: rankingMarkupDeclarations, references,
  });
  const styleCases = [
    ["tier-style", "TierBoardStyle", rankingTypes.tierStyle, tierBoardStyleAuthorDeclaration, { rows: [{ id: "s", label: "S", color: "#ef4444" }, { id: "a", label: "A", color: "#22c55e" }] }],
    ["column-style", "ColumnStyle", rankingTypes.columnStyle, columnStyleAuthorDeclaration, {}],
    ["top-style", "TopThreeStyle", rankingTypes.topThreeStyle, topThreeStyleAuthorDeclaration, {}],
  ] as const;
  for (const [id, tag, type, compiler, properties] of styleCases) {
    references.set(`${id}-recipe`, inlineReference(`${id}-recipe`, recipeType, recipe(id, properties)));
    const result = await decode(`<ranking:${tag} id="${id}" recipe={${id}-recipe} font={font}/>`, compiler);
    assert.deepEqual(result.records.map((record) => record.id), [id, `${id}.sound`]);
    const visualRecord = result.records[0]!;
    const soundRecord = result.records[1]!;
    references.set(id, { path: id, ref: { kind: "record", id }, type, record: visualRecord as never });
    references.set(`${id}.sound`, { path: `${id}.sound`, ref: { kind: "record", id: `${id}.sound` }, type: rankingTypes.soundStyle, record: soundRecord as never });
  }
  const cases = [
    [tierBoardAuthorDeclaration, `<ranking:TierBoard id="tier" timeline={semantic} within={frame} frame={frame} during={outer} style={tier-style}>
      <ranking:TierItem id="tier-one" tier="s" entry="drop" icon={icon-1} during={ranking-segment}/>
    </ranking:TierBoard>`],
    [columnAuthorDeclaration, `<ranking:Column id="column" timeline={semantic} within={frame} frame={frame} during={ranking-segment}
      style={column-style} appear-sound={appear} move-sound={move}>
      <ranking:ColumnItem id="column-one" rank="1" label={copy} during={column-reveal}/>
      <ranking:ColumnItem id="column-two" rank="5" preset="true" label="Two" icon={icon-2}/>
    </ranking:Column>`],
    [topThreeAuthorDeclaration, `<ranking:TopThree id="top" timeline={semantic} frame={frame} during={outer}
      terminal={terminal} style={top-style}>
      <ranking:TopThreeItem label="First" at={moment-one}/>
      <ranking:TopThreeItem label="Second" icon={icon-1} at={moment-two}/>
    </ranking:TopThree>`],
  ] as const;
  const decodedCases = [];
  for (const [compiler, source] of cases) {
    const result = await decode(source, compiler);
    decodedCases.push(result);
    assert.equal(result.components.filter((component) => component.outputs.visual !== undefined).length, 1);
    const fragment = result.components.find((candidate) => candidate.fragment.exports.some((output) => output.name === "visual"))!.fragment;
    assert.ok(fragment.exports.some((output) => output.name === "schedule"));
    assert.ok(fragment.exports.some((output) => output.name === "program"));
    assert.ok(fragment.exports.some((output) => output.name === "visual"));
    assert.ok(fragment.inputs.some((input) => input.name === "frame"));
    assert.equal(result.components.some(({ fragment }) => fragment.operations.some((operation) =>
      operation.producer.module.name === "@hypit/narrative-temporal")), false);
  }
  const programTier = decodedCases[0]!;
  const tierFragment = programTier.components.find((candidate) => candidate.fragment.exports.some((output) => output.name === "visual"))!.fragment;
  assert.equal(tierFragment.inputs.find((input) => input.name === "outer")?.type.name, "TemporalWindow");
  assert.equal(programTier.components.some(({ fragment }) => fragment.operations.some((operation) =>
    operation.producer.module.name === "@hypit/temporal")), false);
  assert.equal(programTier.components.some(({ fragment }) => fragment.operations.some((operation) =>
    operation.producer.module.name === "@hypit/narrative-temporal")), false);
  const column = decodedCases[1]!;
  const columnFragment = column.components.find((candidate) => candidate.fragment.exports.some((output) => output.name === "visual"))!.fragment;
  const audio = columnFragment.exports.find((output) => output.name === "audio");
  assert.ok(columnFragment.operations.some((operation) => operation.producer.name === rankingProducers.materializeTextItem.name));
  assert(audio !== undefined);
  assert.ok(columnFragment.exports.some((output) => output.name === "events" && output.type.name === rankingTypes.soundEvents.name));
  assert.deepEqual(Object.keys(column.components.find((component) => component.outputs.visual !== undefined)!.outputs).sort(), ["audio", "events", "program", "schedule", "visual"]);
});

test("Ranking icon Producers consume Blob values", async () => {
  const producer = rankingComponent.producers.find((item) =>
    item.producer.name === rankingProducers.appendTierItem.name);
  assert.ok(producer !== undefined);
  const icon = image("producer");
  const result = await producer.handler({
    inputs: {
      set: { value: (createTierBoardItemSet()) },
      spec: { value: (tierSpec("one", "s")) },
      icon: { value: icon },
    },
  } as never);
  assert.equal(result.kind, "output");
  const set = result.value;
  assert.deepEqual((set as { readonly items: readonly { readonly icon: unknown }[] }).items[0]?.icon, icon);
});

test("Ranking author declarations fail closed on impossible image and sound combinations", async () => {
  const plain = (path: string, type: AuthorResolvedReference["type"]): AuthorResolvedReference => ({ path, ref: { kind: "record", id: path }, type });
  const references = new Map<string, AuthorResolvedReference>([
    ["semantic", plain("semantic", timelineTypes.timeline)],
    ["frame", plain("frame", spatialTypes.frame)], ["outer", plain("outer", temporalTypes.window)],
    ["icon", plain("icon", mediaTypes.blobArtifact)],
    ["style", plain("style", rankingTypes.tierStyle)], ["style.sound", plain("style.sound", rankingTypes.soundStyle)],
    ["move", plain("move", mediaTypes.prepared)],
  ]);
  const decode = async (source: string) => await compileMarkupDeclaration({ source, module: rankingModuleRef,
    alias: "ranking", compilers: [tierBoardAuthorDeclaration], syntax: rankingMarkupDeclarations, references });
  await assert.rejects(async () => await decode(`<ranking:TierBoard id="bad" timeline={semantic} within={frame}
    frame={frame} during={outer} style={style}>
    <ranking:TierItem tier="s" entry="direct" during={outer}/>
  </ranking:TierBoard>`), /icon/u);
  await assert.rejects(async () => await decode(`<ranking:TierBoard id="bad" timeline={semantic} within={frame}
    frame={frame} during={outer} style={style} move-sound={move}>
    <ranking:TierItem tier="s" entry="direct" icon={icon} during={outer}/>
  </ranking:TierBoard>`), /move-sound/u);
});
