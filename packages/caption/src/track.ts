import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { assertVisualTrackIdentity, sealVisualTrack } from "@narratage/composition";
import type { Track, VisualStyleDeclaration, VisualTrack } from "@narratage/composition";
import { digestOf } from "@narratage/protocol";

import { planCaptionPresentation } from "./presentation.js";
import { assertCaptionProgram } from "./style.js";
import type { CaptionProgram, CaptionTrackProgram, TimedCaptionProjection } from "./types.js";

export const renderCaptionTrackImplementationDigest = digestOf("@narratage/caption/render-track@1");
export const renderCaptionProgramImplementationDigest = digestOf("@narratage/caption/render-program@1");

function normalizedProgram(value: CaptionTrackProgram): CaptionTrackProgram {
  return {
    contract: "svml.caption-track-program@1",
    id: value.id,
    mode: value.mode,
    stacking: { ...value.stacking },
    style: { ...value.style },
  };
}

export function sealCaptionTrackProgram(value: CaptionTrackProgram): CaptionTrackProgram {
  return normalizedProgram(value);
}

export function defaultCaptionTrackProgram(id = "captions"): CaptionTrackProgram {
  return sealCaptionTrackProgram({
    contract: "svml.caption-track-program@1",
    id,
    mode: "whole",
    stacking: { order: 100, tieBreak: id },
    style: {
      fontFamily: "Inter, sans-serif",
      fontSizePx: 72,
      fontWeight: 700,
      color: "#ffffff",
      backgroundColor: "#000000cc",
      paddingXPx: 24,
      paddingYPx: 12,
      borderRadiusPx: 16,
      bottomPercent: 10,
      maxWidthPercent: 88,
      textAlign: "center",
    },
  });
}

export function assertCaptionTrackProgram(program: CaptionTrackProgram): void {
  if (program.contract !== "svml.caption-track-program@1") throw new Error("Unsupported CaptionTrackProgram contract.");
  if (!program.id || !program.stacking.tieBreak || !program.style.fontFamily) {
    throw new Error("CaptionTrackProgram identity and font family must not be empty.");
  }
  if (!Number.isSafeInteger(program.stacking.order) || program.stacking.order < 0) {
    throw new Error("CaptionTrackProgram stacking order is invalid.");
  }
  const numeric: Readonly<Record<string, number>> = {
    fontSizePx: program.style.fontSizePx,
    fontWeight: program.style.fontWeight,
    paddingXPx: program.style.paddingXPx,
    paddingYPx: program.style.paddingYPx,
    borderRadiusPx: program.style.borderRadiusPx,
    bottomPercent: program.style.bottomPercent,
    maxWidthPercent: program.style.maxWidthPercent,
    ...(program.style.leftPercent === undefined ? {} : { leftPercent: program.style.leftPercent }),
    ...(program.style.topPercent === undefined ? {} : { topPercent: program.style.topPercent }),
    ...(program.style.widthPercent === undefined ? {} : { widthPercent: program.style.widthPercent }),
    ...(program.style.lineHeight === undefined ? {} : { lineHeight: program.style.lineHeight }),
  };
  for (const [name, value] of Object.entries(numeric)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`CaptionTrackProgram ${name} is invalid.`);
  }
  if (program.style.fontSizePx <= 0 || program.style.maxWidthPercent <= 0 || program.style.maxWidthPercent > 100) {
    throw new Error("CaptionTrackProgram text size or width is invalid.");
  }
  if (program.style.bottomPercent > 100) throw new Error("CaptionTrackProgram bottomPercent is invalid.");
  for (const color of [program.style.color, program.style.backgroundColor].filter((value): value is string => value !== undefined)) {
    if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(color)) throw new Error(`CaptionTrackProgram color ${color} is invalid.`);
  }
}

export function assertTimedCaptionProjection(projection: TimedCaptionProjection): void {
  if (projection.contract !== "svml.timed-caption-projection@1") {
    throw new Error("Unsupported TimedCaptionProjection contract.");
  }
}

function frameAt(programSpace: ProgramSpace, seconds: number): number {
  return Math.round(seconds
    * programSpace.frameRate.numerator
    / programSpace.frameRate.denominator);
}

function textStyle(style: CaptionTrackProgram["style"]): VisualStyleDeclaration[] {
  return [
    { name: "background", value: style.backgroundColor ?? "transparent" },
    { name: "border-radius", value: `${style.borderRadiusPx}px` },
    { name: "color", value: style.color },
    { name: "font-family", value: style.fontFamily },
    { name: "font-size", value: `${style.fontSizePx}px` },
    { name: "font-weight", value: style.fontWeight },
    ...(style.lineHeight === undefined ? [] : [{ name: "line-height", value: style.lineHeight }]),
    { name: "padding", value: `${style.paddingYPx}px ${style.paddingXPx}px` },
    { name: "text-align", value: style.textAlign },
    { name: "white-space", value: "pre-wrap" },
  ];
}

export function renderCaptionTrack(
  projection: TimedCaptionProjection,
  program: CaptionTrackProgram,
  programSpace: ProgramSpace,
): VisualTrack {
  assertTimedCaptionProjection(projection);
  assertCaptionTrackProgram(program);
  assertProgramSpaceIdentity(programSpace);
  const totalFrames = programSpaceFrameCount(programSpace);
  const plan = planCaptionPresentation(projection, program.mode);
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: program.id,
    presents: plan.units.flatMap((unit) => {
      const startFrame = Math.max(0, frameAt(programSpace, unit.startSec));
      const measuredEnd = Math.min(totalFrames, frameAt(programSpace, unit.endSec));
      const endFrameExclusive = Math.min(totalFrames, Math.max(startFrame + 1, measuredEnd));
      if (!unit.display || startFrame >= totalFrames || endFrameExclusive <= startFrame) return [];
      return [{
        id: unit.id,
        span: { startFrame, endFrameExclusive },
        stacking: { order: program.stacking.order, tieBreak: `${program.stacking.tieBreak}:${unit.id}` },
        elements: [
          {
            id: "root",
            order: 0,
            kind: "box" as const,
            style: program.style.leftPercent === undefined || program.style.topPercent === undefined || program.style.widthPercent === undefined ? [
              { name: "align-items", value: "center" },
              { name: "bottom", value: `${program.style.bottomPercent}%` },
              { name: "display", value: "flex" },
              { name: "justify-content", value: "center" },
              { name: "left", value: "50%" },
              { name: "max-width", value: `${program.style.maxWidthPercent}%` },
              { name: "position", value: "absolute" },
              { name: "transform", value: "translateX(-50%)" },
            ] : [
              { name: "align-items", value: "center" },
              { name: "display", value: "flex" },
              { name: "justify-content", value: "center" },
              { name: "left", value: `${program.style.leftPercent}%` },
              { name: "position", value: "absolute" },
              { name: "top", value: `${program.style.topPercent}%` },
              { name: "width", value: `${program.style.widthPercent}%` },
            ],
          },
          {
            id: "text",
            parent: "root",
            order: 1,
            kind: "text" as const,
            text: unit.display,
            style: textStyle(program.style),
            attributes: [
              ...(unit.runId === undefined ? [] : [{ name: "data-caption-run", value: unit.runId }]),
              ...(unit.fields === undefined ? [] : [{ name: "data-caption-fields", value: JSON.stringify(unit.fields) }]),
            ],
          },
        ],
      }];
    }),
  });
  assertVisualTrackIdentity(track, programSpace);
  return track;
}

/** Render one peer Track whose Presents may each select a complete, resolved Caption Style. */
export function renderCaptionProgram(
  projection: TimedCaptionProjection,
  program: CaptionProgram,
  programSpace: ProgramSpace,
): VisualTrack {
  assertTimedCaptionProjection(projection);
  assertCaptionProgram(program);
  const styles = new Map(program.styles.map((style) => [style.id, style]));
  assertProgramSpaceIdentity(programSpace);
  const totalFrames = programSpaceFrameCount(programSpace);
  const units = projection.regions.flatMap((region) => {
    const styleId = region.styleId ?? program.defaultStyleId;
    const style = styles.get(styleId);
    if (style === undefined) throw new Error(`Caption region ${region.id} references unknown Style ${styleId}`);
    return planCaptionPresentation(
      { regions: [region] },
      style.presentation.mode,
    ).units.map((unit) => ({ unit, style }));
  });
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: program.id,
    presents: units.flatMap(({ unit, style }) => {
      const startFrame = Math.max(0, frameAt(programSpace, unit.startSec));
      const measuredEnd = Math.min(totalFrames, frameAt(programSpace, unit.endSec));
      const endFrameExclusive = Math.min(totalFrames, Math.max(startFrame + 1, measuredEnd));
      if (!unit.display || startFrame >= totalFrames || endFrameExclusive <= startFrame) return [];
      const appearance = style.presentation.style;
      return [{
        id: unit.id,
        span: { startFrame, endFrameExclusive },
        stacking: { order: style.presentation.stackingOrder, tieBreak: `${program.id}:${unit.id}` },
        elements: [
          {
            id: "root",
            order: 0,
            kind: "box" as const,
            style: appearance.leftPercent === undefined || appearance.topPercent === undefined || appearance.widthPercent === undefined ? [
              { name: "align-items", value: "center" },
              { name: "bottom", value: `${appearance.bottomPercent}%` },
              { name: "display", value: "flex" },
              { name: "justify-content", value: "center" },
              { name: "left", value: "50%" },
              { name: "max-width", value: `${appearance.maxWidthPercent}%` },
              { name: "position", value: "absolute" },
              { name: "transform", value: "translateX(-50%)" },
            ] : [
              { name: "align-items", value: "center" },
              { name: "display", value: "flex" },
              { name: "justify-content", value: "center" },
              { name: "left", value: `${appearance.leftPercent}%` },
              { name: "position", value: "absolute" },
              { name: "top", value: `${appearance.topPercent}%` },
              { name: "width", value: `${appearance.widthPercent}%` },
            ],
          },
          {
            id: "text",
            parent: "root",
            order: 1,
            kind: "text" as const,
            text: unit.display,
            style: textStyle(appearance),
            attributes: [
              { name: "data-caption-style", value: style.id },
              ...(unit.runId === undefined ? [] : [{ name: "data-caption-run", value: unit.runId }]),
              ...(unit.fields === undefined ? [] : [{ name: "data-caption-fields", value: JSON.stringify(unit.fields) }]),
            ],
          },
        ],
      }];
    }),
  });
  assertVisualTrackIdentity(track, programSpace);
  return track;
}
