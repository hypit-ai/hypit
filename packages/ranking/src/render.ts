import {
  assertAudioTrackIdentity,
  assertVisualTrackIdentity,
  sealAudioTrack,
  sealVisualTrack,
} from "@hypit/composition";
import type {
  AudioClip,
  AudioTrack,
  VisualAnimation,
  VisualElement,
  VisualPresent,
  VisualStyleDeclaration,
  VisualTrack,
} from "@hypit/composition";
import { synchronizedMediaSampleFrames, verifySynchronizedMedia } from "@hypit/media";
import {
  assertProgramSpaceIdentity,
  programFrameSampleBoundary,
  programSpaceSampleFrames,
} from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";

import {
  assertColumnProgram,
  assertRankingSoundEventPlan,
  assertRankingSoundStyle,
  assertTierBoardProgram,
  assertTopThreeProgram,
  fitColumnRevealMotion,
  fitRankingStageMotion,
} from "./schedule.js";
import type {
  ColumnItem,
  ColumnProgram,
  RankingBoardPaint,
  RankingSoundEventPlan,
  RankingSoundSet,
  RankingSoundStyle,
  RankingTextStyle,
  TierBoardItem,
  TierBoardProgram,
  TopThreeItem,
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
  readonly order: number;
  readonly parent?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly style?: readonly VisualStyleDeclaration[];
  readonly animation?: VisualAnimation;
}): VisualElement {
  return {
    id: input.id,
    ...(input.parent === undefined ? {} : { parent: input.parent }),
    order: input.order,
    kind: "box",
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
  readonly order: number;
  readonly parent?: string;
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
    ...(input.parent === undefined ? {} : { parent: input.parent }),
    order: input.order,
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
  readonly order: number;
  readonly parent: string;
  readonly artifact: TierBoardItem["icon"];
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly radius: number;
  readonly fit: "contain" | "cover";
}): VisualElement {
  return {
    id: input.id,
    parent: input.parent,
    order: input.order,
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

function present(input: {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly stacking: number;
  readonly tieBreak: string;
  readonly elements: readonly VisualElement[];
}): VisualPresent {
  return {
    id: input.id,
    span: { startFrame: input.start, endFrameExclusive: input.end },
    stacking: { order: input.stacking, tieBreak: input.tieBreak },
    elements: input.elements,
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

function stageTransform(finalX: number, finalY: number, stageX: number, stageY: number, scale: number): string {
  return `translate(${px(stageX - finalX)},${px(stageY - finalY)}) scale(${scale})`;
}

function settledItemAnimation(input: {
  readonly duration: number;
  readonly appearFrames: number;
  readonly moveStart: number;
  readonly moveEnd: number;
  readonly stageTransform: string;
  readonly easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}): VisualAnimation {
  return animation(input.duration, [
    { atFrame: 0, style: transformStyle(`${input.stageTransform} scale(0.82)`, 0), easing: "ease-out" },
    { atFrame: input.appearFrames, style: transformStyle(input.stageTransform, 1) },
    { atFrame: input.moveStart, style: transformStyle(input.stageTransform, 1), easing: input.easing },
    { atFrame: input.moveEnd, style: transformStyle(finalTransform(), 1) },
  ]);
}

function directItemAnimation(duration: number, appearFrames: number): VisualAnimation {
  return animation(duration, [
    { atFrame: 0, style: transformStyle("translate(0px,8px) scale(0.82)", 0), easing: "ease-out" },
    { atFrame: appearFrames, style: transformStyle(finalTransform(), 1) },
  ]);
}

function sealTrack(space: ProgramSpace, id: string, presents: readonly VisualPresent[]): VisualTrack {
  const value = sealVisualTrack({ visualIr: "hypit.visual-ir@1", id, presents });
  assertVisualTrackIdentity(value, space);
  return value;
}

export function renderTierBoard(space: ProgramSpace, program: TierBoardProgram): VisualTrack {
  assertProgramSpaceIdentity(space);
  assertTierBoardProgram(program);
  const { frame, style, schedule } = program;
  const presents: VisualPresent[] = [];
  const boardElements: VisualElement[] = [absoluteBox({
    id: "tier-board", order: 0, x: frame.xPx, y: frame.yPx, width: frame.widthPx, height: frame.heightPx,
    style: boardStyle(style.board),
  })];
  for (const [index, row] of style.rows.entries()) {
    const y = style.paddingPx + index * (style.rowHeightPx + style.rowGapPx);
    boardElements.push(absoluteBox({
      id: `tier-row-${row.id}`, parent: "tier-board", order: boardElements.length,
      x: style.paddingPx, y, width: frame.widthPx - style.paddingPx * 2, height: style.rowHeightPx,
      style: [{ name: "background", value: row.color }, { name: "border-radius", value: px(Math.min(12, style.iconRadiusPx)) }],
    }));
    boardElements.push(simpleText({
      id: `tier-label-${row.id}`, parent: `tier-row-${row.id}`, order: boardElements.length,
      text: row.label, typography: style.text, x: 0, y: 0, width: style.labelWidthPx, height: style.rowHeightPx,
    }));
  }
  presents.push(present({
    id: `${program.id}:board`, start: schedule.outer.startFrame, end: schedule.outer.endFrameExclusive,
    stacking: style.boardStackingOrder, tieBreak: `${program.id}:0000:board`, elements: boardElements,
  }));
  if (program.items.some((item) => item.entry === "stage")) {
    const size = style.stageSizePx;
    presents.push(present({
      id: `${program.id}:stage`, start: schedule.entries[0]!.triggerFrame, end: schedule.terminalFrame,
      stacking: style.stageStackingOrder, tieBreak: `${program.id}:0001:stage`, elements: [absoluteBox({
        id: "tier-stage", order: 0,
        x: frame.xPx + frame.widthPx * style.stagePoint.x - size / 2,
        y: frame.yPx + frame.heightPx * style.stagePoint.y - size / 2,
        width: size, height: size,
        style: [
          { name: "border", value: `${px(2)} dashed ${style.text.color}` },
          { name: "border-radius", value: px(style.iconRadiusPx) },
          { name: "opacity", value: 0.45 },
        ],
      })],
    }));
  }
  const rowCounts = new Map<string, number>();
  for (const [index, item] of program.items.entries()) {
    const entry = schedule.entries[index]!;
    const rowIndex = style.rows.findIndex((row) => row.id === item.tier);
    const cell = rowCounts.get(item.tier) ?? 0;
    rowCounts.set(item.tier, cell + 1);
    const x = frame.xPx + style.paddingPx + style.labelWidthPx + cell * (style.iconSizePx + style.cellGapPx);
    const y = frame.yPx + style.paddingPx + rowIndex * (style.rowHeightPx + style.rowGapPx)
      + (style.rowHeightPx - style.iconSizePx) / 2;
    assert(x + style.iconSizePx <= frame.xPx + frame.widthPx - style.paddingPx,
      `TierBoard row ${item.tier} cannot fit Item ${item.id}.`);
    const duration = entry.stage.endFrameExclusive - entry.stage.startFrame;
    const fitted = fitRankingStageMotion(duration, style.motion.appearFrames, style.motion.moveFrames, item.entry === "stage");
    const rootAnimation = item.entry === "direct"
      ? directItemAnimation(duration, fitted.appearFrames)
      : settledItemAnimation({
          duration,
          appearFrames: fitted.appearFrames,
          moveStart: entry.stage.endFrameExclusive - fitted.moveFrames - entry.triggerFrame,
          moveEnd: entry.stage.endFrameExclusive - entry.triggerFrame,
          stageTransform: stageTransform(
            x, y,
            frame.xPx + frame.widthPx * style.stagePoint.x - style.iconSizePx / 2,
            frame.yPx + frame.heightPx * style.stagePoint.y - style.iconSizePx / 2,
            style.stageSizePx / style.iconSizePx,
          ),
          easing: style.motion.easing,
        });
    const root = `tier-item-${item.id}`;
    const itemElements = (animationValue?: VisualAnimation): VisualElement[] => [
      absoluteBox({ id: root, order: 0, x, y, width: style.iconSizePx, height: style.iconSizePx,
        ...(animationValue === undefined ? {} : { animation: animationValue }) }),
      iconElement({ id: "icon", parent: root, order: 1, artifact: item.icon, x: 0, y: 0, size: style.iconSizePx, radius: style.iconRadiusPx, fit: style.iconFit }),
    ];
    presents.push(present({
      id: `${program.id}:item:${item.id}:stage`,
      start: entry.stage.startFrame,
      end: entry.stage.endFrameExclusive,
      stacking: item.stackingOrder ?? style.itemStackingOrder,
      tieBreak: `${program.id}:item:${String(index).padStart(4, "0")}:${item.id}:stage`,
      elements: itemElements(rootAnimation),
    }));
    if (entry.settled.endFrameExclusive > entry.settled.startFrame) presents.push(present({
      id: `${program.id}:item:${item.id}:settled`,
      start: entry.settled.startFrame,
      end: entry.settled.endFrameExclusive,
      stacking: item.stackingOrder ?? style.itemStackingOrder,
      tieBreak: `${program.id}:item:${String(index).padStart(4, "0")}:${item.id}:settled`,
      elements: itemElements(),
    }));
  }
  return sealTrack(space, program.id, presents);
}

function rowY(frameY: number, frameHeight: number, padding: number, count: number, index: number, height: number, gap: number): number {
  const total = count * height + Math.max(0, count - 1) * gap;
  return frameY + Math.max(padding, frameHeight - padding - total) + index * (height + gap);
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

export function renderColumn(space: ProgramSpace, program: ColumnProgram): VisualTrack {
  assertProgramSpaceIdentity(space);
  assertColumnProgram(program);
  const { canvas, frame, style, schedule } = program;
  const presents: VisualPresent[] = [];
  const entries = new Map(schedule.entries.map((entry) => [entry.itemId, entry]));
  const cellSize = style.rowHeightPx;
  const columnGap = Math.max(8, Math.round(cellSize * 0.16));
  const contentSize = Math.min(cellSize, frame.widthPx - style.paddingPx * 2 - cellSize - columnGap);
  assert(contentSize > 0, "Column Frame is too narrow for its rank and content cells.");
  const requiredHeight = style.paddingPx * 2 + program.items.length * cellSize
    + Math.max(0, program.items.length - 1) * style.rowGapPx;
  assert(requiredHeight <= frame.heightPx, "Column rows do not fit inside its Frame.");
  const boardElements: VisualElement[] = [absoluteBox({
    id: "column-board", order: 0, x: frame.xPx, y: frame.yPx, width: frame.widthPx, height: frame.heightPx,
    style: boardStyle(style.board),
  })];
  for (const [index, item] of program.items.entries()) {
    const y = style.paddingPx + index * (cellSize + style.rowGapPx);
    const color = rankColor(style.rankColors, item.rank - 1);
    boardElements.push(absoluteBox({
      id: `column-rank-cell-${item.rank}`, parent: "column-board", order: boardElements.length,
      x: style.paddingPx, y, width: cellSize, height: cellSize,
      style: [
        { name: "background", value: color },
        { name: "border-radius", value: px(Math.max(4, Math.round(cellSize * 0.075))) },
      ],
    }));
    boardElements.push(simpleText({
      id: `column-rank-${item.rank}`, parent: `column-rank-cell-${item.rank}`, order: boardElements.length,
      text: String(item.rank), typography: { ...style.text, color: "#ffffff", sizePx: Math.max(style.text.sizePx, cellSize * 0.48) },
      x: 0, y: 0, width: cellSize, height: cellSize,
    }));
    boardElements.push(absoluteBox({
      id: `column-content-cell-${item.rank}`, parent: "column-board", order: boardElements.length,
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
  presents.push(present({ id: `${program.id}:board`, start: schedule.outer.startFrame, end: schedule.outer.endFrameExclusive,
    stacking: style.boardStackingOrder, tieBreak: `${program.id}:0000:board`, elements: boardElements }));
  for (const [index, item] of program.items.entries()) {
    const entry = entries.get(item.id)!;
    const x = frame.xPx + style.paddingPx + cellSize + columnGap;
    const y = frame.yPx + style.paddingPx + index * (cellSize + style.rowGapPx);
    const finalCenterX = x + contentSize / 2;
    const finalCenterY = y + contentSize / 2;
    const stageCenterX = Math.round(canvas.widthPx * style.stagePoint.x);
    const stageCenterY = Math.round(canvas.heightPx * style.stagePoint.y);
    const entryCenterY = canvas.heightPx + style.stageSizePx * 0.25;
    const root = `column-item-${item.id}`;
    const itemElements = (animationValue?: VisualAnimation): VisualElement[] => {
      const iconSize = Math.min(style.iconSizePx, contentSize);
      const elements: VisualElement[] = [absoluteBox({
        id: root, order: 0, x, y, width: contentSize, height: contentSize,
        style: [
          { name: "background", value: "#fffffffa" },
          { name: "border-radius", value: px(Math.min(style.iconRadiusPx, contentSize / 2)) },
          { name: "overflow", value: "hidden" },
          { name: "transform-origin", value: "center center" },
        ],
        ...(animationValue === undefined ? {} : { animation: animationValue }),
      })];
      if (item.icon !== undefined) elements.push(iconElement({ id: "icon", parent: root, order: elements.length, artifact: item.icon,
        x: (contentSize - iconSize) / 2, y: (contentSize - iconSize) / 2, size: iconSize,
        radius: style.iconRadiusPx, fit: style.iconFit }));
      else elements.push(simpleText({
        id: "label", parent: root, order: elements.length, text: item.label,
        typography: { ...style.text, color: "#111315", sizePx: Math.max(12, contentSize * 0.16) },
        x: contentSize * 0.06, y: 0, width: contentSize * 0.88, height: contentSize,
      }));
      return elements;
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
        id: `${program.id}:item:${item.id}:stage`, start: entry.window.startFrame, end: entry.window.endFrameExclusive,
        stacking: item.stackingOrder ?? style.stageStackingOrder,
        tieBreak: `${program.id}:item:${String(item.rank).padStart(4, "0")}:${item.id}:stage`, elements: itemElements(rootAnimation),
      }));
    }
    if (entry.settled.endFrameExclusive > entry.settled.startFrame) presents.push(present({
      id: `${program.id}:item:${item.id}:settled`, start: entry.settled.startFrame, end: entry.settled.endFrameExclusive,
      stacking: item.stackingOrder ?? style.itemStackingOrder,
      tieBreak: `${program.id}:item:${String(item.rank).padStart(4, "0")}:${item.id}:settled`, elements: itemElements(),
    }));
  }
  return sealTrack(space, program.id, presents);
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

export function renderTopThree(space: ProgramSpace, program: TopThreeProgram): VisualTrack {
  assertProgramSpaceIdentity(space);
  assertTopThreeProgram(program);
  const { frame, style, schedule } = program;
  const boardElements: VisualElement[] = [absoluteBox({
    id: "top-slots-root", order: 0,
    x: frame.xPx, y: frame.yPx, width: frame.widthPx, height: frame.heightPx,
  })];
  for (const [index] of program.items.entries()) {
    boardElements.push(absoluteBox({
      id: `top-slot-${index + 1}`, parent: "top-slots-root", order: index + 1,
      x: topSlotX(program, index) - frame.xPx,
      y: frame.heightPx * style.baselineY - style.iconSizePx / 2,
      width: style.iconSizePx, height: style.iconSizePx,
      style: [
        { name: "border", value: `${px(style.ringWidthPx)} solid ${rankColor(style.slotColors, index)}55` },
        { name: "border-radius", value: px(style.iconRadiusPx) },
      ],
    }));
  }
  const presents: VisualPresent[] = [present({
    id: `${program.id}:slots`, start: schedule.outer.startFrame, end: schedule.outer.endFrameExclusive,
    stacking: style.boardStackingOrder, tieBreak: `${program.id}:0000:slots`, elements: boardElements,
  })];
  for (const [index, item] of program.items.entries()) {
    const entry = schedule.entries[index]!;
    const x = topSlotX(program, index);
    const y = frame.yPx + frame.heightPx * style.baselineY - style.iconSizePx / 2;
    const duration = entry.stage.endFrameExclusive - entry.triggerFrame;
    const activeFrames = entry.stage.endFrameExclusive - entry.triggerFrame;
    const root = `top-item-${item.id}`;
    const accent = "accent";
    const itemElements = (active: boolean): VisualElement[] => {
      const elements: VisualElement[] = [absoluteBox({
        id: root, order: 0, x, y, width: style.iconSizePx,
        height: style.iconSizePx + style.labelGapPx + style.text.sizePx * style.text.lineHeight,
        ...(active ? { animation: directItemAnimation(duration,
          fitRankingStageMotion(duration, style.motion.appearFrames, style.motion.moveFrames, false).appearFrames) } : {}),
      })];
      if (active) elements.push(absoluteBox({ id: accent, parent: root, order: 1, x: 0, y: 0, width: style.iconSizePx, height: style.iconSizePx,
        style: [
          { name: "border", value: `${px(style.ringWidthPx)} solid ${rankColor(style.slotColors, index)}` },
          { name: "border-radius", value: px(style.iconRadiusPx) },
          { name: "box-sizing", value: "border-box" },
        ], animation: activeAccentAnimation(duration, activeFrames) }));
      if (item.icon !== undefined) elements.push(iconElement({ id: "icon", parent: root, order: 2, artifact: item.icon,
        x: 0, y: 0, size: style.iconSizePx, radius: style.iconRadiusPx, fit: style.iconFit }));
      else elements.push(simpleText({ id: "rank", parent: root, order: 2, text: String(index + 1),
        typography: { ...style.text, color: rankColor(style.slotColors, index), sizePx: style.iconSizePx * 0.45 },
        x: 0, y: 0, width: style.iconSizePx, height: style.iconSizePx }));
      elements.push(simpleText({ id: "label", parent: root, order: 3, text: item.label, typography: style.text,
        x: -style.slotGapPx / 2, y: style.iconSizePx + style.labelGapPx,
        width: style.iconSizePx + style.slotGapPx, height: style.text.sizePx * style.text.lineHeight }));
      return elements;
    };
    presents.push(present({
      id: `${program.id}:item:${item.id}:stage`, start: entry.stage.startFrame, end: entry.stage.endFrameExclusive,
      stacking: item.stackingOrder ?? style.itemStackingOrder,
      tieBreak: `${program.id}:item:${String(index).padStart(4, "0")}:${item.id}:stage`, elements: itemElements(true),
    }));
    if (entry.settled.endFrameExclusive > entry.settled.startFrame) presents.push(present({
      id: `${program.id}:item:${item.id}:settled`, start: entry.settled.startFrame, end: entry.settled.endFrameExclusive,
      stacking: item.stackingOrder ?? style.itemStackingOrder,
      tieBreak: `${program.id}:item:${String(index).padStart(4, "0")}:${item.id}:settled`, elements: itemElements(false),
    }));
  }
  return sealTrack(space, program.id, presents);
}

export function renderRankingAudio(
  space: ProgramSpace,
  plan: RankingSoundEventPlan,
  style: RankingSoundStyle,
  sounds: RankingSoundSet,
): AudioTrack {
  assertProgramSpaceIdentity(space);
  assertRankingSoundEventPlan(plan);
  assertRankingSoundStyle(style);
  assert(sounds.appear !== undefined || sounds.move !== undefined, "Ranking audio requires at least one authored sound.");
  if (sounds.appear !== undefined) verifySynchronizedMedia(sounds.appear);
  if (sounds.move !== undefined) verifySynchronizedMedia(sounds.move);
  const totalSamples = programSpaceSampleFrames(space, 48_000);
  const fadeSamples = programFrameSampleBoundary(space, style.fadeFrames, 48_000);
  const clips: AudioClip[] = [];
  for (const event of plan.events) {
    const media = sounds[event.kind];
    if (media === undefined) continue;
    const audio = media.audio;
    assert(audio !== undefined, `Ranking ${event.kind} sound has no normalized audio.`);
    const startSample = programFrameSampleBoundary(space, event.frame, 48_000);
    const sourceSampleFrames = synchronizedMediaSampleFrames(media);
    const length = Math.min(sourceSampleFrames, totalSamples - startSample);
    assert(length > 0, `Ranking sound ${event.id} starts after ProgramSpace.`);
    assert(fadeSamples <= length, `Ranking sound ${event.id} fade exceeds its audible interval.`);
    clips.push({
      id: event.id,
      artifact: structuredClone(audio.artifact),
      target: { startSample, endSampleExclusive: startSample + length },
      source: { sampleFrames: sourceSampleFrames, startSample: 0, endSampleExclusive: length, loop: false, phaseSample: 0 },
      playbackRate: 1, pitch: "preserve",
      gain: event.kind === "appear" ? style.appearGain : style.moveGain,
      fadeInSamples: fadeSamples, fadeOutSamples: 0,
    });
  }
  for (const kind of ["appear", "move"] as const) {
    if (sounds[kind] !== undefined) assert(clips.some((clip) => clip.id.endsWith(`:${kind}`)),
      `Ranking ${kind} sound has no matching visual event.`);
  }
  const track = sealAudioTrack({ id: `${plan.id}.audio`, clips });
  assertAudioTrackIdentity(track, space);
  return track;
}
