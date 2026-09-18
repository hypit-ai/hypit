import assert from "node:assert/strict";
import test from "node:test";
import type { Narrative } from "@hypit/narrative";
import { captionDocument, narrativeValue, parseScript } from "@hypit/script";
import { alignSemanticTake } from "../../speech-alignment/src/index.js";
import { interpretWhisperXTranscript } from "../../whisperx/src/index.js";
import { appendTimelineAuthorTake, assembleTimelineAuthor, createTimelineAuthorSet, sealTimelineAuthorHeader } from "../../timeline-author/src/index.js";
import { temporalizeCaptionDocument } from "../src/index.js";
import { fixtureResource } from "../../../test/fixture-resource.js";

/**
 * Two Cues owning one frame is not a cosmetic defect: a renderer that draws Cues at a single
 * position draws both of them there, and the frame reads as garbled text. It cannot be resolved
 * downstream either, because a Fine Caption envelope must cover its own semantic span.
 */
test("Consecutive Cues never claim the same frame when Word windows touch", () => {
  const parsed = parseScript("touching-zh.svml", "<opening><HOST>用它洗，|| 真方便。</opening>");
  const narrative = narrativeValue(parsed, "story") as unknown as Narrative;
  const document = captionDocument(parsed, "story.caption", "story");
  const segment = narrative.segments[0]!;
  // An aligner reports each word ending exactly where the next one begins. This is the ordinary
  // shape of zh output, not a degenerate fixture: every adjacent pair of a real 88s take did it.
  // The rate has to be a real one — at 1000 fps every millisecond boundary is also a frame
  // boundary, and the overlap this test exists for cannot occur.
  const frameRate = { numerator: 30, denominator: 1 } as const;
  const step = 0.155;
  const durationSec = 0.1 + step * 6;
  const words = [..."用它洗真方便"].map((word, index) => ({
    word, start: 0.1 + index * step, end: 0.1 + (index + 1) * step,
  }));
  const take = alignSemanticTake(narrative, {
    narrativeId: narrative.id, kind: "segment", id: segment.id,
    tokenStart: segment.tokenStart, tokenEndExclusive: segment.tokenEndExclusive,
  }, {
    timeline: { frameRate, frameCount: Math.ceil(durationSec * 30) },
    audio: { artifact: { kind: "blob", resource: fixtureResource("zh:touching"), size: 1, mediaType: "audio/wav" } },
  }, {
    passages: interpretWhisperXTranscript(
      { language: "zh", segments: [{ start: 0, end: durationSec, words }] }, Math.round(durationSec * 16_000)),
  });
  const semantic = assembleTimelineAuthor(sealTimelineAuthorHeader({ id: "speech" }),
    appendTimelineAuthorTake(createTimelineAuthorSet(), take), { frameRate });

  // The measurement itself stays overlapping. The Timeline records what was heard; only the
  // authored Cue boundary is made exclusive.
  const tokens = semantic.items[0]!.take.tokens;
  assert.ok(tokens.slice(1).some((token, index) => token.startFrame < tokens[index]!.endFrameExclusive),
    "fixture must reproduce touching Word windows");

  const { cues } = temporalizeCaptionDocument(document, semantic);
  assert.ok(cues.length > 1, "fixture must produce a Cue break");
  for (const [index, cue] of cues.slice(0, -1).entries()) {
    const next = cues[index + 1]!;
    assert.ok(cue.endFrameExclusive <= next.startFrame,
      `Cue ${cue.id} is still visible when Cue ${next.id} starts`);
    assert.ok(cue.endFrameExclusive > cue.startFrame, `Cue ${cue.id} was clipped out of existence`);
  }
});
