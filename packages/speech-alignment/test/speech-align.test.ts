import type { Narrative } from "@hypit/narrative";
import { sealProgramSpace } from "@hypit/program-space";
import { materializeSemanticTake } from "@hypit/speech";
import { sealAlignedTranscriptEvidence } from "@hypit/speech-evidence";
import type { AlignedTranscriptEvidence, SpeechCharacterEvidence, SpeechWordEvidence } from "@hypit/speech-evidence";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import { narrativeValue, parseScript as parseScriptSource } from "@hypit/script";
import {
  SpeechAlignmentError,
  alignWordGroups,
} from "@hypit/speech-alignment";
import { locateAlignedSegmentTiming } from "../src/locate.js";
import type { AlignmentBasis } from "../src/locate.js";

type WordFixture = {
  readonly text: string;
  readonly startSec?: number;
  readonly endSec?: number;
  readonly score?: number;
};

function parseScript(sourceName: string, source: string): Narrative {
  return narrativeValue(parseScriptSource(sourceName, source), "test-narrative") as unknown as Narrative;
}

function wordEvidence(word: WordFixture): SpeechWordEvidence {
  return {
    text: word.text,
    ...(word.startSec === undefined || word.endSec === undefined ? {} : {
      startSample: Math.round(word.startSec * 16_000),
      endSampleExclusive: Math.round(word.endSec * 16_000),
    }),
    ...(word.score === undefined ? {} : { score: word.score }),
  };
}

/** The alignment classification is a property of alignWordGroups, tested at its own level. */
function relations(
  narrative: Narrative,
  words: readonly WordFixture[],
  segmentId = "line",
): string[] {
  const segment = narrative.segments.find((item) => item.id === segmentId)!;
  return alignWordGroups(
    segmentId,
    narrative.tokens.slice(segment.tokenStart, segment.tokenEndExclusive),
    words.map(wordEvidence),
  ).map((group) => group.relation);
}

function evidence(args: {
  readonly basis: AlignmentBasis;
  readonly durationSec?: number;
  readonly startSec?: number;
  readonly endSec?: number;
  readonly words: readonly WordFixture[];
  readonly chars?: readonly SpeechCharacterEvidence[];
  readonly vad?: readonly { readonly startSec: number; readonly endSec: number }[];
}): AlignedTranscriptEvidence {
  return sealAlignedTranscriptEvidence({
    passages: [
      {
        words: args.words.map(wordEvidence),
        chars: args.chars ?? [],
        ...(args.vad === undefined ? {} : {
          speechActivity: args.vad.map((span) => ({
            startSample: Math.round(span.startSec * 16_000),
            endSampleExclusive: Math.round(span.endSec * 16_000),
          })),
        }),
      },
    ],
  });
}

function speechBasis(
  narrative: Narrative,
  durationSec = 2,
): AlignmentBasis {
  if (narrative.segments.length !== 1) throw new Error("Test alignment requires one Segment.");
  const programSpace = sealProgramSpace({ id: "test-space", durationSec,
    frameRate: { numerator: 1_000, denominator: 1 },
  });
  const audioDigest = fixtureResource(`fixture:audio:${narrative.segments.map((segment) => segment.id).join("+")}:${durationSec}`);
  return {
    programSpace,
    audio: { kind: "blob", resource: audioDigest, size: 1, mediaType: "audio/wav" },
    segments: [{
      segmentId: narrative.segments[0]!.id,
      startFrame: 0,
      endFrameExclusive: Math.round(durationSec * 1_000),
    }],
  };
}

function locate(
  narrative: Narrative,
  args: Omit<Parameters<typeof evidence>[0], "basis">,
) {
  const durationSec = args.durationSec ?? 2;
  const basis = speechBasis(narrative, durationSec);
  return locateAlignedSegmentTiming(narrative, basis, evidence({ ...args, basis }));
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
    startSample: Math.round(starts[index]! * 16_000),
    endSampleExclusive: Math.round(ends[index]! * 16_000),
    score: 0.95,
  }));
}

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
    map.tokens.map((token) => [token.startFrame, token.endFrameExclusive]),
    [
      [100, 400],
      [500, 900],
    ],
  );
  assert.equal(new Set(map.anchors.map((anchor) => anchor.identity)).size, map.anchors.length);
});

test("a measured Segment-local map becomes a self-contained SemanticTake", () => {
  const narrative = parseScript("materialize.svml", "<line>Hello world.</line>");
  const basis = speechBasis(narrative, 2);
  const map = locate(narrative, {
    words: [
      { text: "Hello", startSec: 0.1, endSec: 0.4 },
      { text: "world", startSec: 0.5, endSec: 0.9 },
    ],
  });
  const segment = narrative.segments[0]!;
  const take = materializeSemanticTake(
    narrative,
    { narrativeId: narrative.id, kind: "segment", id: segment.id, tokenStart: segment.tokenStart, tokenEndExclusive: segment.tokenEndExclusive },
    {
      timeline: { frameRate: { numerator: 1_000, denominator: 1 }, frameCount: 2_000 },
      visual: { artifact: { kind: "blob", resource: fixtureResource("materialize:video"), size: 1, mediaType: "video/mp4" }, width: 720, height: 1280 },
      audio: { artifact: { kind: "blob", resource: fixtureResource("materialize:audio"), size: 1, mediaType: "audio/wav" } },
    },
    map,
  );
  assert.deepEqual(take.tokens.map((token) => [token.text, token.startFrame, token.endFrameExclusive]), [
    ["Hello", 100, 400],
    ["world", 500, 900],
  ]);
  assert.equal(take.segment.startFrame, 0);
  assert.equal(take.segment.endFrameExclusive, 2_000);
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
    map.tokens.map((token) => [token.startFrame, token.endFrameExclusive]),
    [
      [100, 360],
      [420, 780],
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
    [map.tokens[0]?.startFrame, map.tokens[0]?.endFrameExclusive],
    [200, 820],
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
    map.tokens.map((token) => [token.startFrame, token.endFrameExclusive]),
    [
      [100, 200],
      [400, 620],
      [670, 820],
      [860, 960],
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
    [map.tokens[2]?.startFrame, map.tokens[2]?.endFrameExclusive],
    [400, 600],
  );
});

test("VAD bounds contain missing tokens when a Script Segment has no recognized words", () => {
  const narrative = parseScript("vad.svml", "<line>One two.</line>");
  const map = locate(narrative, {
    words: [],
    vad: [{ startSec: 0.4, endSec: 1.2 }],
  });

  assert.deepEqual(
    map.tokens.map((token) => [token.startFrame, token.endFrameExclusive]),
    [
      [400, 800],
      [800, 1_200],
    ],
  );
});

test("overlapping evidence word windows reach the map overlapping", () => {
  // Two spoken words whose measured windows overlap. Nothing here knows whether
  // that is a real overlap or a wobble, and no consumer of the map is bound to
  // treat it as either, so it is reported as measured.
  const narrative = parseScript("overlap.svml", "<line>one two</line>");
  const map = locate(narrative, {
    words: [
      { text: "one", startSec: 0.1, endSec: 0.5 },
      { text: "two", startSec: 0.4, endSec: 0.8 },
    ],
  });
  assert.deepEqual(map.tokens.map((token) => [token.startFrame, token.endFrameExclusive]), [[100, 500], [400, 800]]);
  assert.equal(map.tokens[1]!.startFrame < map.tokens[0]!.endFrameExclusive, true, "the overlap survived");
});

test("locating is total: every Script token carries a window", () => {
  const narrative = parseScript("total.svml", "<line>alpha beta gamma delta</line>");
  // Nothing the aligner could place: every window below is interpolated.
  const blind = locate(narrative, {
    words: [{ text: "alpha" }, { text: "beta" }, { text: "gamma" }, { text: "delta" }],
  });
  assert.equal(blind.tokens.length, narrative.tokens.length);
  assert.equal(blind.tokens.every((token) => Number.isSafeInteger(token.startFrame)
    && Number.isSafeInteger(token.endFrameExclusive)
    && token.endFrameExclusive > token.startFrame), true);

  // The speaker said something else entirely; the Script is still fully located.
  const diverged = locate(narrative, { words: [{ text: "zzz", startSec: 0.2, endSec: 0.8 }] });
  assert.equal(diverged.tokens.length, narrative.tokens.length);
  assert.equal(diverged.tokens.every((token) => token.endFrameExclusive > token.startFrame), true);
});

test("a collapsed WhisperX word is assigned the available interval between its neighbors", () => {
  const narrative = parseScript("collapsed.svml", "<line>well a lot</line>");
  const map = locate(narrative, {
    durationSec: 1,
    words: [
      { text: "well", startSec: 0.1, endSec: 0.4 },
      { text: "a", startSec: 0.43, endSec: 0.43 },
      { text: "lot", startSec: 0.5, endSec: 0.8 },
    ],
  });
  assert.deepEqual(map.tokens.map((token) => [token.startFrame, token.endFrameExclusive]), [
    [100, 400],
    [400, 500],
    [500, 800],
  ]);
});

test("three Script words may share the two video frames covered by one evidence word", () => {
  const narrative = parseScript("pigeonhole.svml", "<line>alpha beta gamma</line>");
  const original = speechBasis(narrative, 1);
  const programSpace = sealProgramSpace({ id: "test-space", durationSec: 1,
    frameRate: { numerator: 32, denominator: 1 },
  });
  const basis: AlignmentBasis = {
    ...original,
    programSpace,
    segments: [{ segmentId: "line", startFrame: 0, endFrameExclusive: 32 }],
  };
  const map = locateAlignedSegmentTiming(narrative, basis, evidence({
    basis,
    words: [{ text: "alphabetagamma", startSec: 10 / 32, endSec: 12 / 32 }],
  }));
  assert.deepEqual(map.tokens.map((token) => [token.startFrame, token.endFrameExclusive]), [
    [10, 11],
    [10, 12],
    [11, 12],
  ]);
});

test("Evidence is interpreted only through the explicitly connected alignment clock", () => {
  const narrative = parseScript("affinity.svml", "<line>Hello world.</line>");
  const basis = speechBasis(narrative, 2);
  const mismatched = evidence({
    basis,
    words: [{ text: "Hello", startSec: 0.1, endSec: 0.4 }, { text: "world", startSec: 0.5, endSec: 0.9 }],
  });
  const anotherSpace = sealProgramSpace({ id: "test-space", durationSec: 2,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const anotherBasis: AlignmentBasis = {
    ...basis,
    programSpace: anotherSpace,
    segments: [{ segmentId: "line", startFrame: 0, endFrameExclusive: 60 }],
  };
  const map = locateAlignedSegmentTiming(narrative, anotherBasis, mismatched);
  assert.equal(map.tokens[0]?.startFrame, 3);
});

test("the final map is quantized once into the selected ProgramSpace", () => {
  const narrative = parseScript("frames.svml", "<line>Hello.</line>");
  const original = speechBasis(narrative, 1);
  const programSpace = sealProgramSpace({ id: "test-space", durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const basis: AlignmentBasis = {
    ...original,
    programSpace,
    segments: [{ segmentId: "line", startFrame: 0, endFrameExclusive: 30 }],
  };
  const map = locateAlignedSegmentTiming(narrative, basis, evidence({
    basis,
    durationSec: 1,
    endSec: 1,
    words: [{ text: "Hello", startSec: 0.111, endSec: 0.289 }],
  }));
  assert.deepEqual(
    [map.tokens[0]?.startFrame, map.tokens[0]?.endFrameExclusive],
    [3, 9],
  );
  assert.equal(map.anchors.every((anchor) => Number.isSafeInteger(anchor.frame)), true);
});

test("a backwards character measurement is treated as missing token timing", () => {
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
  assert.equal(middle.endFrameExclusive > middle.startFrame, true);
});
