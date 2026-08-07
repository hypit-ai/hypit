import type { Narrative } from "@narratage/narrative";
import { sealProgramSpace } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { sealSpeechBasis } from "@narratage/speech";
import type { SpeechAudioBasis, SpeechBasis } from "@narratage/speech";
import { sealAlignedTranscriptEvidence } from "@narratage/speech-evidence";
import type { AlignedTranscriptEvidence, SpeechCharacterEvidence, SpeechWordEvidence } from "@narratage/speech-evidence";
import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@narratage/protocol";
import { parseScript } from "@narratage/script";
import {
  SpeechAlignmentError,
  alignWordGroups,
  locateSpeechTiming,
  speechAlignmentComponent,
  speechAlignmentManifest,
} from "@narratage/speech-alignment";

/** The alignment classification is a property of alignWordGroups, tested at its own level. */
function relations(
  narrative: Narrative,
  words: readonly SpeechWordEvidence[],
  segmentId = "line",
): string[] {
  const segment = narrative.segments.find((item) => item.id === segmentId)!;
  return alignWordGroups(
    segmentId,
    narrative.tokens.slice(segment.tokenStart, segment.tokenEndExclusive),
    words,
  ).map((group) => group.relation);
}

function evidence(args: {
  readonly basis: SpeechAudioBasis;
  readonly segmentId?: string;
  readonly durationSec?: number;
  readonly startSec?: number;
  readonly endSec?: number;
  readonly words: readonly SpeechWordEvidence[];
  readonly chars?: readonly SpeechCharacterEvidence[];
  readonly vad?: readonly { readonly startSec: number; readonly endSec: number }[];
}): AlignedTranscriptEvidence {
  return sealAlignedTranscriptEvidence({
    contract: "svml.aligned-transcript-evidence@1",
    durationSec: args.basis.programSpace.durationSec,
    segments: [
      {
        sourceSegmentId: args.segmentId ?? "line",
        startSec: args.startSec ?? 0,
        endSec: args.endSec ?? args.basis.programSpace.durationSec,
        words: args.words,
        chars: args.chars ?? [],
        ...(args.vad === undefined ? {} : { speechActivity: args.vad }),
      },
    ],
  });
}

function speechBasis(
  narrative: Narrative,
  durationSec = 2,
  windows?: readonly { readonly startSec: number; readonly endSec: number }[],
): SpeechAudioBasis {
  const programSpace = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec,
    frameRate: { numerator: 1_000, denominator: 1 },
  });
  const audioDigest = digestOf(`fixture:audio:${narrative.segments.map((segment) => segment.id).join("+")}:${durationSec}`);
  const segments = narrative.segments.map((segment, index) => ({
    segmentId: segment.id,
    startSec: windows?.[index]?.startSec ?? durationSec * index / narrative.segments.length,
    endSec: windows?.[index]?.endSec ?? durationSec * (index + 1) / narrative.segments.length,
  }));
  const take = sealSpeechBasis({
    contract: "svml.speech-basis@1",
    programSpace,
    audio: { digest: audioDigest, size: 1, mediaType: "audio/wav", durationSec },
    visualTrack: {
      clips: segments.map((segment) => ({
        segmentId: segment.segmentId,
        artifact: {
          digest: digestOf(`fixture:clip:${segment.segmentId}`),
          size: 1,
          mediaType: "video/mp4",
          durationSec: segment.endSec - segment.startSec,
        },
        startSec: segment.startSec,
        endSec: segment.endSec,
      })),
    },
    segments,
  });
  return audioProjection(take);
}

function audioProjection(basis: SpeechBasis): SpeechAudioBasis {
  return {
    contract: "svml.speech-audio-basis@1",
    programSpace: basis.programSpace,
    audio: basis.audio,
    segments: basis.segments,
  };
}

function locate(
  narrative: Narrative,
  args: Omit<Parameters<typeof evidence>[0], "basis">,
) {
  const durationSec = args.durationSec ?? 2;
  const basis = speechBasis(narrative, durationSec, [{
    startSec: args.startSec ?? 0,
    endSec: args.endSec ?? durationSec,
  }]);
  return locateSpeechTiming(narrative, basis, evidence({ ...args, basis }));
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

test("the component enumerates the exact Manifest-declared locator", () => {
  assert.deepEqual(
    speechAlignmentComponent.producers.map((facet) => ({
      name: facet.producer.name,
      digest: facet.implementationDigest,
    })),
    speechAlignmentManifest.producers.map((producer) => ({
      name: producer.name,
      digest: producer.implementation.digest,
    })),
  );
});

test("exact transcript words cover every Script and Segment anchor", () => {
  const narrative = parseScript("exact.svml", "<line>Hello world.</line>");
  const map = locate(narrative, {
    words: [
      { text: "Hello", startSec: 0.1, endSec: 0.4, score: 0.97 },
      { text: "world", startSec: 0.5, endSec: 0.9, score: 0.96 },
    ],
  });

  assert.equal(map.tokens.length, 2);
  assert.equal(map.anchors.length, 2 * narrative.tokens.length + 2 * narrative.segments.length);
  assert.deepEqual(
    map.tokens.map((token) => [token.startSec, token.endSec]),
    [
      [0.1, 0.4],
      [0.5, 0.9],
    ],
  );
  assert.equal(new Set(map.anchors.map((anchor) => anchor.identity)).size, map.anchors.length);
  assert.equal(map.contract, "svml.complete-semantic-map@1");
});

test("M:1 uses evidence character times instead of dividing a merged word by length", () => {
  const narrative = parseScript("merge.svml", "<line>can not</line>");
  const merged = [{ text: "cannot", startSec: 0.1, endSec: 0.78, score: 0.93 }];
  const map = locate(narrative, {
    endSec: 1,
    durationSec: 1,
    words: merged,
    chars: characters(
      "cannot",
      [0.1, 0.18, 0.27, 0.42, 0.51, 0.63],
      [0.17, 0.26, 0.36, 0.5, 0.62, 0.78],
    ),
  });

  assert.deepEqual(relations(narrative, merged), ["merge"]);
  assert.deepEqual(
    map.tokens.map((token) => [token.startSec, token.endSec]),
    [
      [0.1, 0.36],
      [0.42, 0.78],
    ],
  );
});

test("1:N wraps all evidence words in one Script token", () => {
  const narrative = parseScript("split.svml", "<line>website</line>");
  const split = [
    { text: "web", startSec: 0.2, endSec: 0.45, score: 0.9 },
    { text: "site", startSec: 0.5, endSec: 0.82, score: 0.91 },
  ];
  const map = locate(narrative, { words: split });

  assert.deepEqual(relations(narrative, split), ["split"]);
  assert.deepEqual(
    [map.tokens[0]?.startSec, map.tokens[0]?.endSec],
    [0.2, 0.82],
  );
});

test("a recognized filler stays an insertion and does not absorb neighboring Script words", () => {
  const narrative = parseScript("insertion.svml", "<line>I really like it.</line>");
  const spoken = [
    { text: "I", startSec: 0.1, endSec: 0.2, score: 0.98 },
    { text: "uh", startSec: 0.24, endSec: 0.34, score: 0.88 },
    { text: "really", startSec: 0.4, endSec: 0.62, score: 0.95 },
    { text: "like", startSec: 0.67, endSec: 0.82, score: 0.96 },
    { text: "it", startSec: 0.86, endSec: 0.96, score: 0.96 },
  ];
  const map = locate(narrative, { words: spoken });

  assert.deepEqual(relations(narrative, spoken), [
    "exact",
    "evidence-insertion",
    "exact",
    "exact",
    "exact",
  ]);
  assert.deepEqual(
    map.tokens.map((token) => [token.startSec, token.endSec]),
    [
      [0.1, 0.2],
      [0.4, 0.62],
      [0.67, 0.82],
      [0.86, 0.96],
    ],
  );
});

test("an omitted Script word receives the complete unmeasured interval between neighbors", () => {
  const narrative = parseScript("omission.svml", "<line>This is very good.</line>");
  const spoken = [
    { text: "This", startSec: 0.1, endSec: 0.25, score: 0.98 },
    { text: "is", startSec: 0.3, endSec: 0.4, score: 0.97 },
    { text: "good", startSec: 0.6, endSec: 0.82, score: 0.98 },
  ];
  const map = locate(narrative, { words: spoken });

  assert.deepEqual(relations(narrative, spoken), [
    "exact",
    "exact",
    "source-omission",
    "exact",
  ]);
  assert.deepEqual(
    [map.tokens[2]?.startSec, map.tokens[2]?.endSec],
    [0.4, 0.6],
  );
});

test("VAD bounds contain estimates when an entire Script Segment has no recognized words", () => {
  const narrative = parseScript("vad.svml", "<line>One two.</line>");
  const map = locate(narrative, {
    words: [],
    vad: [{ startSec: 0.4, endSec: 1.2 }],
  });

  assert.deepEqual(
    map.tokens.map((token) => [token.startSec, token.endSec]),
    [
      [0.4, 0.8],
      [0.8, 1.2],
    ],
  );
});

test("multiple Script Segments stay independent even when evidence records arrive out of order", () => {
  const narrative = parseScript("segments.svml", "<one>Hello.</one><two>Goodbye.</two>");
  const basis = speechBasis(narrative, 2, [
    { startSec: 0, endSec: 1 },
    { startSec: 1, endSec: 2 },
  ]);
  const map = locateSpeechTiming(narrative, basis, sealAlignedTranscriptEvidence({
    contract: "svml.aligned-transcript-evidence@1",
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
  }));

  assert.deepEqual(map.tokens.map((token) => [token.segmentId, token.startSec, token.endSec]), [
    ["one", 0.2, 0.55],
    ["two", 1.2, 1.6],
  ]);
});

test("invalid overlapping evidence word windows fail instead of producing a reversed map", () => {
  const narrative = parseScript("bad.svml", "<line>one two</line>");
  assert.throws(
    () => locate(narrative, {
      words: [
        { text: "one", startSec: 0.1, endSec: 0.5 },
        { text: "two", startSec: 0.4, endSec: 0.8 },
      ],
    }),
    (error: unknown) => error instanceof SpeechAlignmentError && error.code === "SPEECH_WORD_ORDER",
  );
});

test("Evidence is interpreted only through the explicitly connected SpeechAudioBasis", () => {
  const narrative = parseScript("affinity.svml", "<line>Hello world.</line>");
  const basis = speechBasis(narrative, 2);
  const mismatched = evidence({
    basis,
    words: [{ text: "Hello", startSec: 0.1, endSec: 0.4 }, { text: "world", startSec: 0.5, endSec: 0.9 }],
  });
  const anotherSpace = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec: 2,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const anotherBasis = { ...basis, programSpace: anotherSpace };
  const map = locateSpeechTiming(narrative, anotherBasis, mismatched);
  assert.equal(map.tokens[0]?.startFrame, 3);
});

test("the final map is quantized once into the selected ProgramSpace", () => {
  const narrative = parseScript("frames.svml", "<line>Hello.</line>");
  const original = speechBasis(narrative, 1);
  const programSpace = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const basis: SpeechAudioBasis = {
    ...original,
    programSpace,
  };
  const map = locateSpeechTiming(narrative, basis, evidence({
    basis,
    durationSec: 1,
    endSec: 1,
    words: [{ text: "Hello", startSec: 0.111, endSec: 0.289 }],
  }));
  assert.deepEqual(
    [map.tokens[0]?.startFrame, map.tokens[0]?.endFrame, map.tokens[0]?.startSec, map.tokens[0]?.endSec],
    [3, 9, 0.1, 0.3],
  );
  assert.equal(map.anchors.every((anchor) => anchor.timeSec === anchor.frame / 30), true);
});

test("a backwards character measurement reaches the map backwards, uncorrected", () => {
  // WhisperX character times need not be ordered. The locator reports what it
  // measured; deciding what a backwards window means belongs to whoever renders
  // it, and silently flattening it here would hide the evidence. Three Script
  // words merge into one spoken word, so the middle one inherits neither edge of
  // the group envelope and its own characters decide its window.
  const narrative = parseScript("backwards.svml", "<line>can not now</line>");
  const map = locate(narrative, {
    endSec: 1,
    durationSec: 1,
    words: [{ text: "cannotnow", startSec: 0.1, endSec: 0.9 }],
    chars: characters(
      "cannotnow",
      [0.10, 0.15, 0.20, /* backwards: */ 0.50, 0.45, 0.40, 0.60, 0.65, 0.70],
      [0.15, 0.20, 0.25, /* backwards: */ 0.55, 0.50, 0.45, 0.65, 0.70, 0.75],
    ),
  });
  const middle = map.tokens[1]!;
  assert.equal(
    middle.startSec > middle.endSec,
    true,
    `the inverted measurement survived, got ${middle.startSec}..${middle.endSec}`,
  );
});
