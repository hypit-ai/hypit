import type { CaptionDocument } from "@hypit/narrative";
import { tokenFrameSpan } from "@hypit/semantic-track";
import type { SemanticTrack } from "@hypit/semantic-track";

import { CaptionTimingError } from "./error.js";
import { assertCaptionDocument } from "./display.js";
import { assertCaptionProgramForDocument } from "./style.js";
import type { CaptionProgram, TimedCaptionProjection, TimedCaptionCue, TimedCaptionUnit } from "./types.js";

export function temporalizeCaptionDocument(
  document: CaptionDocument,
  semantic: SemanticTrack,
  program: CaptionProgram,
): TimedCaptionProjection {
  assertCaptionDocument(document);
  assertCaptionProgramForDocument(program, document);
  const styleByUnit = new Map(program.runs.flatMap((run) => run.unitIds.map((unitId) => [unitId, run.styleId] as const)));
  const muted = new Set(program.mutedUnitIds);
  const breaks = new Set(document.cueBreaks.map((cueBreak) => cueBreak.afterUnitId));
  const timed: Array<{ unit: CaptionDocument["units"][number]; styleId: string; timing: TimedCaptionUnit }> = [];
  for (const unit of document.units) {
    if (muted.has(unit.id)) continue;
    const styleId = styleByUnit.get(unit.id);
    if (styleId === undefined) throw new CaptionTimingError("CAPTION_UNIT", `Caption unit ${unit.id} has no Style.`);
    const window = tokenFrameSpan(semantic, unit.sourceTokenIds);
    if (window === undefined) throw new CaptionTimingError("CAPTION_SPEECH_COVERAGE", `Caption unit ${unit.id} is absent from the SemanticTrack.`);
    const startFrame = Math.min(window.startFrame, window.endFrameExclusive);
    const endFrameExclusive = Math.max(startFrame + 1, window.startFrame, window.endFrameExclusive);
    timed.push({ unit, styleId, timing: { unitId: unit.id, startFrame, endFrameExclusive } });
  }
  const cues: TimedCaptionCue[] = [];
  let current: { styleId: string; units: TimedCaptionUnit[]; segmentId: string; turnId: string } | undefined;
  const flush = (): void => {
    if (current === undefined || current.units.length === 0) return;
    cues.push({
      id: `${program.id}:cue:${cues.length + 1}`,
      styleId: current.styleId,
      startFrame: current.units[0]!.startFrame,
      endFrameExclusive: current.units.at(-1)!.endFrameExclusive,
      units: current.units,
    });
    current = undefined;
  };
  for (const [index, entry] of timed.entries()) {
    const previousDocumentUnit = index === 0 ? undefined : timed[index - 1]!.unit;
    const mustBreak = current !== undefined && (
      current.styleId !== entry.styleId
      || current.segmentId !== entry.unit.segmentId
      || current.turnId !== entry.unit.turnId
      || (previousDocumentUnit !== undefined && breaks.has(previousDocumentUnit.id))
    );
    if (mustBreak) flush();
    if (current === undefined) current = {
      styleId: entry.styleId,
      units: [],
      segmentId: entry.unit.segmentId,
      turnId: entry.unit.turnId,
    };
    current.units.push(entry.timing);
  }
  flush();
  const result: TimedCaptionProjection = { documentId: document.id, cues };
  assertTimedCaptionProjection(result);
  return result;
}

export function applyCaptionMute(
  projection: TimedCaptionProjection,
  program: CaptionProgram,
  document: CaptionDocument,
): TimedCaptionProjection {
  assertCaptionDocument(document);
  assertCaptionProgramForDocument(program, document);
  if (projection.documentId !== document.id) throw new Error("Caption Mute received another CaptionDocument");
  const muted = new Set(program.mutedUnitIds);
  const cues = projection.cues.flatMap((cue) => {
    const units = cue.units.filter((unit) => !muted.has(unit.unitId));
    if (units.length === 0) return [];
    return [{ ...cue, units, startFrame: units[0]!.startFrame, endFrameExclusive: units.at(-1)!.endFrameExclusive }];
  });
  const result = { documentId: projection.documentId, cues };
  assertTimedCaptionProjection(result);
  return result;
}

export function assertTimedCaptionProjection(projection: TimedCaptionProjection): void {
  if (projection.documentId.length === 0) throw new Error("TimedCaptionProjection document identity is invalid");
  const cueIds = new Set<string>();
  const unitIds = new Set<string>();
  for (const cue of projection.cues) {
    if (cue.id.length === 0 || cueIds.has(cue.id) || cue.styleId.length === 0 || cue.units.length === 0
      || !Number.isSafeInteger(cue.startFrame) || !Number.isSafeInteger(cue.endFrameExclusive)
      || cue.startFrame < 0 || cue.endFrameExclusive <= cue.startFrame) throw new Error("TimedCaptionProjection contains an invalid Cue");
    cueIds.add(cue.id);
    for (const unit of cue.units) {
      if (unit.unitId.length === 0 || unitIds.has(unit.unitId) || !Number.isSafeInteger(unit.startFrame)
        || !Number.isSafeInteger(unit.endFrameExclusive) || unit.startFrame < 0 || unit.endFrameExclusive <= unit.startFrame) {
        throw new Error("TimedCaptionProjection contains an invalid or repeated unit timing");
      }
      unitIds.add(unit.unitId);
    }
  }
}
