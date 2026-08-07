import type { CompleteSemanticMap, Narrative, TimingQuality } from "@svml/contracts";

import { CaptionProjectionError } from "./error.js";
import type {
  CaptionPlan,
  CaptionProgram,
  CaptionDisplayAtom,
  TimedCaptionProjection,
  TimedCaptionRefinement,
  TimedCaptionRegion,
} from "./types.js";
import { assertCaptionPlanForProgram } from "./plan.js";
import { displayTextForAtoms } from "./display.js";
import { assertCaptionProgramForNarrative } from "./style.js";

const QUALITY_RANK: Readonly<Record<TimingQuality, number>> = {
  measured: 0,
  derived: 1,
  estimated: 2,
};

function composedQuality(value: TimingQuality): TimingQuality {
  return QUALITY_RANK[value] >= QUALITY_RANK.derived ? value : "derived";
}

export function temporalizeCaption(
  narrative: Narrative,
  map: CompleteSemanticMap,
): TimedCaptionProjection {
  const timingByToken = new Map(map.tokens.map((token) => [token.tokenId, token]));
  const sourceTiming = (startToken: number, endTokenExclusive: number, owner: string) => {
    const source = narrative.tokens.slice(startToken, endTokenExclusive);
    const timed = source.map((token) => timingByToken.get(token.id));
    if (!timed.length || timed.some((token) => token === undefined)) {
      throw new CaptionProjectionError(
        "CAPTION_SPEECH_COVERAGE",
        `${owner} is not covered by the complete speech time map.`,
      );
    }
    const first = timed[0]!;
    const last = timed.at(-1)!;
    return {
      sourceTokenIds: source.map((token) => token.id),
      startSec: first.startSec,
      endSec: last.endSec,
      startQuality: composedQuality(first.startQuality),
      endQuality: composedQuality(last.endQuality),
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
  const payload = {
    contract: "svml.timed-caption-projection@1" as const,
    text: narrative.captionProjection.text,
    regions,
  };
  return payload;
}

function cleanDisplay(value: string): string {
  return value.replace(/\s+/gu, " ").replace(/\s+([,.;:!?])/gu, "$1").trim();
}

/** Join planner-neutral Cue/field facts with the one authoritative Script map. */
export function temporalizeCaptionPlan(
  narrative: Narrative,
  map: CompleteSemanticMap,
  program: CaptionProgram,
  plan: CaptionPlan,
): TimedCaptionProjection {
  assertCaptionProgramForNarrative(program, narrative);
  assertCaptionPlanForProgram(plan, program);
  const atomById = new Map(program.atoms.map((atom) => [atom.id, atom]));
  const timingById = new Map(map.tokens.map((token) => [token.tokenId, token]));
  const regionById = new Map(narrative.captionProjection.regions.map((region) => [region.id, region]));
  const atomsByRegion = new Map<string, CaptionDisplayAtom[]>();
  for (const atom of program.atoms) {
    const values = atomsByRegion.get(atom.regionId) ?? [];
    values.push(atom);
    atomsByRegion.set(atom.regionId, values);
  }
  const atomWindow = (atom: CaptionDisplayAtom) => {
    const firstSource = narrative.tokens[atom.sourceTokenStart];
    const lastSource = narrative.tokens[atom.sourceTokenEndExclusive - 1];
    const first = firstSource === undefined ? undefined : timingById.get(firstSource.id);
    const last = lastSource === undefined ? undefined : timingById.get(lastSource.id);
    if (first === undefined || last === undefined) {
      throw new CaptionProjectionError("CAPTION_SPEECH_COVERAGE", `Caption display atom ${atom.id} is absent from the complete speech map.`);
    }
    if (atom.correspondence === "exact") {
      return {
        startSec: first.startSec,
        endSec: last.endSec,
        startQuality: composedQuality(first.startQuality),
        endQuality: composedQuality(last.endQuality),
      };
    }
    const region = regionById.get(atom.regionId);
    if (region === undefined || region.display.length === 0) {
      throw new CaptionProjectionError("CAPTION_DISPLAY_REGION", `Caption display atom ${atom.id} has no owning display region.`);
    }
    const siblings = atomsByRegion.get(atom.regionId) ?? [];
    const next = siblings.find((candidate) => candidate.displayStart > atom.displayStart);
    const duration = last.endSec - first.startSec;
    return {
      startSec: first.startSec + duration * atom.displayStart / region.display.length,
      endSec: first.startSec + duration * (next?.displayStart ?? region.display.length) / region.display.length,
      startQuality: "estimated" as const,
      endQuality: "estimated" as const,
    };
  };
  const visible = new Set(program.atoms.map((atom) => atom.id));
  const plannedIds = plan.runs.flatMap((run) => run.cues.flatMap((cue) => cue.atomIds));
  if (plannedIds.length !== visible.size || new Set(plannedIds).size !== visible.size || plannedIds.some((id) => !visible.has(id))) {
    throw new CaptionProjectionError(
      "CAPTION_PLAN_COVERAGE",
      "CaptionPlan Cues must be disjoint and cover every display atom exactly once.",
    );
  }
  const programRuns = new Map(program.runs.map((run) => [run.id, run]));
  const regions: TimedCaptionRegion[] = [];
  for (const run of plan.runs) {
    const expectedRun = programRuns.get(run.id);
    if (expectedRun === undefined || expectedRun.styleId !== run.styleId) {
      throw new CaptionProjectionError("CAPTION_PLAN_RUN", `Caption run ${run.id} differs from its Program.`);
    }
    const runAtoms = run.cues.flatMap((cue) => cue.atomIds);
    if (runAtoms.join("\0") !== expectedRun.atomIds.join("\0")) {
      throw new CaptionProjectionError("CAPTION_PLAN_RUN", `Caption run ${run.id} changes its Program atom order.`);
    }
    for (const cue of run.cues) {
      const source = cue.atomIds.map((id) => atomById.get(id));
      if (source.some((atom) => atom === undefined)) {
        throw new CaptionProjectionError("CAPTION_PLAN_ATOM", `Caption Cue ${cue.id} references an unknown display atom.`);
      }
      const atoms = source as CaptionDisplayAtom[];
      if (atoms.some((atom, index) => index > 0 && atom.index <= atoms[index - 1]!.index)) {
        throw new CaptionProjectionError("CAPTION_PLAN_ORDER", `Caption Cue ${cue.id} changes display atom order.`);
      }
      if (new Set(atoms.map((atom) => atom.segmentId)).size !== 1) {
        throw new CaptionProjectionError("CAPTION_PLAN_SEGMENT", `Caption Cue ${cue.id} crosses a Script Segment.`);
      }
      const sourceIndexes = [...new Set(atoms.flatMap((atom) => Array.from(
        { length: atom.sourceTokenEndExclusive - atom.sourceTokenStart },
        (_, offset) => atom.sourceTokenStart + offset,
      )))].sort((left, right) => left - right);
      const sourceTokens = sourceIndexes.map((index) => narrative.tokens[index]);
      const timed = sourceTokens.map((token) => token === undefined ? undefined : timingById.get(token.id));
      if (timed.length === 0 || timed.some((token) => token === undefined)) {
        throw new CaptionProjectionError("CAPTION_SPEECH_COVERAGE", `Caption Cue ${cue.id} is absent from the complete speech map.`);
      }
      const firstWindow = atomWindow(atoms[0]!);
      const lastWindow = atomWindow(atoms.at(-1)!);
      for (const field of cue.fields) {
        if (!cue.atomIds.includes(field.atomId)) {
          throw new CaptionProjectionError("CAPTION_PLAN_FIELD", `Caption field ${field.declarationId} lies outside Cue ${cue.id}.`);
        }
      }
      regions.push({
        id: cue.id,
        runId: run.id,
        styleId: run.styleId,
        display: displayTextForAtoms(narrative, atoms),
        segmentId: atoms[0]!.segmentId,
        kind: atoms.some((atom) => atom.correspondence === "region-envelope") ? "alias" : "identity",
        sourceTokenIds: sourceTokens.map((token) => token!.id),
        startSec: firstWindow.startSec,
        endSec: lastWindow.endSec,
        startQuality: firstWindow.startQuality,
        endQuality: lastWindow.endQuality,
        refinements: [],
        fields: cue.fields.map((field) => ({ ...field })),
      });
    }
  }
  const payload = {
    contract: "svml.timed-caption-projection@1" as const,
    text: cleanDisplay(regions.map((region) => region.display).join(" ")),
    regions,
  };
  return payload;
}
