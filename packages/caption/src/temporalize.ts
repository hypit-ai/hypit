import type { CaptionWord, CaptionWordSequence, Narrative } from "@narratage/narrative";
import { tokenSpanSeconds } from "@narratage/semantic-map";
import type { CompleteSemanticMap } from "@narratage/semantic-map";

import { CaptionProjectionError } from "./error.js";
import type {
  CaptionPlan,
  CaptionProgram,
  TimedCaptionProjection,
  TimedCaptionRefinement,
  TimedCaptionRegion,
} from "./types.js";
import { assertCaptionPlanForProgram } from "./plan.js";
import { displayTextForWords } from "./display.js";
import { assertCaptionProgramForWords } from "./style.js";

export function temporalizeCaption(
  narrative: Narrative,
  map: CompleteSemanticMap,
): TimedCaptionProjection {
  const sourceTiming = (startToken: number, endTokenExclusive: number, owner: string) => {
    const source = narrative.tokens.slice(startToken, endTokenExclusive);
    const window = tokenSpanSeconds(map, source.map((token) => token.id));
    if (window === undefined) {
      throw new CaptionProjectionError(
        "CAPTION_SPEECH_COVERAGE",
        `${owner} is not covered by the complete speech time map.`,
      );
    }
    return {
      sourceTokenIds: source.map((token) => token.id),
      startSec: window.startSec,
      endSec: window.endSec,
    };
  };

  const regions: TimedCaptionRegion[] = narrative.captionProjection.regions.map((region) => {
    const refinements: TimedCaptionRefinement[] = region.refinements.map((refinement) => ({
      id: refinement.id,
      display: refinement.display,
      displayStart: refinement.displayStart,
      displayEnd: refinement.displayEnd,
      ...sourceTiming(refinement.startToken, refinement.endTokenExclusive, refinement.id),
      relation: refinement.relation,
    }));
    return {
      id: region.id,
      display: region.display,
      segmentId: region.segmentId,
      kind: region.kind,
      ...sourceTiming(region.startToken, region.endTokenExclusive, region.id),
      refinements,
    };
  });
  return {
    contract: "svml.timed-caption-projection@1",
    text: narrative.captionProjection.text,
    regions,
  };
}

function cleanDisplay(value: string): string {
  return value.replace(/\s+/gu, " ").replace(/\s+([,.;:!?])/gu, "$1").trim();
}

export function assertTimedCaptionProjection(projection: TimedCaptionProjection): void {
  if (projection.contract !== "svml.timed-caption-projection@1") {
    throw new Error("Unsupported TimedCaptionProjection contract.");
  }
}

/** Join planner-neutral Cue/field facts with the one authoritative Script map. */
export function temporalizeCaptionPlan(
  narrative: Narrative,
  map: CompleteSemanticMap,
  sequence: CaptionWordSequence,
  program: CaptionProgram,
  plan: CaptionPlan,
): TimedCaptionProjection {
  assertCaptionProgramForWords(program, sequence);
  assertCaptionPlanForProgram(plan, program);
  const wordById = new Map(sequence.words.map((word) => [word.id, word]));
  const regionById = new Map(narrative.captionProjection.regions.map((region) => [region.id, region]));
  const wordsByRegion = new Map<string, CaptionWord[]>();
  for (const word of sequence.words) {
    const values = wordsByRegion.get(word.regionId) ?? [];
    values.push(word);
    wordsByRegion.set(word.regionId, values);
  }
  const wordWindow = (word: CaptionWord) => {
    const sourceIds = narrative.tokens
      .slice(word.sourceTokenStart, word.sourceTokenEndExclusive)
      .map((token) => token.id);
    const window = tokenSpanSeconds(map, sourceIds);
    if (window === undefined) {
      throw new CaptionProjectionError(
        "CAPTION_SPEECH_COVERAGE",
        `Caption display word ${word.id} is absent from the complete speech map.`,
      );
    }
    if (word.correspondence === "exact") return window;
    const region = regionById.get(word.regionId);
    if (region === undefined || region.display.length === 0) {
      throw new CaptionProjectionError(
        "CAPTION_DISPLAY_REGION",
        `Caption display word ${word.id} has no owning display region.`,
      );
    }
    const siblings = wordsByRegion.get(word.regionId) ?? [];
    const next = siblings.find((candidate) => candidate.displayStart > word.displayStart);
    const duration = window.endSec - window.startSec;
    return {
      startSec: window.startSec + duration * word.displayStart / region.display.length,
      endSec: window.startSec + duration * (next?.displayStart ?? region.display.length) / region.display.length,
    };
  };
  const visible = new Set(sequence.words.map((word) => word.id));
  const plannedIds = plan.runs.flatMap((run) => run.cues.flatMap((cue) => cue.wordIds));
  if (plannedIds.length !== visible.size || new Set(plannedIds).size !== visible.size
    || plannedIds.some((id) => !visible.has(id))) {
    throw new CaptionProjectionError(
      "CAPTION_PLAN_COVERAGE",
      "CaptionPlan Cues must be disjoint and cover every display word exactly once.",
    );
  }
  const programRuns = new Map(program.runs.map((run) => [run.id, run]));
  const regions: TimedCaptionRegion[] = [];
  for (const run of plan.runs) {
    const expectedRun = programRuns.get(run.id);
    if (expectedRun === undefined || expectedRun.styleId !== run.styleId) {
      throw new CaptionProjectionError("CAPTION_PLAN_RUN", `Caption run ${run.id} differs from its Program.`);
    }
    const runWords = run.cues.flatMap((cue) => cue.wordIds);
    if (runWords.join("\0") !== expectedRun.wordIds.join("\0")) {
      throw new CaptionProjectionError("CAPTION_PLAN_RUN", `Caption run ${run.id} changes its Program word order.`);
    }
    for (const cue of run.cues) {
      const source = cue.wordIds.map((id) => wordById.get(id));
      if (source.some((word) => word === undefined)) {
        throw new CaptionProjectionError("CAPTION_PLAN_WORD", `Caption Cue ${cue.id} references an unknown display word.`);
      }
      const words = source as CaptionWord[];
      if (words.some((word, index) => index > 0 && word.index <= words[index - 1]!.index)) {
        throw new CaptionProjectionError("CAPTION_PLAN_ORDER", `Caption Cue ${cue.id} changes display word order.`);
      }
      if (new Set(words.map((word) => word.segmentId)).size !== 1) {
        throw new CaptionProjectionError("CAPTION_PLAN_SEGMENT", `Caption Cue ${cue.id} crosses a Script Segment.`);
      }
      const sourceIndexes = [...new Set(words.flatMap((word) => Array.from(
        { length: word.sourceTokenEndExclusive - word.sourceTokenStart },
        (_, offset) => word.sourceTokenStart + offset,
      )))].sort((left, right) => left - right);
      const sourceTokens = sourceIndexes.map((index) => narrative.tokens[index]);
      if (sourceTokens.some((token) => token === undefined)
        || tokenSpanSeconds(map, sourceTokens.map((token) => token!.id)) === undefined) {
        throw new CaptionProjectionError(
          "CAPTION_SPEECH_COVERAGE",
          `Caption Cue ${cue.id} is absent from the complete speech map.`,
        );
      }
      const firstWindow = wordWindow(words[0]!);
      const lastWindow = wordWindow(words.at(-1)!);
      for (const field of cue.fields) {
        if (!cue.wordIds.includes(field.wordId)) {
          throw new CaptionProjectionError(
            "CAPTION_PLAN_FIELD",
            `Caption field ${field.declarationId} lies outside Cue ${cue.id}.`,
          );
        }
      }
      regions.push({
        id: cue.id,
        runId: run.id,
        styleId: run.styleId,
        display: displayTextForWords(narrative, sequence.words, words),
        segmentId: words[0]!.segmentId,
        kind: words.some((word) => word.correspondence === "region-envelope") ? "alias" : "identity",
        sourceTokenIds: sourceTokens.map((token) => token!.id),
        startSec: firstWindow.startSec,
        endSec: lastWindow.endSec,
        refinements: [],
        wordIds: [...cue.wordIds],
        fields: cue.fields.map((field) => ({ ...field })),
      });
    }
  }
  return {
    contract: "svml.timed-caption-projection@1",
    text: cleanDisplay(regions.map((region) => region.display).join(" ")),
    regions,
  };
}
