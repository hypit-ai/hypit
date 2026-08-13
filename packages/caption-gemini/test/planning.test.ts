import assert from "node:assert/strict";
import test from "node:test";

import { resolveCaptionProgram, sealCaptionStyle } from "@narratage/caption";
import type { CaptionFieldDeclaration, CaptionStyleIntent } from "@narratage/caption";
import {
  compileCaptionGeminiRequest,
  sealCaptionGeminiPlan,
  sealCaptionGeminiProgram,
} from "@narratage/caption-gemini";
import type { CaptionGeminiRequest, RawCaptionGeminiResponse } from "@narratage/caption-gemini";
import { captionDisplaySequence, parseScript } from "@narratage/script";

function style(id: string, fields: readonly CaptionFieldDeclaration[] = []): CaptionStyleIntent {
  return sealCaptionStyle({
    contract: "svml.caption-style@1",
    id,
    planning: {
      cue: { minimumWords: 1, maximumWords: 7, instruction: "Prefer short complete semantic phrases." },
      fields,
    },
    rendering: { family: "test-caption@1", parameters: {} },
  });
}

function options() {
  return sealCaptionGeminiProgram({ contract: "svml.caption-gemini-program@1", model: "gemini-2.5-flash" });
}

function validResponse(request: CaptionGeminiRequest): RawCaptionGeminiResponse {
  return {
    runs: request.runs.map((run) => ({
      cues: [{
        atom_count: run.atoms.length,
        fields: run.fields.length === 0 ? [] : [{
          declaration_id: run.fields[0]!.id,
          atom_number: 1,
          word_number: 1,
          value: "true",
        }],
      }],
    })),
  };
}

test("Gemini sees only immutable display atoms and resolved Style runs", () => {
  const parsed = parseScript("roles.svml", `
    <opening>Meet <SVML | semantic video markup language>.</opening>
    <answer><ALICE>Meaning becomes the source.</answer>
  `);
  const display = captionDisplaySequence(parsed, "story.caption");
  const alice = style("alice", [{
    id: "important", value: { kind: "boolean" }, instruction: "Select up to one important word.",
    minimumPerCue: 0, maximumPerCue: 1,
  }]);
  const program = resolveCaptionProgram(display, "captions", style("normal"), [{
    id: "alice-use",
    words: {
      id: "role:ALICE", sequenceId: display.id,
      wordIds: display.words.filter((word) => word.role === "ALICE").map((word) => word.id),
    },
    style: alice,
  }]);
  const request = compileCaptionGeminiRequest(display, program, options());

  assert.deepEqual(request.runs.map((run) => run.styleId), ["normal", "alice"]);
  assert.equal(request.runs.some((run) => run.atoms.some((atom) =>
    atom.words.some((word) => word.text === "SVML"))), true);
  assert.equal(request.prompt.includes("semantic video markup language"), false);
  assert.equal("whisperx" in request, false);

  const foreignDisplay = { ...display, id: "other.caption" };
  assert.throws(() => compileCaptionGeminiRequest(foreignDisplay, program, options()), /does not partition/u);
});

test("Gemini cuts only whole atoms and assigns fields by Atom and Word coordinates", () => {
  const parsed = parseScript("plan.svml", "<line>Meaning becomes the source.</line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const program = resolveCaptionProgram(display, "captions", style("emphasis", [{
    id: "important", value: { kind: "boolean" }, instruction: "Select exactly one important word.",
    minimumPerCue: 1, maximumPerCue: 1,
  }]), []);
  const request = compileCaptionGeminiRequest(display, program, options());
  const plan = sealCaptionGeminiPlan(request, validResponse(request));
  assert.deepEqual(JSON.parse(request.prompt).runs[0].field_declarations[0], {
    id: "important",
    value: { kind: "boolean", sparse_true: true },
    per_cue: { minimum: 1, maximum: 1 },
    instruction: "Select exactly one important word.",
  });
  assert.deepEqual(plan.runs.flatMap((run) => run.cues.flatMap((cue) => cue.atomIds)),
    request.runs.flatMap((run) => run.atoms.map((atom) => atom.id)));

  const outsideAtom = structuredClone(validResponse(request));
  (outsideAtom.runs[0]!.cues[0]!.fields[0]! as { atom_number: number }).atom_number = 100;
  assert.throws(() => sealCaptionGeminiPlan(request, outsideAtom), /Atom number lies outside/u);

  const outsideWord = structuredClone(validResponse(request));
  (outsideWord.runs[0]!.cues[0]!.fields[0]! as { word_number: number }).word_number = 100;
  assert.throws(() => sealCaptionGeminiPlan(request, outsideWord), /word number lies outside/u);
});

test("a field-free Style requires only Cue boundaries", () => {
  const parsed = parseScript(
    "field-free.svml",
    "<line>The quiet morning light moves softly across the empty studio windows.</line>",
  );
  const display = captionDisplaySequence(parsed, "story.caption");
  const program = resolveCaptionProgram(display, "captions", style("fine"), []);
  const request = compileCaptionGeminiRequest(display, program, options());
  assert.deepEqual(request.runs.map((run) => run.fields), [[]]);
  assert.doesNotMatch(request.prompt, /field_declarations/u);

  const count = request.runs[0]!.atoms.length;
  const plan = sealCaptionGeminiPlan(request, { runs: [{ cues: [
    { atom_count: 4, fields: [] },
    { atom_count: 3, fields: [] },
    { atom_count: count - 7, fields: [] },
  ] }] });
  assert.deepEqual(plan.runs[0]!.cues.map((cue) => cue.fields), [[], [], []]);
  assert.deepEqual(plan.runs[0]!.cues.flatMap((cue) => cue.atomIds),
    request.runs[0]!.atoms.map((atom) => atom.id));
});

test("Caption Mute stays out of Gemini while muted Atoms remain in the immutable plan", () => {
  const parsed = parseScript("mute.svml", "<line>Keep this private phrase in the authored plan.</line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const muted = display.words.slice(2, 4);
  const program = resolveCaptionProgram(display, "captions", style("fine"), [], [{
    id: "private",
    words: {

      id: "selection:private",
      sequenceId: display.id,
      wordIds: muted.map((word) => word.id),
    },
  }]);
  const request = compileCaptionGeminiRequest(display, program, options());

  assert.deepEqual(request.runs.flatMap((run) => run.atoms.flatMap((atom) => atom.words.map((word) => word.id))),
    display.words.map((word) => word.id));
  assert.equal(request.prompt.includes("mutedWordIds"), false);
  assert.equal(request.prompt.includes("visibility"), false);
});

test("one Word may carry multiple independent field assignments", () => {
  const parsed = parseScript("multi.svml", "<line>one two three four five.</line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const fields: CaptionFieldDeclaration[] = ["best", "medium"].map((id) => ({
    id, value: { kind: "boolean" }, instruction: `Independently select ${id} words.`,
    minimumPerCue: 0, maximumPerCue: 2,
  }));
  const program = resolveCaptionProgram(display, "captions", style("multi", fields), []);
  const request = compileCaptionGeminiRequest(display, program, options());
  const plan = sealCaptionGeminiPlan(request, { runs: [{ cues: [{
    atom_count: request.runs[0]!.atoms.length,
    fields: [
      { declaration_id: "best", atom_number: 3, word_number: 1, value: "true" },
      { declaration_id: "medium", atom_number: 3, word_number: 1, value: "true" },
    ],
  }] }] });
  const target = request.runs[0]!.atoms[2]!.words[0]!.id;
  assert.equal(plan.runs[0]!.cues[0]!.fields.filter((field) => field.wordId === target).length, 2);
});

test("Dual Text becomes one readable indivisible string-array Atom", () => {
  const parsed = parseScript("atoms.svml", "<line>new york <city is beautiful | fuck></line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const program = resolveCaptionProgram(display, "captions", style("fine"), []);
  const request = compileCaptionGeminiRequest(display, program, options());

  assert.deepEqual(request.runs[0]!.atoms.map((atom) => atom.words.map((word) => word.text)), [
    ["new"], ["york"], ["city", "is", "beautiful"],
  ]);
  assert.deepEqual(JSON.parse(request.prompt).runs[0].atoms, [
    ["new"], ["york"], ["city", "is", "beautiful"],
  ]);
  assert.equal(request.prompt.includes("fuck"), false);

  const plan = sealCaptionGeminiPlan(request, { runs: [{ cues: [
    { atom_count: 2, fields: [] },
    { atom_count: 1, fields: [] },
  ] }] });
  assert.deepEqual(plan.runs[0]!.cues.map((cue) => cue.atomIds.length), [2, 1]);
  assert.throws(() => sealCaptionGeminiPlan(request, { runs: [{ cues: [
    { atom_count: 4, fields: [] },
  ] }] }), /exceeds its remaining atoms/u);
});

test("punctuation is sent once, as immutable Word text inside atoms", () => {
  const parsed = parseScript("punctuation.svml", "<line>45% back-and-forth damn! 300,000</line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const program = resolveCaptionProgram(display, "captions", style("fine"), []);
  const request = compileCaptionGeminiRequest(display, program, options());
  assert.deepEqual(JSON.parse(request.prompt).runs[0].atoms, [
    ["45%"], ["back-and-forth"], ["damn!"], ["300,000"],
  ]);
  assert.equal(JSON.parse(request.prompt).runs[0].text, undefined);
  assert.equal(JSON.parse(request.prompt).runs[0].words, undefined);
});

test("one indivisible Atom may exceed the preferred Cue maximum", () => {
  const parsed = parseScript("oversized.svml", "<line><one two three four | something></line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const compact = sealCaptionStyle({
    contract: "svml.caption-style@1",
    id: "compact",
    planning: {
      cue: { minimumWords: 1, maximumWords: 3, instruction: "Prefer at most three visible words." },
      fields: [],
    },
    rendering: { family: "test-caption@1", parameters: {} },
  });
  const program = resolveCaptionProgram(display, "captions", compact, []);
  const request = compileCaptionGeminiRequest(display, program, options());
  assert.deepEqual(request.runs[0]!.atoms[0]!.words.map((word) => word.text), ["one", "two", "three", "four"]);
  const plan = sealCaptionGeminiPlan(request, { runs: [{ cues: [{ atom_count: 1, fields: [] }] }] });
  assert.equal(plan.runs[0]!.cues[0]!.atomIds.length, 1);
});
