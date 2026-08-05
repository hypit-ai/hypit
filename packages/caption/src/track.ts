import {
  assertProgramSpaceIdentity,
  assertVisualTrackIdentity,
  programSpaceFrameCount,
  sealVisualTrack,
} from "@svml/contracts";
import type { VisualStyleDeclaration, VisualTrack } from "@svml/contracts";
import { digestOf, isDigest } from "@svml/protocol";
import type { Digest } from "@svml/protocol";

import { planCaptionPresentation } from "./presentation.js";
import type { TimedCaptionProjection } from "./types.js";
import type { CaptionTrackProgram } from "./types.js";

export const renderCaptionTrackImplementationDigest = digestOf("@svml/caption/render-track@1");

function normalizedProgram(value: Omit<CaptionTrackProgram, "digest">): Omit<CaptionTrackProgram, "digest"> {
  return {
    contract: "svml.caption-track-program@1",
    id: value.id,
    mode: value.mode,
    stacking: { ...value.stacking },
    style: { ...value.style },
  };
}

export function computeCaptionTrackProgramDigest(value: Omit<CaptionTrackProgram, "digest">): Digest {
  return digestOf(normalizedProgram(value));
}

export function sealCaptionTrackProgram(value: Omit<CaptionTrackProgram, "digest">): CaptionTrackProgram {
  const content = normalizedProgram(value);
  return { ...content, digest: digestOf(content) };
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
  const { digest: _digest, ...content } = program;
  if (!isDigest(program.digest) || program.digest !== computeCaptionTrackProgramDigest(content)) {
    throw new Error("CaptionTrackProgram digest does not match its contents.");
  }
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
  };
  for (const [name, value] of Object.entries(numeric)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`CaptionTrackProgram ${name} is invalid.`);
  }
  if (program.style.fontSizePx <= 0 || program.style.maxWidthPercent <= 0 || program.style.maxWidthPercent > 100) {
    throw new Error("CaptionTrackProgram text size or width is invalid.");
  }
  if (program.style.bottomPercent > 100) throw new Error("CaptionTrackProgram bottomPercent is invalid.");
  for (const color of [program.style.color, program.style.backgroundColor].filter((value): value is string => value !== undefined)) {
    if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/u.test(color)) throw new Error(`CaptionTrackProgram color ${color} is invalid.`);
  }
}

function assertProjection(projection: TimedCaptionProjection): void {
  if (projection.contract !== "svml.timed-caption-projection@1") {
    throw new Error("Unsupported TimedCaptionProjection contract.");
  }
  assertProgramSpaceIdentity(projection.programSpace);
  const { projectionDigest: _digest, ...content } = projection;
  if (!isDigest(projection.projectionDigest) || projection.projectionDigest !== digestOf(content)) {
    throw new Error("TimedCaptionProjection digest does not match its contents.");
  }
}

function frameAt(projection: TimedCaptionProjection, seconds: number): number {
  return Math.round(seconds
    * projection.programSpace.frameRate.numerator
    / projection.programSpace.frameRate.denominator);
}

function textStyle(program: CaptionTrackProgram): VisualStyleDeclaration[] {
  return [
    { name: "background", value: program.style.backgroundColor ?? "transparent" },
    { name: "border-radius", value: `${program.style.borderRadiusPx}px` },
    { name: "color", value: program.style.color },
    { name: "font-family", value: program.style.fontFamily },
    { name: "font-size", value: `${program.style.fontSizePx}px` },
    { name: "font-weight", value: program.style.fontWeight },
    { name: "padding", value: `${program.style.paddingYPx}px ${program.style.paddingXPx}px` },
    { name: "text-align", value: program.style.textAlign },
    { name: "white-space", value: "pre-wrap" },
  ];
}

export function renderCaptionTrack(
  projection: TimedCaptionProjection,
  program: CaptionTrackProgram,
): VisualTrack {
  assertProjection(projection);
  assertCaptionTrackProgram(program);
  const totalFrames = programSpaceFrameCount(projection.programSpace);
  const plan = planCaptionPresentation(projection, program.mode);
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    id: program.id,
    programSpaceDigest: projection.programSpace.digest,
    sources: [
      { name: "program", digest: program.digest },
      { name: "projection", digest: projection.projectionDigest },
    ],
    presents: plan.units.flatMap((unit) => {
      const startFrame = Math.max(0, frameAt(projection, unit.startSec));
      const measuredEnd = Math.min(totalFrames, frameAt(projection, unit.endSec));
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
            style: [
              { name: "align-items", value: "center" },
              { name: "bottom", value: `${program.style.bottomPercent}%` },
              { name: "display", value: "flex" },
              { name: "justify-content", value: "center" },
              { name: "left", value: "50%" },
              { name: "max-width", value: `${program.style.maxWidthPercent}%` },
              { name: "position", value: "absolute" },
              { name: "transform", value: "translateX(-50%)" },
            ],
          },
          {
            id: "text",
            parent: "root",
            order: 1,
            kind: "text" as const,
            text: unit.display,
            style: textStyle(program),
            attributes: [
              { name: "data-caption-basis", value: unit.basis },
              { name: "data-caption-quality", value: unit.timingQuality },
            ],
          },
        ],
      }];
    }),
  });
  assertVisualTrackIdentity(track, projection.programSpace);
  return track;
}
