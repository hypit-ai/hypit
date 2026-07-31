import assert from "node:assert/strict";
import test from "node:test";
import type { AlignmentEvidence } from "../src/model.js";
import { locateScript } from "../src/script/locate.js";
import { estimateAlignment } from "../src/script/estimate.js";
import { parseScript } from "../src/script/parse.js";
import { formatDocumentScript } from "../src/format.js";
import { parseDocumentSource } from "../src/source/parse-document.js";

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
  assert.equal(narrative.selections.whole?.length, 1);
  assert.equal(narrative.selections.laugh?.length, 1);
  assert.equal(narrative.selections.punch?.length, 1);
  assert.equal(narrative.moments.pop?.length, 1);
  assert.deepEqual(
    narrative.captionAtoms.map((atom) => [
      atom.display,
      atom.startWord,
      atom.endWordExclusive,
    ]),
    [["lmao", 2, 6]],
  );
});

test("Dual Text owns its complete speech span and caption cues cannot split it", () => {
  const narrative = parseScript(
    "fixture.svml",
    `<segment id="one">I just <lmao | laughed my ass out>.</segment>`,
  );
  const evidence: AlignmentEvidence = {
    contract: "svml.speech-alignment.v1",
    durationSec: 2,
    fps: 30,
    words: [
      { text: "I", startSec: 0, endSec: 0.1, segmentId: "one" },
      { text: "just", startSec: 0.2, endSec: 0.4, segmentId: "one" },
      { text: "laughed", startSec: 0.5, endSec: 0.8, segmentId: "one" },
      { text: "my", startSec: 0.9, endSec: 1, segmentId: "one" },
      { text: "ass", startSec: 1.1, endSec: 1.3, segmentId: "one" },
      { text: "out", startSec: 1.4, endSec: 1.7, segmentId: "one" },
    ],
    segments: [{ id: "one", startSec: 0, endSec: 2 }],
  };
  const located = locateScript(narrative, evidence);
  assert.deepEqual(
    located.captionAtoms.map((atom) => [
      atom.display,
      atom.startFrame,
      atom.endFrameExclusive,
    ]),
    [["lmao", 15, 51]],
  );
  assert.throws(
    () => locateScript(narrative, {
      ...evidence,
      captionCues: [
        { startWord: 0, endWordExclusive: 4 },
        { startWord: 4, endWordExclusive: 6 },
      ],
    }),
    /locate_caption_partial_dual/u,
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

test("caption cue evidence is a complete ordered word partition", () => {
  const narrative = parseScript(
    "fixture.svml",
    `<segment id="one">Alpha beta gamma.</segment>`,
  );
  const evidence: AlignmentEvidence = {
    contract: "svml.speech-alignment.v1",
    durationSec: 1.5,
    fps: 30,
    words: [
      { text: "Alpha", startSec: 0, endSec: 0.4, segmentId: "one" },
      { text: "beta", startSec: 0.5, endSec: 0.9, segmentId: "one" },
      { text: "gamma", startSec: 1, endSec: 1.4, segmentId: "one" },
    ],
    segments: [{ id: "one", startSec: 0, endSec: 1.5 }],
    captionCues: [
      { id: "opening", startWord: 0, endWordExclusive: 1 },
      { id: "payoff", startWord: 1, endWordExclusive: 3 },
    ],
  };
  const located = locateScript(narrative, evidence);
  assert.deepEqual(
    located.captionCues?.map((cue) => [
      cue.id,
      cue.startWord,
      cue.endWordExclusive,
      cue.startFrame,
      cue.endFrameExclusive,
    ]),
    [
      ["opening", 0, 1, 0, 12],
      ["payoff", 1, 3, 15, 42],
    ],
  );

  assert.throws(
    () => locateScript(narrative, {
      ...evidence,
      captionCues: [{ startWord: 1, endWordExclusive: 3 }],
    }),
    /locate_caption_cue_partition/u,
  );

  assert.throws(
    () => locateScript(narrative, {
      ...evidence,
      words: evidence.words.map((word, index) =>
        index === 1 ? { ...word, startSec: 0.2 } : word),
    }),
    /locate_alignment_word_overlap/u,
  );
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

test("syllable Estimate produces complete deterministic alignment including silence", () => {
  const narrative = parseScript("fixture.svml", `
    <segment id="speech">Hello 中文.</segment>
    <segment id="silence"/>
  `);
  const first = estimateAlignment(narrative, {
    fps: 30,
    syllablesPerSecond: 4,
    emptySegmentSec: 2,
    maxCaptionWords: 2,
  });
  const second = estimateAlignment(narrative, {
    fps: 30,
    syllablesPerSecond: 4,
    emptySegmentSec: 2,
    maxCaptionWords: 2,
  });
  assert.deepEqual(first, second);
  assert.deepEqual(first.words.map((word) => word.text), ["Hello", "中", "文"]);
  assert.equal(first.segments[1]?.endSec! - first.segments[1]?.startSec!, 2);
  assert.deepEqual(
    first.captionCues?.map((cue) => [cue.startWord, cue.endWordExclusive]),
    [[0, 2], [2, 3]],
  );
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
