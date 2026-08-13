import type { CaptionCorrespondence, CaptionDisplaySequence } from "@narratage/narrative";
import { tokenFrameSpan } from "@narratage/semantic-map";
import type { CompleteSemanticMap } from "@narratage/semantic-map";

import { CaptionTimingError } from "./error.js";
import { assertCaptionCorrespondence, assertCaptionDisplaySequence } from "./display.js";
import { assertCaptionPlanForProgram } from "./plan.js";
import { assertCaptionProgramForDisplay } from "./style.js";
import type { CaptionPlan, CaptionProgram, TimedCaptionProjection } from "./types.js";

/**
 * Apply Caption-owned post-planning visibility without changing Cue identity, timing or grouping.
 * The operation is idempotent so Style-family renderers may enforce the contract defensively.
 */
export function applyCaptionMute(
  projection: TimedCaptionProjection,
  program: CaptionProgram,
  display: CaptionDisplaySequence,
): TimedCaptionProjection {
  assertTimedCaptionProjection(projection);
  assertCaptionProgramForDisplay(program, display);
  if (projection.displaySequenceId !== display.id) {
    throw new Error("Caption Mute received another display sequence");
  }
  const mutedWords = new Set(program.mutedWordIds);
  const mutedAtoms = new Set(display.atoms
    .filter((atom) => atom.wordIds.every((wordId) => mutedWords.has(wordId)))
    .map((atom) => atom.id));
  const result: TimedCaptionProjection = {

    displaySequenceId: projection.displaySequenceId,
    cues: projection.cues.flatMap((cue) => {
      const atoms = cue.atoms.filter((atom) => !mutedAtoms.has(atom.atomId));
      if (atoms.length === 0) return [];
      return [{
        ...cue,
        atoms,
        fields: cue.fields.filter((field) => !mutedWords.has(field.wordId)),
      }];
    }),
  };
  assertTimedCaptionProjection(result);
  return result;
}

/** Join whole authored Caption Atoms to measured speech time. No display-word time is invented. */
export function temporalizeCaptionPlan(
  display: CaptionDisplaySequence,
  correspondence: CaptionCorrespondence,
  map: CompleteSemanticMap,
  program: CaptionProgram,
  plan: CaptionPlan,
): TimedCaptionProjection {
  assertCaptionDisplaySequence(display);
  assertCaptionCorrespondence(correspondence, display);
  assertCaptionProgramForDisplay(program, display);
  assertCaptionPlanForProgram(plan, program, display);
  const atomById = new Map(display.atoms.map((atom) => [atom.id, atom]));
  const sourceByAtom = new Map(correspondence.atoms.map((item) => [item.atomId, item.sourceTokenIds]));
  const cues = plan.runs.flatMap((run) => run.cues.map((cue) => {
    const atoms = cue.atomIds.map((atomId) => {
      const atom = atomById.get(atomId);
      const sourceTokenIds = sourceByAtom.get(atomId);
      if (atom === undefined || sourceTokenIds === undefined) {
        throw new CaptionTimingError("CAPTION_ATOM", `Caption Cue ${cue.id} references unknown Atom ${atomId}.`);
      }
      const window = tokenFrameSpan(map, sourceTokenIds);
      if (window === undefined) {
        throw new CaptionTimingError(
          "CAPTION_SPEECH_COVERAGE",
          `Caption Atom ${atomId} is absent from the complete speech map.`,
        );
      }
      return {
        atom,
        timing: {
          atomId,
          startFrame: window.startFrame,
          endFrameExclusive: window.endFrameExclusive,
        },
      };
    });
    if (new Set(atoms.map((item) => item.atom.segmentId)).size !== 1) {
      throw new CaptionTimingError("CAPTION_PLAN_SEGMENT", `Caption Cue ${cue.id} crosses a Script Segment.`);
    }
    return {
      id: cue.id,
      styleId: run.styleId,
      startFrame: atoms[0]!.timing.startFrame,
      endFrameExclusive: atoms.at(-1)!.timing.endFrameExclusive,
      atoms: atoms.map((item) => item.timing),
      fields: cue.fields.map((field) => ({ ...field })),
    };
  }));
  const result = applyCaptionMute({

    displaySequenceId: display.id,
    cues,
  }, program, display);
  return result;
}

export function assertTimedCaptionProjection(projection: TimedCaptionProjection): void {
  if (projection.displaySequenceId.length === 0) {
    throw new Error("TimedCaptionProjection display sequence is invalid.");
  }
  const cueIds = new Set<string>();
  const atomIds = new Set<string>();
  for (const cue of projection.cues) {
    if (cue.id.length === 0 || cueIds.has(cue.id) || cue.styleId.length === 0 || cue.atoms.length === 0
      || !Number.isSafeInteger(cue.startFrame) || !Number.isSafeInteger(cue.endFrameExclusive)
      || cue.startFrame < 0 || cue.endFrameExclusive <= cue.startFrame) {
      throw new Error("TimedCaptionProjection contains an invalid Cue");
    }
    cueIds.add(cue.id);
    for (const atom of cue.atoms) {
      if (atom.atomId.length === 0 || atomIds.has(atom.atomId)
        || !Number.isSafeInteger(atom.startFrame) || !Number.isSafeInteger(atom.endFrameExclusive)
        || atom.startFrame < 0 || atom.endFrameExclusive <= atom.startFrame) {
        throw new Error("TimedCaptionProjection contains an invalid or repeated Atom timing");
      }
      atomIds.add(atom.atomId);
    }
  }
}
