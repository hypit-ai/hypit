import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultCaptionTrackProgram,
  resolveCaptionProgram,
  sealCaptionProgram,
  sealCaptionStyle,
} from "@narratage/caption";
import type { CaptionStyleIntent } from "@narratage/caption";
import {
  compileCaptionGeminiRequest,
  sealCaptionGeminiPlan,
  sealCaptionGeminiProgram,
} from "@narratage/caption-gemini";
import type { CaptionGeminiRequest, RawCaptionGeminiResponse } from "@narratage/caption-gemini";
import { parseScript } from "@narratage/script";

function style(id: string, fields: CaptionStyleIntent["planning"]["fields"] = []) {
  const base = defaultCaptionTrackProgram(id);
  return sealCaptionStyle({
    contract: "svml.caption-style@1",
    id,
    planning: {
      cueInstruction: "Prefer short complete semantic phrases and never cross clause punctuation.",
      fields,
    },
    presentation: { mode: "whole", stackingOrder: base.stacking.order, style: base.style },
  });
}

function options() {
  return sealCaptionGeminiProgram({
    contract: "svml.caption-gemini-program@1",
    model: "gemini-2.5-flash",
  });
}

function validResponse(request: CaptionGeminiRequest): RawCaptionGeminiResponse {
  return {
    runs: request.runs.map((run) => ({
      run_id: run.id,
      cues: [{
        after_atom_id: run.atomIds.at(-1)!,
        fields: run.fields.length === 0 ? [] : [{
          declaration_id: run.fields[0]!.id,
          atom_id: run.atomIds[0]!,
          value: "true",
        }],
      }],
    })),
  };
}

test("Gemini sees only immutable display atoms while Role and roleless runs come from Caption Program", () => {
  const narrative = parseScript("roles.svml", `
    <opening>Meet <SVML | semantic video markup language>.</opening>
    <answer><ALICE>Meaning becomes the source.</answer>
  `);
  const normal = style("normal");
  const alice = style("alice", [{
    id: "important",
    value: { kind: "boolean" },
    instruction: "Select zero or one word whose emphasis best communicates this Cue.",
    minimumPerCue: 0,
    maximumPerCue: 1,
  }]);
  const program = resolveCaptionProgram(narrative, "captions", normal, [{
    id: "alice-use",
    selector: { kind: "role", role: "ALICE" },
    style: alice,
  }]);
  const request = compileCaptionGeminiRequest(narrative, program, options());

  assert.deepEqual(request.runs.map((run) => run.styleId), ["normal", "alice"]);
  assert.equal(request.atoms.some((atom) => atom.text === "SVML"), true);
  assert.equal(request.atoms.some((atom) => atom.text === "semantic"), false);
  assert.equal(request.prompt.includes("semantic video markup language"), false);
  assert.equal(request.prompt.includes("pronunciation"), false);
  assert.equal("whisperx" in request, false);
  assert.equal("transcript" in request, false);

  const tampered = sealCaptionProgram({
    ...program,
    atoms: program.atoms.map((atom, index) => index === 0 ? { ...atom, text: "TAMPERED" } : atom),
  });
  assert.throws(() => compileCaptionGeminiRequest(narrative, tampered, options()),
    /display atoms differ from its Narrative/u);
});

test("Gemini may only cut each resolved run and assign declared attributes to atoms inside its Cue", () => {
  const narrative = parseScript("plan.svml", "<line><ALICE>Meaning becomes the source.</line>");
  const emphasis = style("emphasis", [{
    id: "important",
    value: { kind: "boolean" },
    instruction: "Select exactly one important word.",
    minimumPerCue: 1,
    maximumPerCue: 1,
  }]);
  const program = resolveCaptionProgram(narrative, "captions", emphasis, []);
  const request = compileCaptionGeminiRequest(narrative, program, options());
  const plan = sealCaptionGeminiPlan(request, validResponse(request));
  assert.deepEqual(
    plan.runs.flatMap((run) => run.cues.flatMap((cue) => cue.atomIds)),
    request.runs.flatMap((run) => run.atomIds),
  );
  assert.equal(plan.runs[0]?.cues[0]?.fields[0]?.declarationId, "important");

  assert.throws(
    () => sealCaptionGeminiPlan(request, { ...validResponse(request), corrected_text: "tampered" }),
    /unknown or missing fields/u,
  );
  const outside = structuredClone(validResponse(request));
  const field = outside.runs[0]!.cues[0]!.fields[0]! as { atom_id: string };
  field.atom_id = "foreign";
  assert.throws(() => sealCaptionGeminiPlan(request, outside), /outside its cue/u);
});

test("one atom may carry multiple independent fields and fields need not form contiguous spans", () => {
  const narrative = parseScript("multi-field.svml", "<line>one two three four five.</line>");
  const multi = style("multi", [
    {
      id: "best",
      value: { kind: "boolean" },
      instruction: "Select up to two best words.",
      minimumPerCue: 0,
      maximumPerCue: 2,
    },
    {
      id: "medium",
      value: { kind: "boolean" },
      instruction: "Independently select up to two medium words.",
      minimumPerCue: 0,
      maximumPerCue: 2,
    },
  ]);
  const program = resolveCaptionProgram(narrative, "captions", multi, []);
  const request = compileCaptionGeminiRequest(narrative, program, options());
  const atoms = request.runs[0]!.atomIds;
  const plan = sealCaptionGeminiPlan(request, {
    runs: [{
      run_id: request.runs[0]!.id,
      cues: [{
        after_atom_id: atoms.at(-1)!,
        fields: [
          { declaration_id: "best", atom_id: atoms[0]!, value: "true" },
          { declaration_id: "best", atom_id: atoms[2]!, value: "true" },
          { declaration_id: "medium", atom_id: atoms[1]!, value: "true" },
          { declaration_id: "medium", atom_id: atoms[2]!, value: "true" },
        ],
      }],
    }],
  });
  const fields = plan.runs[0]!.cues[0]!.fields;
  assert.equal(fields.filter((field) => field.atomId === atoms[2]).length, 2);
  assert.deepEqual(fields.filter((field) => field.declarationId === "best").map((field) => field.atomId),
    [atoms[0], atoms[2]]);
});
