import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCaptionPlanForProgram,
  resolveCaptionProgram,
  sealCaptionPlan,
  sealCaptionStyle,
  temporalizeCaption,
  temporalizeCaptionPlan,
} from "@narratage/caption";
import type { CaptionFieldDeclaration, CaptionStyleIntent } from "@narratage/caption";
import type { Narrative } from "@narratage/narrative";
import { digestOf } from "@narratage/protocol";
import { sealProgramSpace } from "@narratage/program-space";
import { sealSpeechBasis } from "@narratage/speech";
import type { SpeechAudioBasis } from "@narratage/speech";
import { locateSpeechTiming } from "@narratage/speech-alignment";
import { sealAlignedTranscriptEvidence } from "@narratage/speech-evidence";
import type { AlignedTranscriptSegment } from "@narratage/speech-evidence";
import {
  captionSelectionWordSubset,
  captionWordSequence,
  parseScript,
} from "@narratage/script";

function locate(narrative: Narrative, durationSec: number, segments: readonly AlignedTranscriptSegment[]) {
  const space = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const audio = { digest: digestOf("caption:test-audio"), size: 1, mediaType: "audio/wav", durationSec };
  const basisSegments = narrative.segments.map((segment, index) => ({
    segmentId: segment.id,
    startSec: segments[index]!.startSec,
    endSec: segments[index]!.endSec,
  }));
  const basis = sealSpeechBasis({
    contract: "svml.speech-basis@1",
    programSpace: space,
    audio,
    visualTrack: { clips: basisSegments.map((segment) => ({
      segmentId: segment.segmentId,
      artifact: { digest: digestOf(segment.segmentId), size: 1, mediaType: "video/mp4", durationSec: segment.endSec - segment.startSec },
      startSec: segment.startSec,
      endSec: segment.endSec,
    })) },
    segments: basisSegments,
  });
  const evidence = sealAlignedTranscriptEvidence({ contract: "svml.aligned-transcript-evidence@1", durationSec, segments });
  const audioBasis: SpeechAudioBasis = {
    contract: "svml.speech-audio-basis@1",
    programSpace: basis.programSpace,
    audio: basis.audio,
    segments: basis.segments,
  };
  return locateSpeechTiming(narrative, audioBasis, evidence);
}

function style(id: string, fields: readonly CaptionFieldDeclaration[] = []): CaptionStyleIntent {
  return sealCaptionStyle({
    contract: "svml.caption-style@1",
    id,
    planning: {
      cue: { minimumWords: 1, maximumWords: 5, instruction: "Use short complete semantic phrases." },
      fields,
    },
    rendering: { family: "test-caption@1", parameters: {} },
  });
}

test("Script projects an ordered word universe and explicit Selection word subset", () => {
  const narrative = parseScript(
    "selection.svml",
    "<line>Keep this @special one sentence different @/special and return.</line>",
  );
  const words = captionWordSequence(narrative, "story.caption.words");
  const special = captionSelectionWordSubset(words, narrative.selections[0]!);
  assert.deepEqual(words.words.map((word) => word.text), ["Keep", "this", "one", "sentence", "different", "and", "return"]);
  assert.deepEqual(special.wordIds.map((id) => words.words.find((word) => word.id === id)!.text),
    ["one", "sentence", "different"]);

  const program = resolveCaptionProgram(words, "captions", style("normal"), [{
    id: "special-use",
    words: special,
    style: style("special"),
  }]);
  assert.deepEqual(program.runs.map((run) => [run.styleId, run.wordIds.length]), [
    ["normal", 2], ["special", 3], ["normal", 2],
  ]);
  assert.equal("words" in program, false, "Program must reference the word edge rather than copy its payload");
});

test("Role replacement is a word subset and the explicit default covers roleless prose", () => {
  const narrative = parseScript("roles.svml", `
    <intro>Roleless words stay readable.</intro>
    <answer><ALICE>Only this sentence changes.</answer>
  `);
  const words = captionWordSequence(narrative, "story.caption.words");
  const aliceIds = words.words.filter((word) => word.role === "ALICE").map((word) => word.id);
  const program = resolveCaptionProgram(words, "captions", style("normal"), [{
    id: "alice-use",
    words: { contract: "svml.caption-word-subset@1", id: "role:ALICE", sequenceId: words.id, wordIds: aliceIds },
    style: style("alice"),
  }]);
  assert.deepEqual(program.runs.map((run) => run.styleId), ["normal", "alice"]);
});

test("Caption Plan validates Cue word bounds and independent per-word fields", () => {
  const narrative = parseScript("plan.svml", "<line>one two three four.</line>");
  const words = captionWordSequence(narrative, "story.caption.words");
  const important: CaptionFieldDeclaration = {
    id: "important",
    value: { kind: "boolean" },
    instruction: "Select up to two important words.",
    minimumPerCue: 0,
    maximumPerCue: 2,
  };
  const program = resolveCaptionProgram(words, "captions", style("fine", [important]), []);
  const run = program.runs[0]!;
  const plan = sealCaptionPlan({
    contract: "svml.caption-plan@1",
    runs: [{ id: run.id, styleId: run.styleId, cues: [{
      id: "cue:1",
      wordIds: run.wordIds,
      fields: [
        { declarationId: "important", wordId: run.wordIds[0]!, value: "true" },
        { declarationId: "important", wordId: run.wordIds[2]!, value: "true" },
      ],
    }] }],
  });
  assert.doesNotThrow(() => assertCaptionPlanForProgram(plan, program));
});

test("Program rejects a Style run that no legal Cue partition can satisfy", () => {
  const narrative = parseScript("impossible.svml", "<line>one two three four five six.</line>");
  const words = captionWordSequence(narrative, "story.caption.words");
  const impossible = sealCaptionStyle({
    contract: "svml.caption-style@1",
    id: "impossible",
    planning: { cue: { minimumWords: 4, maximumWords: 5, instruction: "Use four or five words." }, fields: [] },
    rendering: { family: "test-caption@1", parameters: {} },
  });
  assert.throws(() => resolveCaptionProgram(words, "captions", impossible, []), /cannot satisfy/u);
});

test("planned display words join measured speech timing only after planning", () => {
  const narrative = parseScript("timed.svml", "<line><that was insane | what the fuck></line>");
  const words = captionWordSequence(narrative, "story.caption.words");
  const program = resolveCaptionProgram(words, "captions", style("fine"), []);
  const run = program.runs[0]!;
  const plan = sealCaptionPlan({
    contract: "svml.caption-plan@1",
    runs: [{ id: run.id, styleId: run.styleId, cues: run.wordIds.map((wordId, index) => ({
      id: `cue:${index + 1}`, wordIds: [wordId], fields: [],
    })) }],
  });
  const map = locate(narrative, 1, [{
    sourceSegmentId: "line", startSec: 0, endSec: 1,
    words: [
      { text: "what", startSec: 0.1, endSec: 0.25 },
      { text: "the", startSec: 0.3, endSec: 0.42 },
      { text: "fuck", startSec: 0.48, endSec: 0.72 },
    ],
    chars: [],
  }]);
  const projection = temporalizeCaptionPlan(narrative, map, words, program, plan);
  assert.deepEqual(projection.regions.map((region) => region.display), ["that", "was", "insane"]);
  assert.equal(projection.regions[0]!.endSec <= projection.regions[1]!.startSec, true);
  assert.deepEqual(projection.regions.map((region) => region.wordIds?.length), [1, 1, 1]);
  assert.equal(temporalizeCaption(narrative, map).text, "that was insane");
});

test("a Selection cutting an indivisible Dual Text word fails before Caption planning", () => {
  const narrative = parseScript("partial.svml", "<line><lmao | laughed my @part ass out @/part></line>");
  const words = captionWordSequence(narrative, "story.caption.words");
  assert.throws(() => captionSelectionWordSubset(words, narrative.selections[0]!), /owns only part/u);
});
