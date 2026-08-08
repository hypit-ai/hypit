import { assertCaptionProgramForWords, assertTimedCaptionProjection } from "@narratage/caption";
import type {
  CaptionFieldAssignment,
  CaptionProgram,
  TimedCaptionProjection,
} from "@narratage/caption";
import { assertVisualTrackIdentity, sealVisualTrack } from "@narratage/composition";
import type { VisualElement, VisualStyleDeclaration, VisualTrack } from "@narratage/composition";
import type { CaptionWordSequence } from "@narratage/narrative";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";

import { assertFineCaptionParameters, FINE_CAPTION_FAMILY } from "./style.js";
import type { FineCaptionParameters } from "./types.js";

export const renderFineCaptionImplementationDigest = digestOf("@narratage/caption-fine/render@1");

function frameAt(space: ProgramSpace, seconds: number): number {
  return Math.round(seconds * space.frameRate.numerator / space.frameRate.denominator);
}

function captionPieces(
  display: string,
  wordIds: readonly string[],
  wordText: ReadonlyMap<string, string>,
): string[] {
  let cursor = 0;
  const starts = wordIds.map((wordId) => {
    const text = wordText.get(wordId);
    if (text === undefined) throw new Error(`Fine Caption Cue references unknown word ${wordId}`);
    const start = display.indexOf(text, cursor);
    if (start < cursor) throw new Error(`Fine Caption Cue cannot locate word ${wordId} in its authored display`);
    cursor = start + text.length;
    return start;
  });
  return starts.map((start, index) => display.slice(index === 0 ? 0 : start, starts[index + 1] ?? display.length));
}

function textStyle(parameters: FineCaptionParameters, important: boolean): VisualStyleDeclaration[] {
  return [
    { name: "color", value: important ? parameters.important.fill : parameters.typography.fill },
    { name: "font-family", value: parameters.typography.fontFamily },
    { name: "font-size", value: `${parameters.typography.fontSizePx}px` },
    { name: "font-weight", value: parameters.typography.fontWeight },
    { name: "line-height", value: parameters.typography.lineHeight },
    { name: "white-space", value: "pre-wrap" },
    ...(important ? [{ name: "transform", value: `scale(${parameters.important.scale})` }] : []),
  ];
}

function isImportant(fields: readonly CaptionFieldAssignment[], wordId: string): boolean {
  return fields.some((field) =>
    field.declarationId === "important" && field.wordId === wordId && field.value === "true");
}

function cueElements(
  display: string,
  wordIds: readonly string[],
  fields: readonly CaptionFieldAssignment[],
  parameters: FineCaptionParameters,
  wordText: ReadonlyMap<string, string>,
): VisualElement[] {
  const pieces = captionPieces(display, wordIds, wordText);
  return [
    {
      id: "placement",
      order: 0,
      kind: "box",
      style: [
        { name: "align-items", value: "center" },
        { name: "display", value: "flex" },
        { name: "justify-content", value: parameters.typography.textAlign === "left" ? "flex-start"
          : parameters.typography.textAlign === "right" ? "flex-end" : "center" },
        { name: "left", value: `${parameters.placement.x * 100}%` },
        { name: "position", value: "absolute" },
        { name: "top", value: `${parameters.placement.y * 100}%` },
        { name: "width", value: `${parameters.placement.width * 100}%` },
      ],
    },
    {
      id: "cue",
      parent: "placement",
      order: 1,
      kind: "box",
      style: [
        { name: "background", value: parameters.box.background },
        { name: "border-radius", value: `${parameters.box.radiusPx}px` },
        { name: "display", value: "flex" },
        { name: "flex-wrap", value: "wrap" },
        { name: "justify-content", value: parameters.typography.textAlign === "left" ? "flex-start"
          : parameters.typography.textAlign === "right" ? "flex-end" : "center" },
        { name: "padding", value: `${parameters.box.paddingYPx}px ${parameters.box.paddingXPx}px` },
        { name: "text-align", value: parameters.typography.textAlign },
      ],
    },
    ...wordIds.map((wordId, index): VisualElement => {
      const important = isImportant(fields, wordId);
      return {
        id: `word-${index + 1}`,
        parent: "cue",
        order: index + 2,
        kind: "text",
        text: pieces[index]!,
        style: textStyle(parameters, important),
        attributes: [
          { name: "data-caption-word", value: wordId },
          ...(important ? [{ name: "data-caption-field-important", value: "true" }] : []),
        ],
      };
    }),
  ];
}

export function renderFineCaption(
  projection: TimedCaptionProjection,
  program: CaptionProgram,
  words: CaptionWordSequence,
  space: ProgramSpace,
): VisualTrack {
  assertTimedCaptionProjection(projection);
  assertCaptionProgramForWords(program, words);
  assertProgramSpaceIdentity(space);
  const styles = new Map(program.styles.map((style) => [style.id, style]));
  const wordText = new Map(words.words.map((word) => [word.id, word.text]));
  for (const style of styles.values()) {
    if (style.rendering.family !== FINE_CAPTION_FAMILY) {
      throw new Error(`Fine Caption cannot render Style family ${style.rendering.family}`);
    }
    assertFineCaptionParameters(style.rendering.parameters as unknown as FineCaptionParameters);
  }
  const totalFrames = programSpaceFrameCount(space);
  const presents = projection.regions.flatMap((region) => {
    if (region.styleId === undefined || region.wordIds === undefined || region.wordIds.length === 0) {
      throw new Error(`Fine Caption region ${region.id} lacks resolved Style or word identities`);
    }
    const style = styles.get(region.styleId);
    if (style === undefined) throw new Error(`Fine Caption region ${region.id} references unknown Style ${region.styleId}`);
    const parameters = style.rendering.parameters as unknown as FineCaptionParameters;
    const startFrame = Math.max(0, frameAt(space, region.startSec));
    const measuredEnd = Math.min(totalFrames, frameAt(space, region.endSec));
    const endFrameExclusive = Math.min(totalFrames, Math.max(startFrame + 1, measuredEnd));
    if (!region.display || startFrame >= totalFrames || endFrameExclusive <= startFrame) return [];
    return [{
      id: region.id,
      span: { startFrame, endFrameExclusive },
      stacking: { order: parameters.stackingOrder, tieBreak: `${program.id}:${region.id}` },
      elements: cueElements(region.display, region.wordIds, region.fields ?? [], parameters, wordText),
    }];
  });
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: program.id,
    presents,
  });
  assertVisualTrackIdentity(track, space);
  return track;
}
