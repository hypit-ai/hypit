import type { Narrative, NarrativeToken } from "@hypit/narrative";
import { timedTranscript } from "@hypit/timed-transcript";
import type { TimedTranscript } from "@hypit/timed-transcript";
import assert from "node:assert/strict";
import test from "node:test";

import {
  narrativeValue,
  parseScript as parseScriptSource,
  scriptSegmentSpeech,
} from "@hypit/script";
import {
  SpeechAlignmentError,
  alignWordGroups,
  correctTimedTranscript,
  materializeNarrativeAlignment,
} from "@hypit/narrative-speech-alignment";
import { locateAlignedSegmentTiming } from "../src/locate.js";
import type { AlignmentBasis } from "../src/locate.js";
import { exactTemporalValue } from "@hypit/temporal";

type WordFixture = {
  readonly text: string;
  readonly startSec?: number;
  readonly endSec?: number;
};

function parseScript(sourceName: string, source: string): Narrative {
  return narrativeValue(parseScriptSource(sourceName, source), "test-narrative");
}

function alignmentWord(word: WordFixture): { readonly text: string } {
  return { text: word.text };
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
    words.map(alignmentWord),
  ).map((group) => group.relation);
}

function evidence(args: {
  readonly durationSec?: number;
  readonly words: readonly WordFixture[];
}): TimedTranscript {
  const timed = args.words.map(({ text, startSec, endSec }) => ({
    word: text,
    ...(startSec === undefined || endSec === undefined ? {} : { start: startSec, end: endSec }),
  }));
  const starts = args.words.flatMap((word) => word.startSec === undefined ? [] : [word.startSec]);
  const ends = args.words.flatMap((word) => word.endSec === undefined ? [] : [word.endSec]);
  return timedTranscript("en", [{
    start: starts.length === 0 ? 0 : Math.min(...starts),
    end: ends.length === 0 ? (args.durationSec ?? 2) : Math.max(...ends),
    text: args.words.map((word) => word.text).join(" "),
    words: timed,
  }]);
}

function speechBasis(
  narrative: Narrative,
  durationSec = 2,
): AlignmentBasis {
  if (narrative.segments.length !== 1) throw new Error("Test alignment requires one Segment.");
  return {
    timeBase: { numerator: 1, denominator: 1_000 },
    unitCount: Math.round(durationSec * 1_000),
    segments: [{
      segmentId: narrative.segments[0]!.id,
      startUnit: 0,
      endUnitExclusive: Math.round(durationSec * 1_000),
    }],
  };
}

function locate(
  narrative: Narrative,
  args: Parameters<typeof evidence>[0],
) {
  const durationSec = args.durationSec ?? 2;
  const basis = speechBasis(narrative, durationSec);
  return locateAlignedSegmentTiming(narrative, basis, evidence(args));
}

test("exact transcript words cover every Script and Segment anchor", () => {
  const narrative = parseScript("exact.svml", "<line>Hello world.</line>");
  const map = locate(narrative, {
    words: [
      { text: "Hello", startSec: 0.1, endSec: 0.4 },
      { text: "world", startSec: 0.5, endSec: 0.9 },
    ],
  });

  assert.equal(map.tokens.length, 2);
  assert.equal(map.boundaries.length, 2 * narrative.tokens.length + 2 * narrative.segments.length);
  assert.deepEqual(
    map.tokens.map((token) => [token.startUnit, token.endUnitExclusive]),
    [
      [100, 400],
      [500, 900],
    ],
  );
  assert.equal(new Set(map.boundaries.map((boundary) => boundary.id)).size, map.boundaries.length);
});

test("a long exact transcript retains the same one-to-one semantic path", () => {
  const count = 800;
  const source: NarrativeToken[] = Array.from({ length: count }, (_, index) => ({
    id: `token-${index}`,
    segmentId: "long-line",
    startAnchorId: `token-${index}:start`,
    endAnchorId: `token-${index}:end`,
    text: `word${index}`,
    normalized: `word${index}`,
  }));
  const spoken = source.map((token) => ({ text: token.text }));
  const groups = alignWordGroups("long-line", source, spoken);
  assert.equal(groups.length, count);
  assert.equal(groups.every((group, index) => group.relation === "exact"
    && group.sourceTokenIds[0] === `token-${index}`
    && group.evidenceWordStart === index
    && group.evidenceWordEndExclusive === index + 1), true);
});

test("a measured Segment-local map becomes a media-free NarrativeAlignment", () => {
  const narrative = parseScript("materialize.svml", "<line>Hello world.</line>");
  const map = locate(narrative, {
    words: [
      { text: "Hello", startSec: 0.1, endSec: 0.4 },
      { text: "world", startSec: 0.5, endSec: 0.9 },
    ],
  });
  const segment = narrative.segments[0]!;
  const alignment = materializeNarrativeAlignment(
    narrative,
    { narrativeId: narrative.id, kind: "segment", id: segment.id, tokenStart: segment.tokenStart, tokenEndExclusive: segment.tokenEndExclusive },
    { id: "speech-domain", duration: exactTemporalValue({ numerator: 2n, denominator: 1n }) },
    map,
  );
  assert.deepEqual(alignment.tokens.map((token) => [token.text, token.startBoundaryId, token.endBoundaryId]),
    narrative.tokens.map((token) => [token.text, token.startAnchorId, token.endAnchorId]));
  assert.deepEqual(alignment.boundaries.find((boundary) => boundary.id === segment.startAnchorId)?.at,
    { ticks: "0", timeBase: { numerator: 1, denominator: 1 } });
  assert.deepEqual(alignment.boundaries.find((boundary) => boundary.id === segment.endAnchorId)?.at,
    { ticks: "2", timeBase: { numerator: 1, denominator: 1 } });
  assert.equal("media" in alignment, false);
});

test("M:1 distributes one measured word window by authored token length", () => {
  const narrative = parseScript("merge.svml", "<line>can not</line>");
  const merged = [{ text: "cannot", startSec: 0.1, endSec: 0.78 }];
  const map = locate(narrative, {
    durationSec: 1,
    words: merged,
  });

  assert.deepEqual(relations(narrative, merged), ["merge"]);
  assert.deepEqual(
    map.tokens.map((token) => [token.startUnit, token.endUnitExclusive]),
    [
      [100, 440],
      [440, 780],
    ],
  );
});

test("M:N correction returns the same TimedTranscript shape with authored words", () => {
  const narrative = parseScript("correct.svml", "<line>can not wait</line>");
  const segment = narrative.segments[0]!;
  const detected = evidence({ durationSec: 1, words: [
    { text: "cannot", startSec: 0.1, endSec: 0.5 },
    { text: "weight", startSec: 0.6, endSec: 0.9 },
  ] });
  const corrected = correctTimedTranscript(narrative, {
    narrativeId: narrative.id,
    kind: "segment",
    id: segment.id,
    tokenStart: segment.tokenStart,
    tokenEndExclusive: segment.tokenEndExclusive,
  }, { id: "speech", duration: exactTemporalValue({ numerator: 1n, denominator: 1n }) }, detected);
  assert.equal(corrected.language, detected.language);
  assert.deepEqual(corrected.word_segments.map((word) => word.word), ["can", "not", "wait"]);
  assert.deepEqual(corrected.word_segments, corrected.segments.flatMap((item) => item.words));
  assert.equal("score" in corrected.word_segments[0]!, false);
});

test("transcript correction can preserve the accepted Script punctuation and language spacing", () => {
  const parsed = parseScriptSource("correct-zh.script", "<line>你好，世界！</line>");
  const narrative = narrativeValue(parsed, "test-narrative");
  const segment = narrative.segments[0]!;
  const detected = evidence({ durationSec: 1, words: [
    { text: "你", startSec: 0.1, endSec: 0.2 },
    { text: "好", startSec: 0.2, endSec: 0.3 },
    { text: "世", startSec: 0.4, endSec: 0.5 },
    { text: "界", startSec: 0.5, endSec: 0.6 },
  ] });
  const corrected = correctTimedTranscript(narrative, {
    narrativeId: narrative.id,
    kind: "segment",
    id: segment.id,
    tokenStart: segment.tokenStart,
    tokenEndExclusive: segment.tokenEndExclusive,
  }, { id: "speech", duration: exactTemporalValue({ numerator: 1n, denominator: 1n }) }, detected, {
    segmentText: scriptSegmentSpeech(parsed, "line"),
  });
  assert.equal(corrected.segments[0]!.text, "你好，世界！");
  assert.deepEqual(corrected.word_segments.map((word) => word.word), ["你", "好", "世", "界"]);
});

test("1:N wraps all evidence words in one Script token", () => {
  const narrative = parseScript("split.svml", "<line>website</line>");
  const split = [
    { text: "web", startSec: 0.2, endSec: 0.45 },
    { text: "site", startSec: 0.5, endSec: 0.82 },
  ];
  const map = locate(narrative, { words: split });

  assert.deepEqual(relations(narrative, split), ["split"]);
  assert.deepEqual(
    [map.tokens[0]?.startUnit, map.tokens[0]?.endUnitExclusive],
    [200, 820],
  );
});

test("a recognized filler stays an insertion and does not absorb neighboring Script words", () => {
  const narrative = parseScript("insertion.svml", "<line>I really like it.</line>");
  const spoken = [
    { text: "I", startSec: 0.1, endSec: 0.2 },
    { text: "uh", startSec: 0.24, endSec: 0.34 },
    { text: "really", startSec: 0.4, endSec: 0.62 },
    { text: "like", startSec: 0.67, endSec: 0.82 },
    { text: "it", startSec: 0.86, endSec: 0.96 },
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
    map.tokens.map((token) => [token.startUnit, token.endUnitExclusive]),
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
    { text: "This", startSec: 0.1, endSec: 0.25 },
    { text: "is", startSec: 0.3, endSec: 0.4 },
    { text: "good", startSec: 0.6, endSec: 0.82 },
  ];
  const map = locate(narrative, { words: spoken });

  assert.deepEqual(relations(narrative, spoken), [
    "exact",
    "exact",
    "source-omission",
    "exact",
  ]);
  assert.deepEqual(
    [map.tokens[2]?.startUnit, map.tokens[2]?.endUnitExclusive],
    [400, 600],
  );
});

test("the media-local domain contains tokens when no words were recognized", () => {
  const narrative = parseScript("empty.svml", "<line>One two.</line>");
  const map = locate(narrative, {
    words: [],
  });

  assert.deepEqual(
    map.tokens.map((token) => [token.startUnit, token.endUnitExclusive]),
    [
      [0, 1_000],
      [1_000, 2_000],
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
  assert.deepEqual(map.tokens.map((token) => [token.startUnit, token.endUnitExclusive]), [[100, 500], [400, 800]]);
  assert.equal(map.tokens[1]!.startUnit < map.tokens[0]!.endUnitExclusive, true, "the overlap survived");
});

test("nested and untimed evidence still projects monotone Script boundaries", () => {
  const cases = [
    ["<line>one 2 three</line>", [
      { text: "one", startSec: 0.1, endSec: 0.5 },
      { text: "2" },
      { text: "three", startSec: 0.4, endSec: 0.9 },
    ]],
    ["<line>one two</line>", [
      { text: "one", startSec: 0.1, endSec: 0.8 },
      { text: "two", startSec: 0.3, endSec: 0.5 },
    ]],
  ] as const;
  for (const [source, words] of cases) {
    const narrative = parseScript("monotone.svml", source);
    const map = locate(narrative, { words });
    for (const [index, token] of map.tokens.entries()) {
      const previous = map.tokens[index - 1];
      assert.ok(token.endUnitExclusive > token.startUnit, source);
      if (previous !== undefined) {
        assert.ok(token.startUnit >= previous.startUnit, source);
        assert.ok(token.endUnitExclusive >= previous.endUnitExclusive, source);
      }
    }
  }
});

test("locating is total: every Script token carries a window", () => {
  const narrative = parseScript("total.svml", "<line>alpha beta gamma delta</line>");
  // Nothing the aligner could place: every window below is interpolated.
  const blind = locate(narrative, {
    words: [{ text: "alpha" }, { text: "beta" }, { text: "gamma" }, { text: "delta" }],
  });
  assert.equal(blind.tokens.length, narrative.tokens.length);
  assert.equal(blind.tokens.every((token) => Number.isSafeInteger(token.startUnit)
    && Number.isSafeInteger(token.endUnitExclusive)
    && token.endUnitExclusive > token.startUnit), true);

  // The speaker said something else entirely; the Script is still fully located.
  const diverged = locate(narrative, { words: [{ text: "zzz", startSec: 0.2, endSec: 0.8 }] });
  assert.equal(diverged.tokens.length, narrative.tokens.length);
  assert.equal(diverged.tokens.every((token) => token.endUnitExclusive > token.startUnit), true);
});

test("three Script words may share the two alignment units covered by one evidence word", () => {
  const narrative = parseScript("pigeonhole.svml", "<line>alpha beta gamma</line>");
  const original = speechBasis(narrative, 1);
  const basis: AlignmentBasis = {
    ...original,
    timeBase: { numerator: 1, denominator: 32 },
    unitCount: 32,
    segments: [{ segmentId: "line", startUnit: 0, endUnitExclusive: 32 }],
  };
  const map = locateAlignedSegmentTiming(narrative, basis, evidence({
    words: [{ text: "alphabetagamma", startSec: 10 / 32, endSec: 12 / 32 }],
  }));
  assert.deepEqual(map.tokens.map((token) => [token.startUnit, token.endUnitExclusive]), [
    [10, 11],
    [11, 12],
    [11, 12],
  ]);
});

test("Transcript time must stay inside the private alignment grid", () => {
  const narrative = parseScript("affinity.svml", "<line>Hello world.</line>");
  const basis = speechBasis(narrative, 2);
  const outside = evidence({ words: [{ text: "Hello", startSec: 0.1, endSec: 2.1 }] });
  assert.throws(() => locateAlignedSegmentTiming(narrative, basis, outside), /outside the alignment domain/u);
});

test("the private alignment grid converts transcript seconds once", () => {
  const narrative = parseScript("grid.svml", "<line>Hello.</line>");
  const original = speechBasis(narrative, 1);
  const basis: AlignmentBasis = {
    ...original,
    timeBase: { numerator: 1, denominator: 30 },
    unitCount: 30,
    segments: [{ segmentId: "line", startUnit: 0, endUnitExclusive: 30 }],
  };
  const map = locateAlignedSegmentTiming(narrative, basis, evidence({
    durationSec: 1,
    words: [{ text: "Hello", startSec: 0.111, endSec: 0.289 }],
  }));
  assert.deepEqual(
    [map.tokens[0]?.startUnit, map.tokens[0]?.endUnitExclusive],
    [3, 9],
  );
  assert.equal(map.boundaries.every((boundary) => Number.isSafeInteger(boundary.unit)), true);
});

test("exact segmentation differences have no word-count ceiling", () => {
  const name = "ElevenLabs";
  const split = parseScript("letters.svml", `<line>用${name}做视频</line>`);
  const letters = [...`用${name}做视频`].map((text, index) => ({
    text, startSec: (100 + index * 200) / 1000, endSec: (200 + index * 200) / 1000,
  }));
  const map = locate(split, { words: letters, durationSec: 4 });
  assert.deepEqual(map.tokens.slice(0, 3).map((token, index) => [split.tokens[index]!.text, token.startUnit, token.endUnitExclusive]),
    [["用", 100, 200], [name, 300, 2200], ["做", 2300, 2400]]);

  const merged = parseScript("merged-zh.svml", "<line>这是非常自然的节奏</line>");
  const text = "这是非常自然的节奏";
  const mergedMap = locate(merged, { words: [{ text, startSec: 0.1, endSec: 1.28 }], durationSec: 3 });
  assert.equal(mergedMap.tokens[0]?.startUnit, 100);
  assert.equal(mergedMap.tokens.at(-1)?.endUnitExclusive, 1_280);
});
