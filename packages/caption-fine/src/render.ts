import { assertCaptionProgramForDisplay, assertTimedCaptionProjection } from "@narratage/caption";
import type { CaptionProgram, TimedCaptionProjection } from "@narratage/caption";
import { assertVisualTrackIdentity, sealVisualTrack } from "@narratage/composition";
import type { VisualElement, VisualStyleDeclaration, VisualTrack } from "@narratage/composition";
import type { CaptionDisplaySequence } from "@narratage/narrative";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";

import { assertFineCaptionParameters, FINE_CAPTION_FAMILY } from "./style.js";
import type { FineCaptionParameters } from "./types.js";

export const renderFineCaptionImplementationDigest = digestOf("@narratage/caption-fine/render-field-free-atoms@1");

function frameAt(space: ProgramSpace, seconds: number): number {
  return Math.round(seconds * space.frameRate.numerator / space.frameRate.denominator);
}

function captionPieces(wordIds: readonly string[], wordText: ReadonlyMap<string, string>): string[] {
  return wordIds.map((wordId, index) => {
    const text = wordText.get(wordId);
    if (text === undefined) throw new Error(`Fine Caption Cue references unknown word ${wordId}`);
    return index === wordIds.length - 1 ? text : `${text} `;
  });
}

function textStyle(parameters: FineCaptionParameters): VisualStyleDeclaration[] {
  return [
    { name: "color", value: parameters.typography.fill },
    { name: "font-family", value: parameters.typography.fontFamily },
    { name: "font-size", value: `${parameters.typography.fontSizePx}px` },
    { name: "font-weight", value: parameters.typography.fontWeight },
    { name: "line-height", value: parameters.typography.lineHeight },
    { name: "white-space", value: "pre-wrap" },
  ];
}

function cueElements(
  wordIds: readonly string[],
  parameters: FineCaptionParameters,
  wordText: ReadonlyMap<string, string>,
): VisualElement[] {
  const pieces = captionPieces(wordIds, wordText);
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
      return {
        id: `word-${index + 1}`,
        parent: "cue",
        order: index + 2,
        kind: "text",
        text: pieces[index]!,
        style: textStyle(parameters),
        attributes: [{ name: "data-caption-word", value: wordId }],
      };
    }),
  ];
}

export function renderFineCaption(
  projection: TimedCaptionProjection,
  program: CaptionProgram,
  display: CaptionDisplaySequence,
  space: ProgramSpace,
): VisualTrack {
  assertTimedCaptionProjection(projection);
  assertCaptionProgramForDisplay(program, display);
  if (projection.displaySequenceId !== display.id) throw new Error("Fine Caption received another display sequence");
  assertProgramSpaceIdentity(space);
  const styles = new Map(program.styles.map((style) => [style.id, style]));
  const wordText = new Map(display.words.map((word) => [word.id, word.text]));
  const atomById = new Map(display.atoms.map((atom) => [atom.id, atom]));
  for (const style of styles.values()) {
    if (style.rendering.family !== FINE_CAPTION_FAMILY) {
      throw new Error(`Fine Caption cannot render Style family ${style.rendering.family}`);
    }
    assertFineCaptionParameters(style.rendering.parameters as unknown as FineCaptionParameters);
  }
  const totalFrames = programSpaceFrameCount(space);
  const presents = projection.cues.flatMap((cue) => {
    const atoms = cue.atoms.map((timing) => atomById.get(timing.atomId));
    if (atoms.some((atom) => atom === undefined)) throw new Error(`Fine Caption Cue ${cue.id} references unknown Atom`);
    const resolvedAtoms = atoms.map((atom) => atom!);
    const wordIds = resolvedAtoms.flatMap((atom) => atom.wordIds);
    const style = styles.get(cue.styleId);
    if (style === undefined) throw new Error(`Fine Caption Cue ${cue.id} references unknown Style ${cue.styleId}`);
    const parameters = style.rendering.parameters as unknown as FineCaptionParameters;
    if (cue.fields.length > 0) throw new Error(`Fine Caption Cue ${cue.id} contains unsupported fields`);
    const startFrame = Math.max(0, frameAt(space, cue.startSec));
    const measuredEnd = Math.min(totalFrames, frameAt(space, cue.endSec));
    const endFrameExclusive = Math.min(totalFrames, Math.max(startFrame + 1, measuredEnd));
    if (startFrame >= totalFrames || endFrameExclusive <= startFrame) return [];
    return [{
      id: cue.id,
      span: { startFrame, endFrameExclusive },
      stacking: { order: parameters.stackingOrder, tieBreak: `${program.id}:${cue.id}` },
      elements: cueElements(wordIds, parameters, wordText),
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
