import { assertTimelineIdentity } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { compareCodeUnits } from "@hypit/hypit/protocol";
import {
  assertAudioTrackIdentity,
  audioGraphFromClips,
  assertVisualTrackIdentity,
  sealAudioTrack,
  sealPresentVisualTrack,
} from "@hypit/composition";
import type {
  AudioClip,
  AudioTrack,
  VisualAnimation,
  VisualElement,
  VisualPresentDraft,
  VisualStyleDeclaration,
  PresentVisualTrack,
} from "@hypit/composition";
import { preparedAudioSource, verifyPreparedMedia } from "@hypit/media";
import { addExactTemporalValues, compareExactTemporalValues, exactTemporalValueFromFrames,
  resolveTemporalRelation, subtractExactTemporalValues } from "@hypit/temporal";

import {
  assertColumnProgram,
  assertRankingSoundEventPlan,
  assertRankingSoundStyle,
  assertTierBoardProgram,
  assertTopThreeProgram,
  fitColumnRevealMotion,
  fitRankingEntranceMotion,
} from "./schedule.js";
import {
  directTierItemPose,
  fromHighTierItemPose,
  tierBoardGeometry,
  tierCell,
  tierStageGeometry,
} from "./tier.js";
import type { TierCell, TierItemPose } from "./tier.js";
import type {
  ColumnProgram,
  RankingBoardPaint,
  RankingSoundEventPlan,
  RankingSoundSet,
  RankingSoundStyle,
  RankingTextStyle,
  TierBoardItem,
  TierBoardProgram,
  TopThreeProgram,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function px(value: number): string {
  return `${Math.round(value * 1_000_000) / 1_000_000}px`;
}

function boxShadow(value: RankingBoardPaint["shadow"]): string {
  return `${px(value.offsetX)} ${px(value.offsetY)} ${px(value.blurPx)} ${px(value.spreadPx)} ${value.color}`;
}

function absoluteBox(input: {
  readonly id: string;
  readonly children?: readonly VisualElement[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly style?: readonly VisualStyleDeclaration[];
  readonly animation?: VisualAnimation;
}): VisualElement {
  return {
    id: input.id,
    kind: "box",
    children: input.children ?? [],
    style: [
      { name: "height", value: px(input.height) },
      { name: "left", value: px(input.x) },
      { name: "position", value: "absolute" },
      { name: "top", value: px(input.y) },
      { name: "width", value: px(input.width) },
      ...(input.style ?? []),
    ],
    ...(input.animation === undefined ? {} : { animation: input.animation }),
  };
}

function boardStyle(value: RankingBoardPaint): VisualStyleDeclaration[] {
  return [
    { name: "background", value: value.background },
    { name: "border", value: `${px(value.borderWidthPx)} solid ${value.borderColor}` },
    { name: "border-radius", value: px(value.radiusPx) },
    { name: "box-shadow", value: boxShadow(value.shadow) },
    { name: "box-sizing", value: "border-box" },
    { name: "overflow", value: "hidden" },
  ];
}

function textStyle(value: RankingTextStyle, align: "left" | "center" | "right" = "center"): VisualStyleDeclaration[] {
  return [
    { name: "align-items", value: "center" },
    { name: "color", value: value.color },
    { name: "display", value: "flex" },
    { name: "font-size", value: px(value.sizePx) },
    { name: "justify-content", value: align === "left" ? "start" : align === "right" ? "end" : "center" },
    { name: "line-height", value: value.lineHeight },
    { name: "overflow", value: "hidden" },
    { name: "text-align", value: align },
    { name: "white-space", value: "nowrap" },
  ];
}

function simpleText(input: {
  readonly id: string;
  readonly text: string;
  readonly typography: RankingTextStyle;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly align?: "left" | "center" | "right";
  readonly style?: readonly VisualStyleDeclaration[];
  readonly animation?: VisualAnimation;
}): VisualElement {
  return {
    id: input.id,
    kind: "text",
    text: input.text,
    fonts: structuredClone(input.typography.fonts),
    style: [
      { name: "height", value: px(input.height) },
      { name: "left", value: px(input.x) },
      { name: "position", value: "absolute" },
      { name: "top", value: px(input.y) },
      { name: "width", value: px(input.width) },
      ...textStyle(input.typography, input.align),
      ...(input.style ?? []),
    ],
    ...(input.animation === undefined ? {} : { animation: input.animation }),
  };
}

function iconElement(input: {
  readonly id: string;
  readonly artifact: TierBoardItem["icon"];
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly radius: number;
  readonly fit: "contain" | "cover";
}): VisualElement {
  return {
    id: input.id,
    kind: "image",
    artifact: structuredClone(input.artifact),
    style: [
      { name: "border-radius", value: px(input.radius) },
      { name: "height", value: px(input.size) },
      { name: "left", value: px(input.x) },
      { name: "object-fit", value: input.fit },
      { name: "overflow", value: "hidden" },
      { name: "position", value: "absolute" },
      { name: "top", value: px(input.y) },
      { name: "width", value: px(input.size) },
    ],
  };
}

type LayeredPresent = VisualPresentDraft & {
  readonly layer: number;
  readonly sequence: number;
};

function present(input: {
  readonly id: string;
  readonly subjectId: string;
  readonly start: number;
  readonly end: number;
  readonly sequence: number;
  readonly layer: number;
  readonly root: VisualElement;
}): LayeredPresent {
  return {
    id: input.id,
    layer: input.layer,
    sequence: input.sequence,
    subjectId: input.subjectId,
    span: { startFrame: input.start, endFrameExclusive: input.end },
    root: input.root,
  };
}

function animation(
  duration: number,
  values: readonly { readonly atFrame: number; readonly style: readonly VisualStyleDeclaration[]; readonly easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out" }[],
): VisualAnimation {
  const ordered = [...values, ...(values.at(-1)?.atFrame === duration ? [] : [{ atFrame: duration, style: values.at(-1)!.style }])];
  const unique: typeof ordered = [];
  for (const value of ordered) {
    const previous = unique.at(-1);
    if (previous?.atFrame === value.atFrame) unique[unique.length - 1] = value;
    else unique.push(value);
  }
  assert(unique[0]?.atFrame === 0 && unique.at(-1)?.atFrame === duration, "Ranking animation does not span its Present.");
  return { keyframes: unique };
}

function transformStyle(transform: string, opacity: number): VisualStyleDeclaration[] {
  return [{ name: "opacity", value: opacity }, { name: "transform", value: transform }];
}

function finalTransform(): string {
  return "translate(0px,0px) scale(1)";
}

function directItemAnimation(
  duration: number,
  appearFrames: number,
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" = "ease-out",
): VisualAnimation {
  return animation(duration, [
    { atFrame: 0, style: transformStyle("translate(0px,8px) scale(0.82)", 0), easing },
    { atFrame: appearFrames, style: transformStyle(finalTransform(), 1) },
  ]);
}

function tierItemStyle(pose: TierItemPose, cell: TierCell): VisualStyleDeclaration[] {
  return [
    { name: "filter", value: `blur(${px(pose.blurPx)}) drop-shadow(0 ${px(pose.shadowY)} ${px(pose.shadowBlur)} rgba(0,0,0,${Math.round(pose.shadowOpacity * 1_000_000) / 1_000_000}))` },
    { name: "opacity", value: Math.round(pose.opacity * 1_000_000) / 1_000_000 },
    { name: "transform", value: `translate(${px(pose.x - cell.x)},${px(pose.y - cell.y)}) scale(${Math.round(pose.scale * 1_000_000) / 1_000_000}) rotate(${Math.round(pose.rotateDeg * 1_000_000) / 1_000_000}deg)` },
  ];
}

function tierItemAnimation(
  duration: number,
  cell: TierCell,
  poseAt: (frame: number) => TierItemPose,
): VisualAnimation {
  return animation(duration, Array.from({ length: duration + 1 }, (_, frame) => ({
    atFrame: frame,
    easing: "linear" as const,
    style: tierItemStyle(poseAt(frame), cell),
  })));
}

function sealTrack(timeline: Timeline, id: string, presents: readonly LayeredPresent[]): PresentVisualTrack {
  const ordered = [...presents]
    .sort((left, right) => left.layer - right.layer || left.sequence - right.sequence || compareCodeUnits(left.id, right.id))
    .map(({ layer: _layer, sequence: _sequence, ...item }) => item);
  const value = sealPresentVisualTrack({ timelineId: timeline.id, visualIr: "hypit.visual-ir@1", id, presents: ordered });
  assertVisualTrackIdentity(value, timeline);
  return value;
}

export function renderTierBoard(timeline: Timeline, program: TierBoardProgram): PresentVisualTrack {
  assertTimelineIdentity(timeline);
  assertTierBoardProgram(program);
  const { within, frame, style, schedule } = program;
  const geometry = tierBoardGeometry(frame.widthPx, frame.heightPx, style);
  const localStage = tierStageGeometry(within.widthPx, within.heightPx, style);
  const stage = { ...localStage, centerX: within.xPx + localStage.centerX, centerY: within.yPx + localStage.centerY };
  const presents: LayeredPresent[] = [];
  const boardChildren: VisualElement[] = [];
  const labelTypography: RankingTextStyle = {
    fonts: structuredClone(style.fonts),
    sizePx: geometry.rowHeight * style.labelSizeRatio,
    weight: style.fonts[0]!.weight,
    color: style.labelTextColor,
    lineHeight: style.labelLineHeight,
  };
  for (const [index, row] of style.rows.entries()) {
    const root = `tier-row-${row.id}`;
    const y = index * geometry.rowHeight;
    const last = index === style.rows.length - 1;
    const rowChildren: VisualElement[] = [];
    rowChildren.push(absoluteBox({
      id: `${root}-content`,
      x: geometry.labelWidth, y: 0, width: frame.widthPx - geometry.labelWidth, height: geometry.rowHeight,
      style: [{ name: "background", value: style.boardColor }],
    }));
    rowChildren.push(simpleText({
      id: `${root}-label`,
      text: row.label, typography: labelTypography, x: 0, y: 0,
      width: geometry.labelWidth, height: geometry.rowHeight,
      style: [
        { name: "background", value: row.color },
        { name: "border-right", value: `${px(style.borderWidthPx)} solid ${style.borderColor}` },
        { name: "box-sizing", value: "border-box" },
      ],
    }));
    boardChildren.push(absoluteBox({
      id: root,
      children: rowChildren,
      x: 0, y, width: frame.widthPx, height: geometry.rowHeight,
      style: [
        { name: "border-top", value: `${px(style.borderWidthPx)} solid ${style.borderColor}` },
        { name: "border-left", value: `${px(style.borderWidthPx)} solid ${style.borderColor}` },
        { name: "border-right", value: `${px(style.borderWidthPx)} solid ${style.borderColor}` },
        ...(last ? [{ name: "border-bottom", value: `${px(style.borderWidthPx)} solid ${style.borderColor}` } satisfies VisualStyleDeclaration] : []),
        { name: "box-sizing", value: "border-box" },
      ],
    }));
  }
  const boardRoot = absoluteBox({
    id: "tier-board-root", children: boardChildren,
    x: frame.xPx, y: frame.yPx, width: frame.widthPx, height: frame.heightPx,
  });
  presents.push(present({
    id: `${program.id}:board`, subjectId: program.id, start: schedule.outer.startFrame, end: schedule.outer.endFrameExclusive,
    sequence: 0, layer: style.boardStackingOrder, root: boardRoot,
  }));
  const entries = new Map(schedule.entries.map((entry) => [entry.itemId, entry]));
  const rowCounts = new Map<string, number>();
  for (const [index, item] of program.items.entries()) {
    const entry = entries.get(item.id)!;
    const rowIndex = style.rows.findIndex((row) => row.id === item.tier);
    const column = rowCounts.get(item.tier) ?? 0;
    rowCounts.set(item.tier, column + 1);
    const cell = tierCell(geometry, rowIndex, column);
    assert(cell.x + cell.size <= frame.widthPx,
      `TierBoard row ${item.tier} cannot fit Item ${item.id}.`);
    const radius = Math.round(geometry.rowHeight * style.iconRadiusRatio);
    const absoluteCell: TierCell = {
      x: frame.xPx + cell.x,
      y: frame.yPx + cell.y,
      size: cell.size,
    };
    const root = `tier-item-${item.id}`;
    const itemRoot = (animationValue?: VisualAnimation): VisualElement =>
      absoluteBox({
        id: root,
        children: [iconElement({ id: "icon", artifact: item.icon, x: 0, y: 0,
          size: cell.size, radius, fit: style.iconFit })],
        x: absoluteCell.x, y: absoluteCell.y, width: cell.size, height: cell.size,
        style: [
          { name: "border-radius", value: px(radius) },
          { name: "filter", value: "blur(0px) drop-shadow(0 7px 10px rgba(0,0,0,0.2))" },
          ...(style.iconFit === "contain" ? [{ name: "background", value: "rgba(255,255,255,0.96)" } satisfies VisualStyleDeclaration] : []),
          { name: "overflow", value: "hidden" },
          { name: "transform-origin", value: "center center" },
        ],
        ...(animationValue === undefined ? {} : { animation: animationValue }),
      });
    if (entry.mode === "reveal") {
      assert(!item.preset, `TierBoard reveal ${item.id} cannot be preset.`);
      const duration = entry.window.endFrameExclusive - entry.window.startFrame;
      const rootAnimation = tierItemAnimation(duration, absoluteCell, item.entry === "direct"
        ? (localFrame) => directTierItemPose(localFrame, absoluteCell, style.motion.appearFrames)
        : (localFrame) => fromHighTierItemPose(
            localFrame, duration, stage, absoluteCell, style.motion.appearFrames, style.motion.moveFrames));
      presents.push(present({
        id: `${program.id}:item:${item.id}:reveal`, subjectId: item.id,
        start: entry.window.startFrame,
        end: entry.window.endFrameExclusive,
        sequence: index + 1,
        layer: item.stackingOrder ?? (item.entry === "drop" ? style.stageStackingOrder : style.itemStackingOrder),
        root: itemRoot(rootAnimation),
      }));
    }
    if (entry.settled.endFrameExclusive > entry.settled.startFrame) presents.push(present({
      id: `${program.id}:item:${item.id}:settled`, subjectId: item.id,
      start: entry.settled.startFrame,
      end: entry.settled.endFrameExclusive,
      sequence: index + 1,
      layer: item.stackingOrder ?? style.itemStackingOrder,
      root: itemRoot(),
    }));
  }
  return sealTrack(timeline, program.id, presents);
}

function rankColor(colors: readonly string[], index: number): string {
  return colors[index % colors.length]!;
}

function columnCardTransform(input: {
  readonly finalCenterX: number;
  readonly finalCenterY: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly size: number;
  readonly finalSize: number;
  readonly scale?: number;
}): string {
  const translateX = input.centerX - input.finalCenterX;
  const translateY = input.centerY - input.finalCenterY;
  const scale = Math.round(input.size / input.finalSize * (input.scale ?? 1) * 1_000_000) / 1_000_000;
  return `translate(${px(translateX)},${px(translateY)}) scale(${scale})`;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function outBack(progress: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2);
}

function columnRevealAnimation(input: {
  readonly duration: number;
  readonly appearFrames: number;
  readonly moveFrames: number;
  readonly finalCenterX: number;
  readonly finalCenterY: number;
  readonly stageCenterX: number;
  readonly stageCenterY: number;
  readonly entryCenterY: number;
  readonly stageSize: number;
  readonly finalSize: number;
  readonly easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}): VisualAnimation {
  const moveStart = input.duration - input.moveFrames;
  const moveEnd = Math.max(moveStart, input.duration - 1);
  const holdFrames = moveStart - input.appearFrames;
  const stage = (centerX = input.stageCenterX, centerY = input.stageCenterY, scale = 1) => columnCardTransform({
    finalCenterX: input.finalCenterX,
    finalCenterY: input.finalCenterY,
    centerX,
    centerY,
    size: input.stageSize,
    finalSize: input.finalSize,
    scale,
  });
  const overshootFrame = Math.max(1, Math.round(input.appearFrames * 0.72));
  const overshootProgress = outBack(overshootFrame / input.appearFrames);
  return animation(input.duration, [
    { atFrame: 0, style: transformStyle(columnCardTransform({
      finalCenterX: input.finalCenterX,
      finalCenterY: input.finalCenterY,
      centerX: input.stageCenterX,
      centerY: input.entryCenterY,
      size: input.stageSize,
      finalSize: input.finalSize,
      scale: 0.96,
    }), 0), easing: "ease-out" },
    ...(overshootFrame < input.appearFrames ? [{
      atFrame: overshootFrame,
      style: transformStyle(stage(input.stageCenterX,
        lerp(input.entryCenterY, input.stageCenterY, overshootProgress),
        0.96 + 0.04 * overshootProgress), 1),
      easing: "ease-in-out" as const,
    }] : []),
    { atFrame: input.appearFrames, style: transformStyle(stage(), 1) },
    ...(holdFrames >= 6 ? [
      { atFrame: input.appearFrames + Math.floor(holdFrames / 3),
        style: transformStyle(stage(input.stageCenterX + 0.8, input.stageCenterY - 1.8, 1.007), 1), easing: "ease-in-out" as const },
      { atFrame: input.appearFrames + Math.floor(holdFrames * 2 / 3),
        style: transformStyle(stage(input.stageCenterX - 0.4, input.stageCenterY + 1.6, 1.002), 1), easing: "ease-in-out" as const },
    ] : []),
    { atFrame: moveStart, style: transformStyle(stage(), 1), easing: input.easing },
    { atFrame: moveEnd, style: transformStyle(finalTransform(), 1) },
  ]);
}

export function renderColumn(timeline: Timeline, program: ColumnProgram): PresentVisualTrack {
  assertTimelineIdentity(timeline);
  assertColumnProgram(program);
  const { within, frame, style, schedule } = program;
  const presents: LayeredPresent[] = [];
  const entries = new Map(schedule.entries.map((entry) => [entry.itemId, entry]));
  const cellSize = style.rowHeightPx;
  const columnGap = Math.max(8, Math.round(cellSize * 0.16));
  const contentSize = Math.min(cellSize, frame.widthPx - style.paddingPx * 2 - cellSize - columnGap);
  assert(contentSize > 0, "Column Frame is too narrow for its rank and content cells.");
  const requiredHeight = style.paddingPx * 2 + program.items.length * cellSize
    + Math.max(0, program.items.length - 1) * style.rowGapPx;
  assert(requiredHeight <= frame.heightPx, "Column rows do not fit inside its Frame.");
  const boardChildren: VisualElement[] = [];
  for (const [index, item] of program.items.entries()) {
    const y = style.paddingPx + index * (cellSize + style.rowGapPx);
    const color = rankColor(style.rankColors, item.rank - 1);
    boardChildren.push(absoluteBox({
      id: `column-rank-cell-${item.rank}`,
      children: [simpleText({
        id: `column-rank-${item.rank}`,
        text: String(item.rank), typography: { ...style.text, color: "#ffffff", sizePx: Math.max(style.text.sizePx, cellSize * 0.48) },
        x: 0, y: 0, width: cellSize, height: cellSize,
      })],
      x: style.paddingPx, y, width: cellSize, height: cellSize,
      style: [
        { name: "background", value: color },
        { name: "border-radius", value: px(Math.max(4, Math.round(cellSize * 0.075))) },
      ],
    }));
    boardChildren.push(absoluteBox({
      id: `column-content-cell-${item.rank}`,
      x: style.paddingPx + cellSize + columnGap, y, width: contentSize, height: contentSize,
      style: [
        { name: "background", value: "#000000b8" },
        { name: "border", value: `${px(1.5)} solid #ffffff2e` },
        { name: "border-radius", value: px(Math.min(style.iconRadiusPx, contentSize / 2)) },
        { name: "box-sizing", value: "border-box" },
        { name: "overflow", value: "hidden" },
      ],
    }));
  }
  const boardRoot = absoluteBox({
    id: "column-board", children: boardChildren,
    x: frame.xPx, y: frame.yPx, width: frame.widthPx, height: frame.heightPx,
    style: boardStyle(style.board),
  });
  presents.push(present({ id: `${program.id}:board`, subjectId: program.id, start: schedule.outer.startFrame, end: schedule.outer.endFrameExclusive,
    sequence: 0, layer: style.boardStackingOrder, root: boardRoot }));
  for (const [index, item] of program.items.entries()) {
    const entry = entries.get(item.id)!;
    const x = frame.xPx + style.paddingPx + cellSize + columnGap;
    const y = frame.yPx + style.paddingPx + index * (cellSize + style.rowGapPx);
    const finalCenterX = x + contentSize / 2;
    const finalCenterY = y + contentSize / 2;
    const stageCenterX = within.xPx + Math.round(within.widthPx * style.stagePoint.x);
    const stageCenterY = within.yPx + Math.round(within.heightPx * style.stagePoint.y);
    const entryCenterY = within.yPx + within.heightPx + style.stageSizePx * 0.25;
    const root = `column-item-${item.id}`;
    const itemRoot = (animationValue?: VisualAnimation): VisualElement => {
      const iconSize = Math.min(style.iconSizePx, contentSize);
      const content = item.icon !== undefined ? iconElement({ id: "icon", artifact: item.icon,
        x: (contentSize - iconSize) / 2, y: (contentSize - iconSize) / 2, size: iconSize,
        radius: style.iconRadiusPx, fit: style.iconFit }) : simpleText({
        id: "label", text: item.label,
        typography: { ...style.text, color: "#111315", sizePx: Math.max(12, contentSize * 0.16) },
        x: contentSize * 0.06, y: 0, width: contentSize * 0.88, height: contentSize,
      });
      return absoluteBox({
        id: root, children: [content], x, y, width: contentSize, height: contentSize,
        style: [
          { name: "background", value: "#fffffffa" },
          { name: "border-radius", value: px(Math.min(style.iconRadiusPx, contentSize / 2)) },
          { name: "overflow", value: "hidden" },
          { name: "transform-origin", value: "center center" },
        ],
        ...(animationValue === undefined ? {} : { animation: animationValue }),
      });
    };
    if (entry.mode === "reveal") {
      const duration = entry.window.endFrameExclusive - entry.window.startFrame;
      const fitted = fitColumnRevealMotion(duration, style.motion.appearFrames, style.motion.moveFrames);
      const rootAnimation = fitted.mode === "direct" ? undefined : columnRevealAnimation({
        duration, appearFrames: fitted.appearFrames, moveFrames: fitted.moveFrames,
        finalCenterX, finalCenterY, stageCenterX, stageCenterY, entryCenterY,
        stageSize: style.stageSizePx, finalSize: contentSize, easing: style.motion.easing,
      });
      presents.push(present({
        id: `${program.id}:item:${item.id}:stage`, subjectId: item.id, start: entry.window.startFrame, end: entry.window.endFrameExclusive,
        sequence: item.rank, layer: item.stackingOrder ?? style.stageStackingOrder, root: itemRoot(rootAnimation),
      }));
    }
    if (entry.settled.endFrameExclusive > entry.settled.startFrame) presents.push(present({
      id: `${program.id}:item:${item.id}:settled`, subjectId: item.id, start: entry.settled.startFrame, end: entry.settled.endFrameExclusive,
      sequence: item.rank, layer: item.stackingOrder ?? style.itemStackingOrder, root: itemRoot(),
    }));
  }
  return sealTrack(timeline, program.id, presents);
}

function topSlotX(program: TopThreeProgram, index: number): number {
  const total = program.items.length * program.style.iconSizePx + Math.max(0, program.items.length - 1) * program.style.slotGapPx;
  return program.frame.xPx + program.frame.widthPx * program.style.centerX - total / 2
    + index * (program.style.iconSizePx + program.style.slotGapPx);
}

function activeAccentAnimation(duration: number, activeFrames: number): VisualAnimation {
  const middle = Math.max(1, Math.floor(activeFrames / 2));
  return animation(duration, [
    { atFrame: 0, style: transformStyle("scale(1)", 1), easing: "ease-in-out" },
    { atFrame: middle, style: transformStyle("scale(1.08)", 1), easing: "ease-in-out" },
    { atFrame: activeFrames, style: transformStyle("scale(1)", 1) },
  ]);
}

export function renderTopThree(timeline: Timeline, program: TopThreeProgram): PresentVisualTrack {
  assertTimelineIdentity(timeline);
  assertTopThreeProgram(program);
  const { frame, style, schedule } = program;
  const boardRoot = absoluteBox({
    id: "top-slots-root",
    children: program.items.map((_, index) => absoluteBox({
      id: `top-slot-${index + 1}`,
      x: topSlotX(program, index) - frame.xPx,
      y: frame.heightPx * style.baselineY - style.iconSizePx / 2,
      width: style.iconSizePx, height: style.iconSizePx,
      style: [
        { name: "border", value: `${px(style.ringWidthPx)} solid ${rankColor(style.slotColors, index)}55` },
        { name: "border-radius", value: px(style.iconRadiusPx) },
      ],
    })),
    x: frame.xPx, y: frame.yPx, width: frame.widthPx, height: frame.heightPx,
  });
  const presents: LayeredPresent[] = [present({
    id: `${program.id}:slots`, subjectId: program.id, start: schedule.outer.startFrame, end: schedule.outer.endFrameExclusive,
    sequence: 0, layer: style.boardStackingOrder, root: boardRoot,
  })];
  for (const [index, item] of program.items.entries()) {
    const entry = schedule.entries[index]!;
    const x = topSlotX(program, index);
    const y = frame.yPx + frame.heightPx * style.baselineY - style.iconSizePx / 2;
    const duration = entry.stage.endFrameExclusive - entry.triggerFrame;
    const activeFrames = entry.stage.endFrameExclusive - entry.triggerFrame;
    const root = `top-item-${item.id}`;
    const accent = "accent";
    const itemRoot = (active: boolean): VisualElement => {
      const children: VisualElement[] = [];
      if (active) children.push(absoluteBox({ id: accent, x: 0, y: 0, width: style.iconSizePx, height: style.iconSizePx,
        style: [
          { name: "border", value: `${px(style.ringWidthPx)} solid ${rankColor(style.slotColors, index)}` },
          { name: "border-radius", value: px(style.iconRadiusPx) },
          { name: "box-sizing", value: "border-box" },
        ], animation: activeAccentAnimation(duration, activeFrames) }));
      if (item.icon !== undefined) children.push(iconElement({ id: "icon", artifact: item.icon,
        x: 0, y: 0, size: style.iconSizePx, radius: style.iconRadiusPx, fit: style.iconFit }));
      else children.push(simpleText({ id: "rank", text: String(index + 1),
        typography: { ...style.text, color: rankColor(style.slotColors, index), sizePx: style.iconSizePx * 0.45 },
        x: 0, y: 0, width: style.iconSizePx, height: style.iconSizePx }));
      // The label's box is one line box, and a line box is not the ink: accents reach above it and
      // descenders below. It clips, so at a tight `line-height` the tops and tails were shaved. The
      // box grows by one line box's worth of leading at each end and its top moves up by the same,
      // so the text stays where it was painted and only the clip rectangle moves.
      const labelSlack = style.text.sizePx * 0.25;
      children.push(simpleText({ id: "label", text: item.label, typography: style.text,
        x: -style.slotGapPx / 2, y: style.iconSizePx + style.labelGapPx - labelSlack,
        width: style.iconSizePx + style.slotGapPx,
        height: style.text.sizePx * style.text.lineHeight + labelSlack * 2 }));
      return absoluteBox({
        id: root, children, x, y, width: style.iconSizePx,
        height: style.iconSizePx + style.labelGapPx + style.text.sizePx * style.text.lineHeight,
        ...(active ? { animation: directItemAnimation(duration,
          fitRankingEntranceMotion(duration, style.motion.appearFrames, style.motion.moveFrames, false).appearFrames) } : {}),
      });
    };
    presents.push(present({
      id: `${program.id}:item:${item.id}:stage`, subjectId: item.id, start: entry.stage.startFrame, end: entry.stage.endFrameExclusive,
      sequence: index + 1, layer: item.stackingOrder ?? style.itemStackingOrder, root: itemRoot(true),
    }));
    if (entry.settled.endFrameExclusive > entry.settled.startFrame) presents.push(present({
      id: `${program.id}:item:${item.id}:settled`, subjectId: item.id, start: entry.settled.startFrame, end: entry.settled.endFrameExclusive,
      sequence: index + 1, layer: item.stackingOrder ?? style.itemStackingOrder, root: itemRoot(false),
    }));
  }
  return sealTrack(timeline, program.id, presents);
}

export function renderRankingAudio(
  timeline: Timeline,
  plan: RankingSoundEventPlan,
  style: RankingSoundStyle,
  sounds: RankingSoundSet,
): AudioTrack {
  assertTimelineIdentity(timeline);
  assertRankingSoundEventPlan(plan);
  assertRankingSoundStyle(style);
  assert(sounds.appear !== undefined || sounds.move !== undefined, "Ranking audio requires at least one authored sound.");
  if (sounds.appear !== undefined) verifyPreparedMedia(sounds.appear);
  if (sounds.move !== undefined) verifyPreparedMedia(sounds.move);
  const timelineEnd = exactTemporalValueFromFrames(timeline.frameCount, timeline);
  const clips: AudioClip[] = [];
  for (const event of plan.events) {
    const media = sounds[event.kind];
    if (media === undefined) continue;
    const targetStart = exactTemporalValueFromFrames(event.frame, timeline);
    const fadeEndFrame = event.frame + style.fadeFrames;
    assert(fadeEndFrame <= timeline.frameCount,
      `Ranking sound ${event.id} fade exceeds Timeline.`);
    if (media.audio === undefined) throw new Error(`Ranking sound ${event.id} has no selected audio member.`);
    const sourceDuration = media.domain.duration;
    const available = subtractExactTemporalValues(timelineEnd, targetStart);
    const targetDuration = compareExactTemporalValues(sourceDuration, available) <= 0 ? sourceDuration : available;
    assert(compareExactTemporalValues(targetDuration,
      { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }) > 0,
    `Ranking sound ${event.id} starts after Timeline.`);
    const fadeIn = exactTemporalValueFromFrames(style.fadeFrames, timeline);
    assert(compareExactTemporalValues(fadeIn, targetDuration) <= 0,
      `Ranking sound ${event.id} fade exceeds its audible interval.`);
    const sampling = resolveTemporalRelation({
      clock: timeline,
      target: { id: `${event.id}:occurrence`, duration: targetDuration },
      source: structuredClone(media.domain),
    });
    clips.push({
      id: event.id,
      source: preparedAudioSource(media),
      preparation: structuredClone(media.audio.map),
      target: { start: targetStart, end: addExactTemporalValues(targetStart, targetDuration) },
      sampling,
      gain: event.kind === "appear" ? style.appearGain : style.moveGain,
      fadeIn, fadeOut: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
    });
  }
  for (const kind of ["appear", "move"] as const) {
    if (sounds[kind] !== undefined) assert(clips.some((clip) => clip.id.endsWith(`:${kind}`)),
      `Ranking ${kind} sound has no matching visual event.`);
  }
  const track = sealAudioTrack({ timelineId: timeline.id, id: `${plan.id}.audio`, graph: audioGraphFromClips(clips) });
  assertAudioTrackIdentity(track, timeline);
  return track;
}
