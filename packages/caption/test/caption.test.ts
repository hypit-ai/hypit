import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import {
  assertCaptionPlanForProgram,
  captionTypes,
  decodeCaptionProgramSurface,
  resolveCaptionProgram,
  sealCaptionPlan,
  sealCaptionStyle,
  temporalizeCaptionPlan,
} from "@hypit/caption";
import type { CaptionFieldDeclaration, CaptionStyleIntent } from "@hypit/caption";
import { narrativeTypes } from "@hypit/narrative";
import type { CaptionDisplayWordSubset, Narrative } from "@hypit/narrative";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue, TypeRef } from "@hypit/protocol";
import { sealProgramSpace } from "@hypit/program-space";
import { locateAlignedSegmentTiming } from "../../speech-alignment/src/locate.js";
import type { AlignmentBasis } from "../../speech-alignment/src/locate.js";
import { materializeSemanticTake } from "../../speech-alignment/src/materialize.js";
import { sealAlignedTranscriptEvidence } from "@hypit/speech-evidence";
import {
  captionCorrespondence,
  captionDisplaySequence,
  captionSelectionWordSubset,
  parseScript,
} from "@hypit/script";
import type { StructuredElement, SurfaceResolvedReference } from "@hypit/markup";

type TranscriptFixture = {
  readonly words: readonly {
    readonly text: string;
    readonly startSec?: number;
    readonly endSec?: number;
    readonly score?: number;
  }[];
  readonly chars: readonly [];
};

function locate(narrative: Narrative, durationSec: number, segments: readonly TranscriptFixture[]) {
  if (narrative.segments.length !== 1 || segments.length !== 1) {
    throw new Error("Caption timing fixture requires one Segment.");
  }
  const space = sealProgramSpace({
    durationSec,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const audio = { kind: "blob" as const, digest: fixtureDigest("caption:test-audio"), size: 1, mediaType: "audio/wav" };
  const evidence = sealAlignedTranscriptEvidence({
    passages: segments.map((segment) => ({
      words: segment.words.map((word) => ({
        text: word.text,
        ...(word.startSec === undefined || word.endSec === undefined ? {} : {
          startSample: Math.round(word.startSec * 16_000),
          endSampleExclusive: Math.round(word.endSec * 16_000),
        }),
        ...(word.score === undefined ? {} : { score: word.score }),
      })),
      chars: [],
    })),
  });
  const audioBasis: AlignmentBasis = {
    programSpace: space,
    audio,
    segments: [{
      segmentId: narrative.segments[0]!.id,
      startFrame: 0,
      endFrameExclusive: Math.round(durationSec * 30),
    }],
  };
  const timing = locateAlignedSegmentTiming(narrative, audioBasis, evidence);
  const segment = narrative.segments[0]!;
  const take = materializeSemanticTake(narrative, {
    kind: "segment",
    id: segment.id,
    tokenStart: segment.tokenStart,
    tokenEndExclusive: segment.tokenEndExclusive,
  }, {
    timeline: { frameRate: space.frameRate, frameCount: Math.round(durationSec * 30) },
    audio: { artifact: audio },
  }, timing);
  return { id: "caption-semantic", items: [{ take }] };
}

function style(id: string, fields: readonly CaptionFieldDeclaration[] = []): CaptionStyleIntent {
  return sealCaptionStyle({

    id,
    planning: {
      cue: { minimumWords: 1, maximumWords: 5, instruction: "Use short complete semantic phrases." },
      fields,
    },
    rendering: { family: "test-caption@1", parameters: {} },
  });
}

test("Script emits punctuation-preserving display Words grouped into whole Atoms", () => {
  const parsed = parseScript(
    "punctuation.svml",
    "<line>45% back-and-forth damn! 300,000 don't U.S.A.</line>",
  );
  const display = captionDisplaySequence(parsed, "story.caption");
  const correspondence = captionCorrespondence(parsed, display.id);

  assert.deepEqual(display.words.map((word) => word.text), [
    "45%", "back-and-forth", "damn!", "300,000", "don't", "U.S.A.",
  ]);
  assert.deepEqual(display.atoms.map((atom) => atom.wordIds.length), [1, 1, 1, 1, 1, 1]);
  assert.deepEqual(correspondence.atoms.map((item) => item.atomId), display.atoms.map((atom) => atom.id));
});

test("Selection and Role project to ordered whole-Atom display-word subsets", () => {
  const parsed = parseScript(
    "selection.svml",
    "<intro>Roleless words stay readable.</intro><answer><ALICE>Keep @special this sentence @/special different.</answer>",
  );
  const display = captionDisplaySequence(parsed, "story.caption");
  const correspondence = captionCorrespondence(parsed, display.id);
  const special = captionSelectionWordSubset(parsed, display, correspondence, parsed.selections[0]!);
  assert.deepEqual(special.wordIds.map((id) => display.words.find((word) => word.id === id)!.text),
    ["this", "sentence"]);

  const aliceIds = display.words.filter((word) => word.role === "ALICE").map((word) => word.id);
  const program = resolveCaptionProgram(display, "captions", style("normal"), [{
    id: "alice-use",
    words: {

      id: "role:ALICE",
      sequenceId: display.id,
      wordIds: aliceIds,
    },
    style: style("alice"),
  }]);
  assert.deepEqual(program.runs.map((run) => run.styleId), ["normal", "alice"]);
});

test("Caption Mute is an ordered whole-Atom visibility mask and does not change planning runs", () => {
  const parsed = parseScript("mute.svml", "<line>Keep this hidden phrase visible ending.</line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const mutedWords = [display.words[2]!, display.words[3]!];
  const program = resolveCaptionProgram(display, "captions", style("normal"), [], [{
    id: "hide-middle",
    words: {

      id: "selection:hide-middle",
      sequenceId: display.id,
      wordIds: mutedWords.map((word) => word.id),
    },
  }]);

  assert.deepEqual(program.mutedWordIds, mutedWords.map((word) => word.id));
  assert.deepEqual(program.runs.flatMap((run) => run.wordIds), display.words.map((word) => word.id));
});

test("Caption timing applies Mute after planning and preserves the original Cue window", () => {
  const parsed = parseScript("mute-timing.svml", "<line>Keep this hidden phrase visible.</line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const correspondence = captionCorrespondence(parsed, display.id);
  const mutedWordIds = [display.words[0]!.id, display.words[2]!.id];
  const program = resolveCaptionProgram(display, "captions", style("normal"), [], [{
    id: "hide-disconnected",
    words: {

      id: "selection:hide-disconnected",
      sequenceId: display.id,
      wordIds: mutedWordIds,
    },
  }]);
  const plan = sealCaptionPlan({

    runs: [{
      id: program.runs[0]!.id,
      styleId: program.runs[0]!.styleId,
      cues: [{ id: "cue:1", atomIds: display.atoms.map((atom) => atom.id), fields: [] }],
    }],
  });
  const map = locate(parsed, 2, [{
    words: ["Keep", "this", "hidden", "phrase", "visible"].map((text, index) => ({
      text,
      startSec: index * 0.3,
      endSec: index * 0.3 + 0.2,
    })),
    chars: [],
  }]);

  const projection = temporalizeCaptionPlan(display, correspondence, map, program, plan);
  assert.equal(plan.runs[0]!.cues[0]!.atomIds.length, display.atoms.length);
  assert.deepEqual(projection.cues[0]!.atoms.map((atom) => atom.atomId),
    display.atoms.filter((atom) => !atom.wordIds.some((wordId) => mutedWordIds.includes(wordId)))
      .map((atom) => atom.id));
  assert.equal(projection.cues[0]!.startFrame, 0);
  assert.equal(projection.cues[0]!.endFrameExclusive, 42);
});

test("caption:Program lowers explicit Mute word subsets without a temporal mask", async () => {
  const parsed = parseScript("mute-surface.svml", "<line>Keep this private phrase hidden.</line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const hidden: CaptionDisplayWordSubset = {

    id: "private",
    sequenceId: display.id,
    wordIds: display.words.slice(2, 4).map((word) => word.id),
  };
  const defaultStyle = style("normal");
  const resolved = <T,>(path: string, type: TypeRef, value: T): SurfaceResolvedReference => {
    const stored = { kind: "inline", value: canonicalize(value) } satisfies StoredValue;
    return {
      path,
      ref: { kind: "record", id: path },
      type,
      record: {
        id: path,
        type,
        value: stored,
      },
    };
  };
  const references = new Map<string, SurfaceResolvedReference>([
    ["story.caption", resolved("story.caption", narrativeTypes.captionDisplay, display)],
    ["story.caption.selection.private", resolved(
      "story.caption.selection.private",
      narrativeTypes.captionDisplayWordSubset,
      hidden,
    )],
    ["normal", resolved("normal", captionTypes.style, defaultStyle)],
  ]);
  const element: StructuredElement = {
    kind: "element",
    name: "caption:Program",
    attributes: {
      id: "captions",
      display: { kind: "reference", path: "story.caption" },
      default: { kind: "reference", path: "normal" },
    },
    children: [{
      kind: "element",
      name: "caption:Mute",
      attributes: { words: { kind: "reference", path: "story.caption.selection.private" } },
      children: [],
      range: { start: 10, end: 40 },
    }],
    range: { start: 0, end: 50 },
  };
  const output = await decodeCaptionProgramSurface({
    sourceName: "main.svml",
    element,
    resolveReference: (path) => references.get(path),
    resolveAsset: () => { throw new Error("Caption Program does not resolve assets"); },
  });
  const value = output.records[0]!.value;
  assert.equal(value.kind, "inline");
  assert.deepEqual(value.kind === "inline"
    ? (value.value as unknown as { mutedWordIds: readonly string[] }).mutedWordIds
    : [], hidden.wordIds);
});

test("Caption Plan partitions Atoms and assigns independent fields to display Words", () => {
  const parsed = parseScript("plan.svml", "<line>one two three four.</line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const important: CaptionFieldDeclaration = {
    id: "important",
    value: { kind: "boolean" },
    instruction: "Select up to two important words.",
    minimumPerCue: 0,
    maximumPerCue: 2,
  };
  const program = resolveCaptionProgram(display, "captions", style("fine", [important]), []);
  const run = program.runs[0]!;
  const plan = sealCaptionPlan({

    runs: [{ id: run.id, styleId: run.styleId, cues: [{
      id: "cue:1",
      atomIds: display.atoms.map((atom) => atom.id),
      fields: [
        { declarationId: "important", wordId: display.words[0]!.id, value: "true" },
        { declarationId: "important", wordId: display.words[2]!.id, value: "true" },
      ],
    }] }],
  });
  assert.doesNotThrow(() => assertCaptionPlanForProgram(plan, program, display));
});

test("Cue word bounds are planner preferences and cannot split an oversized authored Atom", () => {
  const parsed = parseScript("impossible.svml", "<line><one two three four | something></line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const compact = sealCaptionStyle({

    id: "compact",
    planning: { cue: { minimumWords: 1, maximumWords: 3, instruction: "Prefer at most three words." }, fields: [] },
    rendering: { family: "test-caption@1", parameters: {} },
  });
  const program = resolveCaptionProgram(display, "captions", compact, []);
  assert.equal(display.atoms.length, 1);
  assert.equal(display.atoms[0]!.wordIds.length, 4);
  assert.doesNotThrow(() => assertCaptionPlanForProgram(sealCaptionPlan({

    runs: [{ id: program.runs[0]!.id, styleId: compact.id, cues: [{
      id: "cue:1", atomIds: [display.atoms[0]!.id], fields: [],
    }] }],
  }), program, display));
});

test("Dual Text exposes one whole timed display Atom and never invents internal word timing", () => {
  const parsed = parseScript("timed.svml", "<line><that was insane | what the fuck></line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const correspondence = captionCorrespondence(parsed, display.id);
  assert.deepEqual(display.atoms.map((atom) => atom.wordIds.length), [3]);
  assert.deepEqual(display.words.map((word) => word.text), ["that", "was", "insane"]);
  assert.equal(correspondence.atoms[0]!.sourceTokenIds.length, 3);

  const program = resolveCaptionProgram(display, "captions", style("fine"), []);
  const run = program.runs[0]!;
  const plan = sealCaptionPlan({

    runs: [{ id: run.id, styleId: run.styleId, cues: [{
      id: "cue:1", atomIds: [display.atoms[0]!.id], fields: [],
    }] }],
  });
  const map = locate(parsed, 1, [{
    words: [
      { text: "what", startSec: 0.1, endSec: 0.25 },
      { text: "the", startSec: 0.3, endSec: 0.42 },
      { text: "fuck", startSec: 0.48, endSec: 0.72 },
    ],
    chars: [],
  }]);
  const projection = temporalizeCaptionPlan(display, correspondence, map, program, plan);
  assert.deepEqual(projection.cues, [{
    id: "cue:1",
    styleId: run.styleId,
    startFrame: 3,
    endFrameExclusive: 22,
    atoms: [{ atomId: display.atoms[0]!.id, startFrame: 3, endFrameExclusive: 22 }],
    fields: [],
  }]);
  assert.equal("words" in projection.cues[0]!, false);
});

test("a Selection cutting an indivisible Dual Text Atom fails before Caption planning", () => {
  const parsed = parseScript("partial.svml", "<line><lmao | laughed my @part ass out @/part></line>");
  const display = captionDisplaySequence(parsed, "story.caption");
  const correspondence = captionCorrespondence(parsed, display.id);
  assert.throws(
    () => captionSelectionWordSubset(parsed, display, correspondence, parsed.selections[0]!),
    /owns only part/u,
  );
});
