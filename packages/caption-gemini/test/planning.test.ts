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
import { captionWordSequence, parseScript } from "@narratage/script";

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
      run_id: run.id,
      cues: [{
        after_word_id: run.wordIds.at(-1)!,
        fields: run.fields.length === 0 ? [] : [{
          declaration_id: run.fields[0]!.id,
          word_id: run.wordIds[0]!,
          value: "true",
        }],
      }],
    })),
  };
}

test("Gemini sees only immutable left-side display words and resolved Style runs", () => {
  const narrative = parseScript("roles.svml", `
    <opening>Meet <SVML | semantic video markup language>.</opening>
    <answer><ALICE>Meaning becomes the source.</answer>
  `);
  const words = captionWordSequence(narrative, "story.caption.words");
  const alice = style("alice", [{
    id: "important", value: { kind: "boolean" }, instruction: "Select up to one important word.",
    minimumPerCue: 0, maximumPerCue: 1,
  }]);
  const program = resolveCaptionProgram(words, "captions", style("normal"), [{
    id: "alice-use",
    words: {
      contract: "svml.caption-word-subset@1", id: "role:ALICE", sequenceId: words.id,
      wordIds: words.words.filter((word) => word.role === "ALICE").map((word) => word.id),
    },
    style: alice,
  }]);
  const request = compileCaptionGeminiRequest(words, program, options());

  assert.deepEqual(request.runs.map((run) => run.styleId), ["normal", "alice"]);
  assert.equal(request.words.some((word) => word.text === "SVML"), true);
  assert.equal(request.words.some((word) => word.text === "semantic"), false);
  assert.equal(request.prompt.includes("semantic video markup language"), false);
  assert.equal("whisperx" in request, false);

  const foreignWords = { ...words, id: "other.caption.words" };
  assert.throws(() => compileCaptionGeminiRequest(foreignWords, program, options()), /does not partition/u);
});

test("Gemini may only cut runs and assign declared fields to words inside each Cue", () => {
  const narrative = parseScript("plan.svml", "<line>Meaning becomes the source.</line>");
  const words = captionWordSequence(narrative, "story.caption.words");
  const program = resolveCaptionProgram(words, "captions", style("emphasis", [{
    id: "important", value: { kind: "boolean" }, instruction: "Select exactly one important word.",
    minimumPerCue: 1, maximumPerCue: 1,
  }]), []);
  const request = compileCaptionGeminiRequest(words, program, options());
  const plan = sealCaptionGeminiPlan(request, validResponse(request));
  assert.deepEqual(plan.runs.flatMap((run) => run.cues.flatMap((cue) => cue.wordIds)),
    request.runs.flatMap((run) => run.wordIds));

  const outside = structuredClone(validResponse(request));
  (outside.runs[0]!.cues[0]!.fields[0]! as { word_id: string }).word_id = "foreign";
  assert.throws(() => sealCaptionGeminiPlan(request, outside), /outside its cue/u);
});

test("one word may carry multiple independent, non-contiguous field assignments", () => {
  const narrative = parseScript("multi.svml", "<line>one two three four five.</line>");
  const words = captionWordSequence(narrative, "story.caption.words");
  const fields: CaptionFieldDeclaration[] = ["best", "medium"].map((id) => ({
    id, value: { kind: "boolean" }, instruction: `Independently select ${id} words.`,
    minimumPerCue: 0, maximumPerCue: 2,
  }));
  const program = resolveCaptionProgram(words, "captions", style("multi", fields), []);
  const request = compileCaptionGeminiRequest(words, program, options());
  const ids = request.runs[0]!.wordIds;
  const plan = sealCaptionGeminiPlan(request, { runs: [{
    run_id: request.runs[0]!.id,
    cues: [{
      after_word_id: ids.at(-1)!,
      fields: [
        { declaration_id: "best", word_id: ids[0]!, value: "true" },
        { declaration_id: "best", word_id: ids[2]!, value: "true" },
        { declaration_id: "medium", word_id: ids[1]!, value: "true" },
        { declaration_id: "medium", word_id: ids[2]!, value: "true" },
      ],
    }],
  }] });
  assert.equal(plan.runs[0]!.cues[0]!.fields.filter((field) => field.wordId === ids[2]).length, 2);
});
