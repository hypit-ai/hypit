import { assertVisualTrackIdentity, sealVisualTrack } from "@hypit/composition";
import type {
  FrameSpan,
  VisualElement,
  VisualPresent,
  VisualStyleDeclaration,
  VisualTextDocument,
  VisualTextFlow,
  VisualTextPaintLayer,
  VisualTextSequenceAnimation,
  VisualTextTypography,
  VisualTrack,
} from "@hypit/composition";
import type { FontArtifactRef } from "@hypit/media";
import { assertProgramSpaceIdentity } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";

import { assertNotepadProgram } from "./schedule.js";
import type {
  NotepadProgram,
  NotepadRowSpec,
  NotepadStyle,
  NotepadTitlePaint,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function px(value: number): string {
  return `${Math.round(value * 1_000_000) / 1_000_000}px`;
}

/** Grapheme count as the browser sequence renderer counts it. */
function graphemeCount(value: string): number {
  return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value)].length;
}

function typography(
  fonts: readonly FontArtifactRef[],
  sizePx: number,
  lineHeight: number,
  trackingPx: number,
): VisualTextTypography {
  const face = fonts[0]!;
  return {
    fonts: structuredClone(fonts),
    sizePx,
    weight: face.weight,
    style: face.style,
    axes: [],
    features: [],
    synthesis: "none",
    kerning: "auto",
    trackingPx,
    wordSpacingPx: 0,
    lineHeight,
    direction: "ltr",
    writingMode: "horizontal-tb",
    baselineShiftPx: 0,
    tabSize: 4,
    indentationPx: 0,
    paragraphBeforePx: 0,
    paragraphAfterPx: 0,
    transform: "none",
    variantCaps: "normal",
    verticalAlign: "baseline",
    decorations: [],
    cjk: { textSpacing: "normal", punctuationTrim: "none" },
  };
}

function paints(color: string, shadow?: NotepadTitlePaint["shadow"]): VisualTextPaintLayer[] {
  const layers: VisualTextPaintLayer[] = [];
  if (shadow !== undefined) layers.push({
    kind: "shadow",
    paint: { kind: "solid", color: shadow.color },
    offsetX: shadow.offsetX,
    offsetY: shadow.offsetY,
    blurPx: shadow.blurPx,
    spreadPx: 0,
  });
  layers.push({ kind: "fill", paint: { kind: "solid", color } });
  return layers;
}

function areaFlow(inlineAlign: "start" | "center" | "end"): VisualTextFlow {
  return {
    form: { kind: "area" },
    inlineSize: "fixed",
    blockSize: "hug",
    paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
    inlineAlign,
    blockAlign: "start",
    wrap: "word",
    overflow: "visible",
    clipToFrame: false,
    columns: 1,
    columnGapPx: 0,
    metricEdge: "line-box",
  };
}

/** A grapheme-by-grapheme reveal: nothing is drawn until its own character is typed. */
function typewriter(
  id: string,
  characters: number,
  startFrame: number,
  staggerFrames: number,
): VisualTextSequenceAnimation {
  return {
    id,
    unit: "grapheme",
    range: { start: 0, endExclusive: characters },
    order: "forward",
    startFrame,
    unitDurationFrames: 1,
    staggerFrames,
    cycles: 1,
    keyframes: [
      { atProgress: 0, style: [{ name: "opacity", value: 0 }] },
      { atProgress: 1, style: [{ name: "opacity", value: 1 }] },
    ],
  };
}

function box(input: {
  readonly id: string;
  readonly order: number;
  readonly parent?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly style?: readonly VisualStyleDeclaration[];
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
  };
}

function flowText(input: {
  readonly id: string;
  readonly order: number;
  readonly parent: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly document: VisualTextDocument;
  readonly typography: VisualTextTypography;
  readonly paints: readonly VisualTextPaintLayer[];
  readonly align?: "start" | "center" | "end";
  readonly sequences?: readonly VisualTextSequenceAnimation[];
}): VisualElement {
  return {
    id: input.id,
    parent: input.parent,
    order: input.order,
    kind: "text-flow",
    document: input.document,
    typography: input.typography,
    paints: [...input.paints],
    flow: areaFlow(input.align ?? "start"),
    sequences: [...(input.sequences ?? [])],
    style: [
      { name: "left", value: px(input.x) },
      { name: "position", value: "absolute" },
      { name: "top", value: px(input.y) },
      { name: "width", value: px(input.width) },
    ],
  };
}

/** The one title document: an italic lead run followed by the emphasized run. */
function titleDocument(
  program: NotepadProgram,
  paint: NotepadTitlePaint,
): { readonly document: VisualTextDocument; readonly characters: number } {
  const { style, title } = program;
  const emphasis = typography(style.emphasisFonts, paint.sizePx, paint.lineHeight, paint.trackingPx);
  const document: VisualTextDocument = {
    paragraphs: [{
      id: `${program.id}-title`,
      inlines: [
        { kind: "text", id: `${program.id}-title-lead`, text: title.lead },
        ...(title.emphasis.length === 0 ? [] : [{
          kind: "text" as const,
          id: `${program.id}-title-emphasis`,
          text: title.emphasis,
          style: {
            typography: {
              fonts: emphasis.fonts,
              weight: emphasis.weight,
              style: emphasis.style,
              ...(paint.underlinePx > 0
                ? {
                    decorations: [{
                      line: "underline" as const,
                      paint: { kind: "solid" as const, color: paint.color },
                      style: "solid" as const,
                      thicknessPx: paint.underlinePx,
                      skipInk: false,
                    }],
                  }
                : {}),
            },
          },
        }]),
      ],
    }],
  };
  return { document, characters: graphemeCount(title.lead) + graphemeCount(title.emphasis) };
}

function rowDocument(program: NotepadProgram, row: NotepadRowSpec, id: string): VisualTextDocument {
  return { paragraphs: [{ id: `${id}-p`, inlines: [{ kind: "text", id: `${id}-run`, text: row.label }] }] };
}

function rowTop(style: NotepadStyle, frameHeight: number, index: number): number {
  return frameHeight * style.row.topFraction + index * style.row.gapPx;
}

function present(input: {
  readonly id: string;
  readonly span: FrameSpan;
  readonly stacking: number;
  readonly tieBreak: string;
  readonly elements: readonly VisualElement[];
}): VisualPresent {
  return {
    id: input.id,
    span: { startFrame: input.span.startFrame, endFrameExclusive: input.span.endFrameExclusive },
    stacking: { order: input.stacking, tieBreak: input.tieBreak },
    elements: input.elements,
  };
}

/**
 * Draws the notepad list: the paper, the title, every numbered slot, the copy
 * already written and the copy typing itself in, plus the annotation drawn
 * around the row that carries one.
 */
export function renderNotepadList(space: ProgramSpace, program: NotepadProgram): VisualTrack {
  assertProgramSpaceIdentity(space);
  assertNotepadProgram(program);
  const { frame, style, schedule } = program;
  const presents: VisualPresent[] = [];
  const ordered = [...program.rows].sort((left, right) => left.rank - right.rank);

  if (schedule.opening !== undefined) {
    const paint = style.opening;
    const built = titleDocument(program, paint);
    const root = `${program.id}-opening`;
    presents.push(present({
      id: `${program.id}:opening`,
      span: schedule.opening,
      stacking: style.stacking.title,
      tieBreak: `${program.id}:0000:opening`,
      elements: [
        box({ id: root, order: 0, x: frame.xPx, y: frame.yPx, width: frame.widthPx, height: frame.heightPx }),
        flowText({
          id: `${root}-text`, order: 1, parent: root,
          x: frame.widthPx * paint.xFraction,
          y: frame.heightPx * paint.yFraction,
          width: frame.widthPx * paint.widthFraction,
          document: built.document,
          typography: typography(style.leadFonts, paint.sizePx, paint.lineHeight, paint.trackingPx),
          paints: paints(paint.color, paint.shadow),
          sequences: [typewriter(
            `${root}-type`, built.characters,
            0, style.typing.titleFramesPerCharacter,
          )],
        }),
      ],
    }));
  }

  for (const [windowIndex, window] of schedule.windows.entries()) {
    const suffix = String(windowIndex).padStart(4, "0");
    presents.push(present({
      id: `${program.id}:paper:${suffix}`,
      span: window,
      stacking: style.stacking.surface,
      tieBreak: `${program.id}:${suffix}:paper`,
      elements: [{
        id: `${program.id}-paper-${suffix}`,
        order: 0,
        kind: "image",
        artifact: structuredClone(program.surface),
        style: [
          { name: "height", value: px(frame.heightPx) },
          { name: "left", value: px(frame.xPx) },
          { name: "object-fit", value: style.surfaceFit },
          { name: "position", value: "absolute" },
          { name: "top", value: px(frame.yPx) },
          { name: "width", value: px(frame.widthPx) },
        ],
      }],
    }));

    const titlePaint = style.title;
    const titleBuilt = titleDocument(program, titlePaint);
    const titleRoot = `${program.id}-title-${suffix}`;
    presents.push(present({
      id: `${program.id}:title:${suffix}`,
      span: window,
      stacking: style.stacking.title,
      tieBreak: `${program.id}:${suffix}:title`,
      elements: [
        box({ id: titleRoot, order: 0, x: frame.xPx, y: frame.yPx, width: frame.widthPx, height: frame.heightPx }),
        flowText({
          id: `${titleRoot}-text`, order: 1, parent: titleRoot,
          x: frame.widthPx * titlePaint.xFraction,
          y: frame.heightPx * titlePaint.yFraction,
          width: frame.widthPx * titlePaint.widthFraction,
          document: titleBuilt.document,
          typography: typography(style.leadFonts, titlePaint.sizePx, titlePaint.lineHeight, titlePaint.trackingPx),
          paints: paints(titlePaint.color),
        }),
      ],
    }));

    const rowElements: VisualElement[] = [
      box({
        id: `${program.id}-rows-${suffix}`, order: 0,
        x: frame.xPx, y: frame.yPx, width: frame.widthPx, height: frame.heightPx,
      }),
    ];
    const rowsRoot = `${program.id}-rows-${suffix}`;
    const rowTypography = typography(style.rowFonts, style.row.sizePx, style.row.lineHeight, style.row.trackingPx);
    const numberTypography = typography(style.numberFonts, style.row.sizePx, style.row.lineHeight, style.row.trackingPx);
    const rowPaints = paints(style.row.color);
    const lineHeightPx = style.row.sizePx * style.row.lineHeight;
    for (const [slot, row] of ordered.entries()) {
      const y = rowTop(style, frame.heightPx, slot);
      const x = frame.widthPx * style.row.xFraction;
      rowElements.push(flowText({
        id: `${rowsRoot}-number-${row.id}`, order: rowElements.length, parent: rowsRoot,
        x: x - style.row.numberWidthPx, y,
        width: style.row.numberWidthPx,
        document: { paragraphs: [{
          id: `${rowsRoot}-number-${row.id}-p`,
          inlines: [{ kind: "text", id: `${rowsRoot}-number-${row.id}-run`, text: `${row.rank}.` }],
        }] },
        typography: numberTypography,
        paints: rowPaints,
      }));
      const trigger = schedule.entries.find((entry) => entry.rowId === row.id)!.triggerFrame;
      const written = trigger < window.startFrame;
      const typing = trigger >= window.startFrame && trigger < window.endFrameExclusive;
      if (!written && !typing) continue;
      rowElements.push(flowText({
        id: `${rowsRoot}-label-${row.id}`, order: rowElements.length, parent: rowsRoot,
        x, y,
        width: frame.widthPx * style.row.widthFraction,
        document: rowDocument(program, row, `${rowsRoot}-label-${row.id}`),
        typography: rowTypography,
        paints: rowPaints,
        ...(typing
          ? { sequences: [typewriter(
              `${rowsRoot}-type-${row.id}`,
              graphemeCount(row.label),
              trigger - window.startFrame,
              style.typing.rowFramesPerCharacter,
            )] }
          : {}),
      }));
    }
    presents.push(present({
      id: `${program.id}:rows:${suffix}`,
      span: window,
      stacking: style.stacking.row,
      tieBreak: `${program.id}:${suffix}:rows`,
      elements: rowElements,
    }));

    for (const [slot, row] of ordered.entries()) {
      if (row.mark !== "circle") continue;
      const trigger = schedule.entries.find((entry) => entry.rowId === row.id)!.triggerFrame;
      const settled = trigger + graphemeCount(row.label) * style.typing.rowFramesPerCharacter;
      const start = Math.max(window.startFrame, settled);
      if (start >= window.endFrameExclusive) continue;
      const y = rowTop(style, frame.heightPx, slot);
      const x = frame.widthPx * style.row.xFraction;
      const width = style.row.numberWidthPx
        + graphemeCount(row.label) * style.row.sizePx * style.mark.advance
        + style.mark.padXPx * 2;
      const markRoot = `${program.id}-mark-${row.id}-${suffix}`;
      const markFrames = Math.min(style.mark.frames, window.endFrameExclusive - start);
      presents.push(present({
        id: `${program.id}:mark:${row.id}:${suffix}`,
        span: { startFrame: start, endFrameExclusive: window.endFrameExclusive },
        stacking: row.stackingOrder ?? style.stacking.mark,
        tieBreak: `${program.id}:${suffix}:mark:${row.id}`,
        elements: [
          box({
            id: markRoot, order: 0,
            x: frame.xPx, y: frame.yPx, width: frame.widthPx, height: frame.heightPx,
          }),
          {
            id: `${markRoot}-ellipse`,
            parent: markRoot,
            order: 1,
            kind: "box",
            style: [
              { name: "border", value: `${px(style.mark.strokeWidthPx)} solid ${style.mark.color}` },
              { name: "border-radius", value: "50%" },
              { name: "box-sizing", value: "border-box" },
              { name: "height", value: px(lineHeightPx + style.mark.padYPx * 2) },
              { name: "left", value: px(x - style.row.numberWidthPx - style.mark.padXPx) },
              { name: "position", value: "absolute" },
              { name: "top", value: px(y - style.mark.padYPx) },
              { name: "transform-origin", value: "50% 50%" },
              { name: "width", value: px(width) },
            ],
            animation: {
              keyframes: [
                {
                  atFrame: 0,
                  easing: "ease-out",
                  style: [
                    { name: "clip-path", value: "inset(0 100% 0 0)" },
                    { name: "transform", value: `rotate(${style.mark.rotateDeg}deg)` },
                  ],
                },
                {
                  atFrame: markFrames,
                  style: [
                    { name: "clip-path", value: "inset(0 0 0 0)" },
                    { name: "transform", value: `rotate(${style.mark.rotateDeg}deg)` },
                  ],
                },
              ],
            },
          },
        ],
      }));
    }
  }
  assert(presents.length > 0, `Notepad list ${program.id} produced no Present.`);
  const track = sealVisualTrack({ visualIr: "hypit.visual-ir@1", id: program.id, presents });
  assertVisualTrackIdentity(track, space);
  return track;
}
