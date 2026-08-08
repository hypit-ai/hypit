import type { CaptionDisplaySequence } from "@narratage/narrative";

import type { CaptionFieldDeclaration, CaptionPlan, CaptionProgram } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function content(value: CaptionPlan): CaptionPlan {
  return {
    contract: "svml.caption-plan@1",
    runs: value.runs.map((run) => ({
      id: run.id,
      styleId: run.styleId,
      cues: run.cues.map((cue) => ({
        id: cue.id,
        atomIds: [...cue.atomIds],
        fields: cue.fields.map((field) => ({ ...field })),
      })),
    })),
  };
}

export function sealCaptionPlan(value: CaptionPlan): CaptionPlan {
  const plan = content(value);
  assertCaptionPlan(plan);
  return plan;
}

export function assertCaptionPlan(value: unknown): asserts value is CaptionPlan {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "CaptionPlan must be an object");
  const plan = value as CaptionPlan;
  assert(plan.contract === "svml.caption-plan@1", "Unsupported CaptionPlan contract");
  assert(Array.isArray(plan.runs) && plan.runs.length > 0, "CaptionPlan runs are empty");
  const runIds = new Set<string>();
  const atomIds = new Set<string>();
  const cueIds = new Set<string>();
  for (const run of plan.runs) {
    assert(run.id.length > 0 && !runIds.has(run.id) && run.styleId.length > 0,
      "CaptionPlan run id or style is invalid or repeated");
    runIds.add(run.id);
    assert(run.cues.length > 0, `CaptionPlan run ${run.id} has no Cues`);
    for (const cue of run.cues) {
      assert(cue.id.length > 0 && !cueIds.has(cue.id) && cue.atomIds.length > 0,
        `CaptionPlan run ${run.id} contains an empty or repeated Cue`);
      cueIds.add(cue.id);
      assert(new Set(cue.atomIds).size === cue.atomIds.length, `CaptionPlan Cue ${cue.id} repeats an Atom`);
      for (const atomId of cue.atomIds) {
        assert(!atomIds.has(atomId), `CaptionPlan repeats Atom ${atomId}`);
        atomIds.add(atomId);
      }
      for (const field of cue.fields) {
        assert(field.declarationId.length > 0 && field.wordId.length > 0 && field.value.length > 0,
          `CaptionPlan Cue ${cue.id} field is invalid`);
      }
    }
  }
}

function assertFieldValue(declaration: CaptionFieldDeclaration, value: string): void {
  if (declaration.value.kind === "boolean") {
    assert(value === "true", `Caption field ${declaration.id} is sparse and only accepts true`);
  } else if (declaration.value.kind === "enum") {
    assert(declaration.value.values.includes(value), `Caption field ${declaration.id} enum value is invalid`);
  } else {
    const numeric = Number(value);
    assert(Number.isFinite(numeric), `Caption field ${declaration.id} number value is invalid`);
    assert(declaration.value.minimum === undefined || numeric >= declaration.value.minimum,
      `Caption field ${declaration.id} number is below its minimum`);
    assert(declaration.value.maximum === undefined || numeric <= declaration.value.maximum,
      `Caption field ${declaration.id} number is above its maximum`);
  }
}

/** Validate planner freedom against one resolved Program and its exact authored Atom universe. */
export function assertCaptionPlanForProgram(
  plan: CaptionPlan,
  program: CaptionProgram,
  display: CaptionDisplaySequence,
): void {
  assertCaptionPlan(plan);
  assert(program.displaySequenceId === display.id, "CaptionPlan uses another display sequence");
  assert(plan.runs.length === program.runs.length, "CaptionPlan does not contain the exact Program run set");
  const styles = new Map(program.styles.map((style) => [style.id, style]));
  const atomByWord = new Map(display.words.map((word) => [word.id, word.atomId]));
  const atomById = new Map(display.atoms.map((atom) => [atom.id, atom]));
  for (let index = 0; index < program.runs.length; index += 1) {
    const expected = program.runs[index]!;
    const actual = plan.runs[index]!;
    assert(actual.id === expected.id && actual.styleId === expected.styleId,
      `CaptionPlan run ${actual.id} differs from Program order or Style`);
    const expectedAtoms: string[] = [];
    for (const wordId of expected.wordIds) {
      const atomId = atomByWord.get(wordId);
      assert(atomId !== undefined, `Caption Program run ${expected.id} references unknown display word ${wordId}`);
      if (expectedAtoms.at(-1) !== atomId) expectedAtoms.push(atomId);
    }
    assert(expectedAtoms.length > 0 && actual.cues.flatMap((cue) => cue.atomIds).join("\0") === expectedAtoms.join("\0"),
      `CaptionPlan run ${actual.id} does not partition its Program Atoms exactly in order`);
    const style = styles.get(expected.styleId);
    assert(style !== undefined, `Caption Program Style ${expected.styleId} is absent`);
    const declarations = new Map(style.planning.fields.map((field) => [field.id, field]));
    for (const cue of actual.cues) {
      const cueWords = new Set(cue.atomIds.flatMap((atomId) => atomById.get(atomId)?.wordIds ?? []));
      const unique = new Set<string>();
      for (const field of cue.fields) {
        assert(cueWords.has(field.wordId), `Caption field ${field.declarationId} lies outside Cue ${cue.id}`);
        const declaration = declarations.get(field.declarationId);
        assert(declaration !== undefined, `Caption field ${field.declarationId} is not declared by Style ${style.id}`);
        const key = `${field.declarationId}\0${field.wordId}`;
        assert(!unique.has(key), `Caption Cue ${cue.id} repeats field ${field.declarationId} on ${field.wordId}`);
        unique.add(key);
        assertFieldValue(declaration, field.value);
      }
      for (const declaration of declarations.values()) {
        const count = cue.fields.filter((field) => field.declarationId === declaration.id).length;
        assert(count >= declaration.minimumPerCue && count <= declaration.maximumPerCue,
          `Caption Cue ${cue.id} field ${declaration.id} violates its per-Cue cardinality`);
      }
    }
  }
}
