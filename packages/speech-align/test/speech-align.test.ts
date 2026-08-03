import assert from "node:assert/strict";
import test from "node:test";

import { parseScript } from "@svml/script";
import {
  SpeechAlignmentError,
  locateSpeechTiming,
} from "@svml/speech-align";
import type {
  AlignedTranscriptEvidence,
  SpeechCharacterEvidence,
  SpeechWordEvidence,
} from "@svml/speech-align";

function evidence(args: {
  readonly segmentId?: string;
  readonly durationSec?: number;
  readonly startSec?: number;
  readonly endSec?: number;
  readonly words: readonly SpeechWordEvidence[];
  readonly chars?: readonly SpeechCharacterEvidence[];
  readonly vad?: readonly { readonly startSec: number; readonly endSec: number }[];
}): AlignedTranscriptEvidence {
  return {
    contract: "svml.aligned-transcript-evidence@0",
    durationSec: args.durationSec ?? 2,
    segments: [
      {
        sourceSegmentId: args.segmentId ?? "line",
        startSec: args.startSec ?? 0,
        endSec: args.endSec ?? 2,
        words: args.words,
        chars: args.chars ?? [],
        ...(args.vad === undefined ? {} : { speechActivity: args.vad }),
      },
    ],
  };
}

function characters(
  text: string,
  starts: readonly number[],
  ends: readonly number[],
  wordIndex = 0,
): SpeechCharacterEvidence[] {
  return [...text].map((char, index) => ({
    char,
    wordIndex,
    startSec: starts[index]!,
    endSec: ends[index]!,
    score: 0.95,
  }));
}

test("exact transcript words cover every Script and Segment anchor", () => {
  const narrative = parseScript("exact.svml", "<line>Hello world.</line>");
  const map = locateSpeechTiming(narrative, evidence({
    words: [
      { text: "Hello", startSec: 0.1, endSec: 0.4, score: 0.97 },
      { text: "world", startSec: 0.5, endSec: 0.9, score: 0.96 },
    ],
  }));

  assert.equal(map.tokens.length, 2);
  assert.equal(map.anchors.length, 2 * narrative.tokens.length + 2 * narrative.segments.length);
  assert.deepEqual(
    map.tokens.map((token) => [token.startSec, token.endSec, token.startQuality, token.endQuality]),
    [
      [0.1, 0.4, "measured", "measured"],
      [0.5, 0.9, "measured", "measured"],
    ],
  );
  assert.equal(new Set(map.anchors.map((anchor) => anchor.identity)).size, map.anchors.length);
  assert.match(map.mapDigest, /^sha256:[a-f0-9]{64}$/u);
});

test("M:1 uses evidence character times instead of dividing a merged word by length", () => {
  const narrative = parseScript("merge.svml", "<line>can not</line>");
  const map = locateSpeechTiming(narrative, evidence({
    endSec: 1,
    durationSec: 1,
    words: [{ text: "cannot", startSec: 0.1, endSec: 0.78, score: 0.93 }],
    chars: characters(
      "cannot",
      [0.1, 0.18, 0.27, 0.42, 0.51, 0.63],
      [0.17, 0.26, 0.36, 0.5, 0.62, 0.78],
    ),
  }));

  assert.equal(map.groups[0]?.relation, "merge");
  assert.deepEqual(
    map.tokens.map((token) => [token.startSec, token.endSec, token.startQuality]),
    [
      [0.1, 0.36, "derived"],
      [0.42, 0.78, "derived"],
    ],
  );
});

test("1:N wraps all evidence words in one Script token", () => {
  const narrative = parseScript("split.svml", "<line>website</line>");
  const map = locateSpeechTiming(narrative, evidence({
    words: [
      { text: "web", startSec: 0.2, endSec: 0.45, score: 0.9 },
      { text: "site", startSec: 0.5, endSec: 0.82, score: 0.91 },
    ],
  }));

  assert.equal(map.groups[0]?.relation, "split");
  assert.deepEqual(
    [map.tokens[0]?.startSec, map.tokens[0]?.endSec, map.tokens[0]?.startQuality],
    [0.2, 0.82, "derived"],
  );
});

test("a recognized filler stays an insertion and does not absorb neighboring Script words", () => {
  const narrative = parseScript("insertion.svml", "<line>I really like it.</line>");
  const map = locateSpeechTiming(narrative, evidence({
    words: [
      { text: "I", startSec: 0.1, endSec: 0.2, score: 0.98 },
      { text: "uh", startSec: 0.24, endSec: 0.34, score: 0.88 },
      { text: "really", startSec: 0.4, endSec: 0.62, score: 0.95 },
      { text: "like", startSec: 0.67, endSec: 0.82, score: 0.96 },
      { text: "it", startSec: 0.86, endSec: 0.96, score: 0.96 },
    ],
  }));

  assert.deepEqual(map.groups.map((group) => group.relation), [
    "exact",
    "evidence-insertion",
    "exact",
    "exact",
    "exact",
  ]);
  assert.deepEqual(
    map.tokens.map((token) => [token.startSec, token.endSec, token.startQuality]),
    [
      [0.1, 0.2, "measured"],
      [0.4, 0.62, "measured"],
      [0.67, 0.82, "measured"],
      [0.86, 0.96, "measured"],
    ],
  );
});

test("an omitted Script word gets a zero-width estimated point between measured neighbors", () => {
  const narrative = parseScript("omission.svml", "<line>This is very good.</line>");
  const map = locateSpeechTiming(narrative, evidence({
    words: [
      { text: "This", startSec: 0.1, endSec: 0.25, score: 0.98 },
      { text: "is", startSec: 0.3, endSec: 0.4, score: 0.97 },
      { text: "good", startSec: 0.6, endSec: 0.82, score: 0.98 },
    ],
  }));

  assert.deepEqual(map.groups.map((group) => group.relation), [
    "exact",
    "exact",
    "source-omission",
    "exact",
  ]);
  assert.deepEqual(
    [map.tokens[2]?.startSec, map.tokens[2]?.endSec, map.tokens[2]?.startQuality],
    [0.5, 0.5, "estimated"],
  );
});

test("VAD bounds contain estimates when an entire Script Segment has no recognized words", () => {
  const narrative = parseScript("vad.svml", "<line>One two.</line>");
  const map = locateSpeechTiming(narrative, evidence({
    words: [],
    vad: [{ startSec: 0.4, endSec: 1.2 }],
  }));

  assert.deepEqual(
    map.tokens.map((token) => [token.startSec, token.endSec, token.startQuality]),
    [
      [0.4 + 0.8 / 3, 0.4 + 0.8 / 3, "estimated"],
      [0.4 + 1.6 / 3, 0.4 + 1.6 / 3, "estimated"],
    ],
  );
});

test("multiple Script Segments stay independent even when evidence records arrive out of order", () => {
  const narrative = parseScript("segments.svml", "<one>Hello.</one><two>Goodbye.</two>");
  const map = locateSpeechTiming(narrative, {
    contract: "svml.aligned-transcript-evidence@0",
    durationSec: 2,
    segments: [
      {
        sourceSegmentId: "two",
        startSec: 1,
        endSec: 2,
        words: [{ text: "Goodbye", startSec: 1.2, endSec: 1.6 }],
        chars: [],
      },
      {
        sourceSegmentId: "one",
        startSec: 0,
        endSec: 1,
        words: [{ text: "Hello", startSec: 0.2, endSec: 0.55 }],
        chars: [],
      },
    ],
  });

  assert.deepEqual(map.tokens.map((token) => [token.segmentId, token.startSec, token.endSec]), [
    ["one", 0.2, 0.55],
    ["two", 1.2, 1.6],
  ]);
  assert.deepEqual(map.groups.map((group) => group.sourceSegmentId), ["one", "two"]);
});

test("invalid overlapping evidence word windows fail instead of producing a reversed map", () => {
  const narrative = parseScript("bad.svml", "<line>one two</line>");
  assert.throws(
    () => locateSpeechTiming(narrative, evidence({
      words: [
        { text: "one", startSec: 0.1, endSec: 0.5 },
        { text: "two", startSec: 0.4, endSec: 0.8 },
      ],
    })),
    (error: unknown) => error instanceof SpeechAlignmentError && error.code === "SPEECH_WORD_ORDER",
  );
});
