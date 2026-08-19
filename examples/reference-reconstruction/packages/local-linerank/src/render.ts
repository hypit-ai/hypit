import {
  assertVisualTrackIdentity,
  sealVisualTrack,
} from "@hypit/composition";
import type {
  VisualAnimation,
  VisualElement,
  VisualPresent,
  VisualStyleDeclaration,
  VisualTrack,
} from "@hypit/composition";
import { assertProgramSpaceIdentity } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";

import { assertLinerankProgram, assertLinerankSchedule } from "./schedule.js";
import type { LinerankProgram, LinerankStyle, LinerankTextStyle } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function px(value: number): string {
  return `${Math.round(value * 1_000_000) / 1_000_000}px`;
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

function textStyle(value: LinerankTextStyle, align: "left" | "center", nowrap: boolean): VisualStyleDeclaration[] {
  return [
    { name: "align-items", value: "center" },
    { name: "color", value: value.color },
    { name: "display", value: "flex" },
    { name: "font-size", value: px(value.sizePx) },
    { name: "justify-content", value: align === "left" ? "start" : "center" },
    { name: "line-height", value: value.lineHeight },
    { name: "overflow", value: "hidden" },
    { name: "text-align", value: align },
    { name: "white-space", value: nowrap ? "nowrap" : "normal" },
  ];
}

function simpleText(input: {
  readonly id: string;
  readonly order: number;
  readonly parent?: string;
  readonly text: string;
  readonly typography: LinerankTextStyle;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly align?: "left" | "center";
  readonly nowrap?: boolean;
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
      ...textStyle(input.typography, input.align ?? "left", input.nowrap ?? true),
      ...(input.style ?? []),
    ],
    ...(input.animation === undefined ? {} : { animation: input.animation }),
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

function typewriterAnimation(
  duration: number,
  revealFrames: number,
  fullWidth: number,
): VisualAnimation {
  const clipped = `inset(0px ${px(fullWidth)} 0px 0px)`;
  const revealed = "inset(0px 0px 0px 0px)";
  return {
    keyframes: [
      { atFrame: 0, style: [{ name: "clip-path", value: clipped }] },
      { atFrame: Math.min(revealFrames, duration), style: [{ name: "clip-path", value: revealed }] },
    ],
  };
}

function circleAnimation(
  offset: number,
  circleFrames: number,
  duration: number,
): VisualAnimation {
  const start = Math.min(offset, duration);
  const end = Math.min(offset + circleFrames, duration);
  const hidden = [
    { name: "opacity", value: 0 },
    { name: "transform", value: "translate(-50%,-50%) scale(0.72) rotate(-2deg)" },
  ] as const;
  return {
    keyframes: [
      { atFrame: 0, style: [...hidden] },
      ...(start === 0 ? [] : [{ atFrame: start, style: [...hidden] }]),
      { atFrame: Math.max(end, start + 1), style: [
        { name: "opacity", value: 1 },
        { name: "transform", value: "translate(-50%,-50%) scale(1) rotate(-2deg)" },
      ] },
    ],
  };
}

function estimatedLabelWidth(label: string, style: LinerankStyle): number {
  return Math.max(1, Math.round(label.length * style.label.sizePx * 0.62));
}

function rowY(program: LinerankProgram, rank: number): number {
  const { frame, style } = program;
  const index = rank - 1;
  return frame.yPx + style.topPaddingPx + index * (style.rowHeightPx + style.rowGapPx);
}

function rowLabelWidth(program: LinerankProgram): number {
  const { frame, style } = program;
  return frame.widthPx - style.leftPaddingPx - style.numberWidthPx - style.rightPaddingPx;
}

export function renderLinerankBoard(space: ProgramSpace, program: LinerankProgram): VisualTrack {
  assertProgramSpaceIdentity(space);
  assertLinerankProgram(program);
  assertLinerankSchedule(program.schedule);
  const { frame, style, schedule, title, items } = program;
  const maxRank = Math.max(...items.map((item) => item.rank));
  const labelWidth = rowLabelWidth(program);
  const presents: VisualPresent[] = [];

  for (const [windowIndex, window] of schedule.windows.entries()) {
    const boardElements: VisualElement[] = [];
    // Paper surface.
    boardElements.push(absoluteBox({
      id: "paper", order: 0, x: frame.xPx, y: frame.yPx, width: frame.widthPx, height: frame.heightPx,
      style: [
        { name: "background", value: style.paperBackground },
        { name: "box-sizing", value: "border-box" },
        { name: "overflow", value: "hidden" },
      ],
    }));
    // Graph-paper grid: faint horizontal and vertical ruled lines.
    const lineCount = Math.floor(frame.heightPx / style.ruleGapPx);
    for (let line = 1; line <= lineCount; line += 1) {
      const y = frame.yPx + line * style.ruleGapPx;
      if (y >= frame.yPx + frame.heightPx) break;
      boardElements.push(absoluteBox({
        id: `rule-h-${line}`, parent: "paper", order: boardElements.length,
        x: 0, y, width: frame.widthPx, height: 1,
        style: [{ name: "background", value: style.ruleColor }],
      }));
    }
    const columnCount = Math.floor(frame.widthPx / style.ruleGapPx);
    for (let column = 1; column <= columnCount; column += 1) {
      const x = frame.xPx + column * style.ruleGapPx;
      if (x >= frame.xPx + frame.widthPx) break;
      boardElements.push(absoluteBox({
        id: `rule-v-${column}`, parent: "paper", order: boardElements.length,
        x, y: 0, width: 1, height: frame.heightPx,
        style: [{ name: "background", value: style.ruleColor }],
      }));
    }
    // Title, centered near the top.
    boardElements.push(simpleText({
      id: "title", parent: "paper", order: boardElements.length,
      text: title, typography: style.title,
      x: style.leftPaddingPx, y: 36, width: frame.widthPx - style.leftPaddingPx - style.rightPaddingPx,
      height: style.title.sizePx * style.title.lineHeight * 2,
      align: "center",
      nowrap: false,
    }));
    // Empty numbered rows for every rank.
    for (let rank = 1; rank <= maxRank; rank += 1) {
      const y = rowY(program, rank);
      boardElements.push(simpleText({
        id: `number-${rank}`, parent: "paper", order: boardElements.length,
        text: `${rank}.`, typography: style.number,
        x: style.leftPaddingPx, y, width: style.numberWidthPx, height: style.rowHeightPx,
        align: "left",
      }));
    }
    // Revealed labels.
    for (let index = 0; index <= windowIndex && index < items.length; index += 1) {
      const item = items[index]!;
      const width = Math.min(estimatedLabelWidth(item.label, style), labelWidth);
      const y = rowY(program, item.rank);
      const firstReveal = index === windowIndex;
      const typingFrames = Math.max(1, Math.round(item.label.length * style.typeFramesPerChar));
      boardElements.push(simpleText({
        id: `label-${item.id}`, parent: "paper", order: boardElements.length,
        text: item.label, typography: style.label,
        x: style.leftPaddingPx + style.numberWidthPx, y,
        width: firstReveal ? width : labelWidth,
        height: style.rowHeightPx,
        align: "left",
        ...(firstReveal ? {
          animation: typewriterAnimation(window.endFrameExclusive - window.startFrame, typingFrames, width),
        } : {}),
      }));
    }
    presents.push(present({
      id: `${program.id}:board:${windowIndex}`,
      start: window.startFrame,
      end: window.endFrameExclusive,
      stacking: style.boardStackingOrder,
      tieBreak: `${program.id}:${String(windowIndex).padStart(4, "0")}:board`,
      elements: boardElements,
    }));
    // Hand-drawn circle around rank 1 in the final window.
    if (windowIndex === schedule.windows.length - 1) {
      const circleWidth = labelWidth;
      const circleX = style.leftPaddingPx + style.numberWidthPx + circleWidth / 2;
      const circleY = rowY(program, 1) + style.rowHeightPx / 2;
      const offset = schedule.terminalFrame - window.startFrame;
      presents.push(present({
        id: `${program.id}:circle`,
        start: window.startFrame,
        end: window.endFrameExclusive,
        stacking: style.circleStackingOrder,
        tieBreak: `${program.id}:${String(windowIndex).padStart(4, "0")}:circle`,
        elements: [absoluteBox({
          id: "circle", order: 0,
          x: circleX, y: circleY, width: circleWidth, height: style.rowHeightPx * 1.35,
          style: [
            { name: "border", value: `${px(style.circleWidthPx)} solid ${style.circleColor}` },
            { name: "border-radius", value: "50% / 55% 45% 60% 40%" },
            { name: "box-sizing", value: "border-box" },
            { name: "transform", value: "translate(-50%,-50%) scale(0.72) rotate(-2deg)" },
          ],
          animation: circleAnimation(offset, style.circleFrames, window.endFrameExclusive - window.startFrame),
        })],
      }));
    }
  }

  const track = sealVisualTrack({ visualIr: "hypit.visual-ir@1", id: program.id, presents });
  assertVisualTrackIdentity(track, space);
  return track;
}
