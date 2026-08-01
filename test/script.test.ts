import assert from "node:assert/strict";
import test from "node:test";
import type { NarrativeIR, SpeechTimingEvidence } from "../src/model.js";
import { locateScript } from "../src/script/locate.js";
import { estimateSpeechTiming } from "../src/script/estimate.js";
import { parseScript } from "../src/script/parse.js";
import { formatDocumentScript } from "../src/format.js";
import { parseDocumentSource } from "../src/source/parse-document.js";
import {
  createProgramBasis,
  semanticMapFromTiming,
  validateSemanticMap,
} from "../src/temporal.js";
import { sha256, stableJson } from "../src/util.js";

function locateTiming(narrative: NarrativeIR, evidence: SpeechTimingEvidence) {
  const basis = createProgramBasis({
    fps: evidence.fps,
    durationFrames: Math.round(evidence.durationSec * evidence.fps),
    outcomeDigest: sha256(stableJson(evidence)),
  });
  const map = semanticMapFromTiming(narrative, basis, evidence);
  assert.equal(map.contract, "svml.complete-semantic-map.v1");
  return locateScript(narrative, basis, map);
}

test("Script Surface projects role, dual text, selections and moments", () => {
  const narrative = parseScript("fixture.svml", `
    @whole
    <segment id="one">
      <A> I just @laugh @pop! <lmao | laughed my @punch ass out @/punch> @/laugh.
    </segment>
    @/whole~
  `);
  assert.equal(narrative.projections.dialogue, "A: I just laughed my ass out.");
  assert.equal(narrative.projections.speech, "I just laughed my ass out.");
  assert.equal(narrative.projections.caption, "I just lmao.");
  assert.deepEqual(narrative.turns.map((turn) => [turn.role, turn.tokenStart, turn.tokenEndExclusive]), [
    ["A", 0, 6],
  ]);
  assert.equal(narrative.selections.whole?.length, 1);
  assert.equal(narrative.selections.laugh?.length, 1);
  assert.equal(narrative.selections.punch?.length, 1);
  assert.equal(narrative.moments.pop?.length, 1);
  assert.deepEqual(
    narrative.captionAtoms.map((atom) => [
      atom.display,
      atom.startToken,
      atom.endTokenExclusive,
    ]),
    [["lmao", 2, 6]],
  );
});

test("Script v1 builds independent 2M + 2N anchor identities", () => {
  const narrative = parseScript("fixture.svml", `
    <segment id="a">Alpha beta.</segment>
    <segment id="b"/>
    <segment id="c">Gamma.</segment>
  `);
  assert.equal(narrative.tokens.length, 3);
  assert.equal(narrative.segments.length, 3);
  assert.equal(narrative.semanticIndex.anchors.length, 2 * 3 + 2 * 3);
  assert.deepEqual(
    narrative.semanticIndex.anchors.map((anchor) => anchor.id),
    [
      "segment:a:start",
      "segment:a:token:1:start",
      "segment:a:token:1:end",
      "segment:a:token:2:start",
      "segment:a:token:2:end",
      "segment:a:end",
      "segment:b:start",
      "segment:b:end",
      "segment:c:start",
      "segment:c:token:1:start",
      "segment:c:token:1:end",
      "segment:c:end",
    ],
  );
  assert.notEqual(
    narrative.segments[0]?.endAnchorId,
    narrative.segments[1]?.startAnchorId,
  );
  assert.match(narrative.semanticIndex.digest, /^[a-f0-9]{64}$/u);
});

test("overlapping Segments retain distinct boundary affinity on one ProgramBasis", () => {
  const narrative = parseScript("fixture.svml", `
    <segment id="a">Alpha.</segment>
    ~@left! @right!
    <segment id="b">Beta.</segment>
  `);
  const evidence: SpeechTimingEvidence = {
    contract: "svml.speech-timing-evidence.v1",
    durationSec: 8,
    fps: 30,
    quality: "measured",
    units: [
      { text: "Alpha", startSec: 0.2, endSec: 4.8, segmentId: "a" },
      { text: "Beta", startSec: 4.6, endSec: 7.8, segmentId: "b" },
    ],
    segments: [
      { id: "a", startSec: 0, endSec: 5 },
      { id: "b", startSec: 4.5, endSec: 8 },
    ],
  };
  const located = locateTiming(narrative, evidence);
  assert.deepEqual(located.moments.left?.frames, [150]);
  assert.deepEqual(located.moments.right?.frames, [135]);
  assert.equal(located.segments.a?.endFrameExclusive, 150);
  assert.equal(located.segments.b?.startFrame, 135);
});

test("SemanticMap rejects source-order reversal, wrong basis and digest tampering", () => {
  const narrative = parseScript(
    "fixture.svml",
    `<segment id="a">Alpha.</segment><segment id="b">Beta.</segment>`,
  );
  const evidence: SpeechTimingEvidence = {
    contract: "svml.speech-timing-evidence.v1",
    durationSec: 5,
    fps: 30,
    quality: "measured",
    units: [
      { text: "Alpha", startSec: 1.1, endSec: 1.8, segmentId: "a" },
      { text: "Beta", startSec: 0.2, endSec: 0.8, segmentId: "b" },
    ],
    segments: [
      { id: "a", startSec: 1, endSec: 2 },
      { id: "b", startSec: 0, endSec: 1 },
    ],
  };
  const basis = createProgramBasis({
    fps: 30,
    durationFrames: 150,
    outcomeDigest: sha256("reordered"),
  });
  assert.throws(
    () => semanticMapFromTiming(narrative, basis, evidence),
    /locator_segment_order/u,
  );

  const validEvidence: SpeechTimingEvidence = {
    ...evidence,
    units: [
      { text: "Alpha", startSec: 0.1, endSec: 0.8, segmentId: "a" },
      { text: "Beta", startSec: 1.1, endSec: 1.8, segmentId: "b" },
    ],
    segments: [
      { id: "a", startSec: 0, endSec: 1 },
      { id: "b", startSec: 1, endSec: 2 },
    ],
  };
  const validMap = semanticMapFromTiming(
    narrative,
    basis,
    validEvidence,
  );
  assert.throws(
    () => validateSemanticMap(narrative, basis, {
      ...validMap,
      anchors: validMap.anchors.map((anchor, index) => index === 0
        ? { ...anchor, point: { ...anchor.point, frame: anchor.point.frame + 1 } }
        : anchor),
    }),
    /semantic_map_digest/u,
  );
  const otherBasis = createProgramBasis({
    fps: 30,
    durationFrames: 150,
    outcomeDigest: sha256("other"),
  });
  assert.throws(
    () => validateSemanticMap(narrative, otherBasis, validMap),
    /semantic_map_basis/u,
  );
});

test("Dual Text owns its complete speech span without entering SemanticMap", () => {
  const narrative = parseScript(
    "fixture.svml",
    `<segment id="one">I just <lmao | laughed my ass out>.</segment>`,
  );
  const evidence: SpeechTimingEvidence = {
    contract: "svml.speech-timing-evidence.v1",
    durationSec: 2,
    fps: 30,
    quality: "measured",
    units: [
      { text: "I", startSec: 0, endSec: 0.1, segmentId: "one" },
      { text: "just", startSec: 0.2, endSec: 0.4, segmentId: "one" },
      { text: "laughed", startSec: 0.5, endSec: 0.8, segmentId: "one" },
      { text: "my", startSec: 0.9, endSec: 1, segmentId: "one" },
      { text: "ass", startSec: 1.1, endSec: 1.3, segmentId: "one" },
      { text: "out", startSec: 1.4, endSec: 1.7, segmentId: "one" },
    ],
    segments: [{ id: "one", startSec: 0, endSec: 2 }],
  };
  const located = locateTiming(narrative, evidence);
  assert.deepEqual(
    located.captionAtoms.map((atom) => [
      atom.display,
      atom.startFrame,
      atom.endFrameExclusive,
    ]),
    [["lmao", 15, 51]],
  );
});

test("Slots bind after parsing and escaped reserved syntax stays literal", () => {
  const narrative = parseScript(
    "fixture.svml",
    "<segment id=\"one\">Meet <${display} | ${spoken}> at \\@openai and \\<tag>. ${literal}</segment>",
    0,
    {
      display: "Hypit",
      spoken: "high pit",
      literal: "@/not-a-marker",
    },
  );
  assert.equal(narrative.projections.speech, "Meet high pit at @openai and <tag>. @/not-a-marker");
  assert.equal(narrative.projections.caption, "Meet Hypit at @openai and <tag>. @/not-a-marker");
  assert.equal(Object.keys(narrative.selections).length, 0);
  assert.throws(
    () => parseScript("fixture.svml", '<segment id="one">${missing}</segment>'),
    /script_slot_unbound/u,
  );
});

test("Selection and Moment names cannot conflict or reopen", () => {
  assert.throws(
    () => parseScript("fixture.svml", '<segment id="one">@x! one @x two @/x.</segment>'),
    /script_temporal_type_conflict/u,
  );
  assert.throws(
    () => parseScript("fixture.svml", '<segment id="one">@x one @x two @/x @/x.</segment>'),
    /script_selection_reopened/u,
  );
});

test("the same Selection id may produce a disconnected set", () => {
  const narrative = parseScript("fixture.svml", `
    <segment id="one">
      @pick Alpha @/pick then @pick omega @/pick.
    </segment>
  `);
  assert.equal(narrative.selections.pick?.length, 2);
});

test("selection endpoints must close", () => {
  assert.throws(
    () => parseScript("fixture.svml", `<segment id="one">@x hello.</segment>`),
    /script_selection_unclosed/u,
  );
});

test("direct Script-to-timing alignment handles N:1, 1:N, extras and missing units", () => {
  const narrative = parseScript(
    "fixture.svml",
    `<segment id="one">We really love hyper frames cannot now.</segment>`,
  );
  const evidence: SpeechTimingEvidence = {
    contract: "svml.speech-timing-evidence.v1",
    durationSec: 2.4,
    fps: 30,
    quality: "measured",
    units: [
      { text: "We", startSec: 0.1, endSec: 0.2, segmentId: "one" },
      { text: "reallylovehyper", startSec: 0.4, endSec: 0.9, segmentId: "one" },
      { text: "frames", startSec: 1, endSec: 1.3, segmentId: "one" },
      { text: "can", startSec: 1.4, endSec: 1.55, segmentId: "one" },
      { text: "not", startSec: 1.56, endSec: 1.8, segmentId: "one" },
      { text: "um", startSec: 1.81, endSec: 1.85, segmentId: "one" },
      { text: "now", startSec: 1.9, endSec: 2.1, segmentId: "one" },
    ],
    segments: [{ id: "one", startSec: 0, endSec: 2.4 }],
  };
  const basis = createProgramBasis({
    fps: evidence.fps,
    durationFrames: Math.round(evidence.durationSec * evidence.fps),
    outcomeDigest: sha256(stableJson(evidence)),
  });
  const map = semanticMapFromTiming(narrative, basis, evidence);
  const located = locateScript(narrative, basis, map);
  assert.deepEqual(located.words.map((word) => word.text),
    ["We", "really", "love", "hyper", "frames", "cannot", "now"]);
  assert.deepEqual(
    map.anchors.filter((anchor) => anchor.identity.includes(":token:") && anchor.identity.endsWith(":start"))
      .map((anchor) => anchor.quality),
    ["measured", "derived", "derived", "derived", "measured", "derived", "measured"],
  );
  assert.deepEqual(
    [located.words[1]?.startFrame, located.words[3]?.endFrameExclusive],
    [12, 27],
  );

  const missing = locateTiming(narrative, {
    ...evidence,
    units: [evidence.units[0]!, evidence.units[2]!, evidence.units.at(-1)!],
  });
  assert.equal(missing.words[1]?.startFrame, 6);
  assert.equal(missing.words[3]?.endFrameExclusive, 30);
});

test("Script normalizes newlines and NFC while tokenizing East Asian writing per character", () => {
  const narrative = parseScript(
    "fixture.svml",
    "<segment id=\"one\">Cafe\u0301\r\n中文かなカナ words.</segment>",
  );
  assert.equal(narrative.projections.speech, "Café 中文かなカナ words.");
  assert.deepEqual(
    narrative.tokens.map((token) => token.text),
    ["Café", "中", "文", "か", "な", "カ", "ナ", "words"],
  );
});

test("reserved @ syntax and non-canonical ids fail closed", () => {
  assert.throws(
    () => parseScript("fixture.svml", '<segment id="one">mail@example.com</segment>'),
    /script_(?:invalid_marker|selection_unclosed)/u,
  );
  assert.throws(
    () => parseScript("fixture.svml", '<segment id="One">Hello.</segment>'),
    /script_invalid_segment_id/u,
  );
  assert.throws(
    () => parseScript("fixture.svml", '<segment id="one">@NotCanonical! Hello.</segment>'),
    /script_invalid_marker/u,
  );
});

test("syllable Estimate produces deterministic SpeechTimingEvidence including silence", () => {
  const narrative = parseScript("fixture.svml", `
    <segment id="speech">Hello 中文.</segment>
    <segment id="silence"/>
  `);
  const first = estimateSpeechTiming(narrative, {
    fps: 30,
    syllablesPerSecond: 4,
    emptySegmentSec: 2,
  });
  const second = estimateSpeechTiming(narrative, {
    fps: 30,
    syllablesPerSecond: 4,
    emptySegmentSec: 2,
  });
  assert.deepEqual(first, second);
  assert.deepEqual(first.units.map((unit) => unit.text), ["Hello", "中", "文"]);
  assert.equal(first.segments[1]?.endSec! - first.segments[1]?.startSec!, 2);
  assert.equal(first.quality, "estimated");
  assert.equal(first.provenance?.method, "svml.syllable-estimate.v1");
});

test("canonical Script formatter is semantic-preserving and idempotent", () => {
  const source = `<svml version="1">
  <script>
       @whole
       <segment id="one">
          <A>  Hello @pop! <world | wonderful world>.
       </segment>
       @/whole~
  </script>
  <text id="unused">value</text>
</svml>
`;
  const document = parseDocumentSource("fixture.svml", source);
  const narrative = parseScript(
    document.file,
    document.scriptSource,
    document.scriptOffset,
  );
  const formatted = formatDocumentScript(document, narrative, {});
  assert.match(formatted, /\n    @whole\n\n    <segment id="one">\n      <A>/u);
  const secondDocument = parseDocumentSource("fixture.svml", formatted);
  const secondNarrative = parseScript(
    secondDocument.file,
    secondDocument.scriptSource,
    secondDocument.scriptOffset,
  );
  assert.equal(formatDocumentScript(secondDocument, secondNarrative, {}), formatted);
});
