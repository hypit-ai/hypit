import { applyCaptionMute, assertCaptionProgramForDocument, assertTimedCaptionProjection } from "@hypit/caption";
import type { CaptionProgram, TimedCaptionProjection } from "@hypit/caption";
import type { CaptionDocument } from "@hypit/narrative";

import { assertFineCaptionParameters, FINE_CAPTION_FAMILY } from "./style.js";
import type { FineCaptionParameters, FineCaptionSchedule, FineCaptionScheduledCue } from "./types.js";

function assertIntegerFrame(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer Frame`);
}

/**
 * Resolve visible Cue envelopes before the renderer runs.
 *
 * Semantic unit timing stays untouched. `leadFrames` and `tailFrames` only
 * widen the visible envelope, and `cut` prevents adjacent Cues from competing
 * for the same handoff interval without shortening either Cue's spoken time.
 */
export function scheduleFineCaption(
  projection: TimedCaptionProjection,
  program: CaptionProgram,
  document: CaptionDocument,
): FineCaptionSchedule {
  assertTimedCaptionProjection(projection);
  assertCaptionProgramForDocument(program, document);
  if (projection.documentId !== document.id) throw new Error("Fine Caption Schedule received another CaptionDocument");
  if (projection.narrativeId !== document.narrativeId) {
    throw new Error("Fine Caption Schedule received a CaptionDocument from another Narrative");
  }
  if (program.wordRuns.length !== 0) {
    throw new Error("Fine Caption accepts one uniform token rule and cannot consume word-specific Style runs");
  }
  const visibleProjection = applyCaptionMute(projection, program, document);

  const parameters = new Map<string, FineCaptionParameters>();
  for (const style of program.styles) {
    if (style.rendering.family !== FINE_CAPTION_FAMILY) {
      throw new Error(`Fine Caption cannot schedule Style family ${style.rendering.family}`);
    }
    const value = style.rendering.parameters as unknown as FineCaptionParameters;
    assertFineCaptionParameters(value);
    parameters.set(style.id, value);
  }

  const desired = visibleProjection.cues.map((cue): FineCaptionScheduledCue => {
    const style = parameters.get(cue.styleId);
    if (style === undefined) throw new Error(`Fine Caption Cue ${cue.id} references unknown Style ${cue.styleId}`);
    const visibleStartFrame = Math.max(0, cue.startFrame - style.timing.leadFrames);
    const visibleEndFrameExclusive = cue.endFrameExclusive + style.timing.tailFrames;
    return {
      id: cue.id,
      styleId: cue.styleId,
      semanticStartFrame: cue.startFrame,
      semanticEndFrameExclusive: cue.endFrameExclusive,
      visibleStartFrame,
      visibleEndFrameExclusive,
      units: cue.units,
    };
  });

  const cues: FineCaptionScheduledCue[] = [];
  for (const wanted of desired) {
    let cue = wanted;
    const previous = cues.at(-1);
    if (previous !== undefined) {
      const previousStyle = parameters.get(previous.styleId)!;
      const currentStyle = parameters.get(cue.styleId)!;
      if (previousStyle.timing.handoff === "cut" || currentStyle.timing.handoff === "cut") {
        const previousEnd = Math.max(
          previous.semanticEndFrameExclusive,
          Math.min(previous.visibleEndFrameExclusive, cue.semanticStartFrame),
        );
        cues[cues.length - 1] = { ...previous, visibleEndFrameExclusive: previousEnd };
        cue = { ...cue, visibleStartFrame: Math.min(cue.semanticStartFrame, Math.max(cue.visibleStartFrame, previousEnd)) };
      }
    }
    cues.push(cue);
  }

  const ids = new Set<string>();
  for (const cue of cues) {
    if (ids.has(cue.id)) throw new Error(`Fine Caption Schedule repeats Cue ${cue.id}`);
    ids.add(cue.id);
    assertIntegerFrame(cue.semanticStartFrame, `Fine Caption Cue ${cue.id} semantic start`);
    assertIntegerFrame(cue.semanticEndFrameExclusive, `Fine Caption Cue ${cue.id} semantic end`);
    assertIntegerFrame(cue.visibleStartFrame, `Fine Caption Cue ${cue.id} visible start`);
    assertIntegerFrame(cue.visibleEndFrameExclusive, `Fine Caption Cue ${cue.id} visible end`);
    if (cue.semanticEndFrameExclusive <= cue.semanticStartFrame
      || cue.visibleStartFrame > cue.semanticStartFrame
      || cue.visibleEndFrameExclusive < cue.semanticEndFrameExclusive
      || cue.visibleEndFrameExclusive <= cue.visibleStartFrame) {
      throw new Error(`Fine Caption Cue ${cue.id} has an invalid visible envelope`);
    }
  }
  return {
    spaceId: projection.spaceId,
    narrativeId: projection.narrativeId,
    documentId: document.id,
    cues,
  };
}

export function assertFineCaptionSchedule(value: FineCaptionSchedule): void {
  if (!value.spaceId || !value.narrativeId || !value.documentId) {
    throw new Error("Fine Caption Schedule provenance is empty");
  }
  const ids = new Set<string>();
  for (const cue of value.cues) {
    if (!cue.id || !cue.styleId || ids.has(cue.id) || cue.units.length === 0) {
      throw new Error("Fine Caption Schedule contains an invalid Cue");
    }
    ids.add(cue.id);
    for (const [label, frame] of [
      ["semantic start", cue.semanticStartFrame],
      ["semantic end", cue.semanticEndFrameExclusive],
      ["visible start", cue.visibleStartFrame],
      ["visible end", cue.visibleEndFrameExclusive],
    ] as const) assertIntegerFrame(frame, `Fine Caption Cue ${cue.id} ${label}`);
    if (cue.semanticEndFrameExclusive <= cue.semanticStartFrame
      || cue.visibleStartFrame > cue.semanticStartFrame
      || cue.visibleEndFrameExclusive < cue.semanticEndFrameExclusive
      || cue.visibleEndFrameExclusive <= cue.visibleStartFrame) {
      throw new Error(`Fine Caption Cue ${cue.id} has an invalid visible envelope`);
    }
  }
}
