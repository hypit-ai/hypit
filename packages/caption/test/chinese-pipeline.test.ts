import assert from "node:assert/strict";
import test from "node:test";
import type { Narrative } from "@hypit/narrative";
import { captionDocument, narrativeValue, parseScript } from "@hypit/script";
import { alignSemanticTake } from "../../speech-alignment/src/index.js";
import { interpretWhisperXTranscript } from "../../whisperx/src/index.js";
import { appendSpeechTrackTake, assembleSpeechTrack, createSpeechTrackSet, sealSpeechTrackHeader } from "../../speech-track/src/index.js";
import { selectionFrameSpan } from "@hypit/semantic-track";
import { temporalizeCaptionDocument } from "../src/index.js";
import type { CaptionProgram } from "../src/index.js";
import { fixtureResource } from "../../../test/fixture-resource.js";

test("Chinese Script, WhisperX response, semantic assembly and captions preserve words, cue breaks and timing", () => {
  const parsed = parseScript("mixed-zh.svml", `<opening><HOST>用@brand ElevenLabs @/brand做视频，|| 真方便。</opening>
<answer><GUEST>今年<2026|二零二六>年，這個很好。</answer>`);
  const narrative = narrativeValue(parsed, "story") as unknown as Narrative;
  const document = captionDocument(parsed, "story.caption", "story");
  // Representative WhisperX zh wire output: Han characters and Latin letters carry separate times.
  // These fixtures test transport and mapping, not acoustic recognition accuracy.
  const phrases = ["用ElevenLabs做视频真方便", "今年二零二六年这个很好"];
  const durations = [4000, 3000];
  let set = createSpeechTrackSet();
  const evidenceWindows: Array<Array<[number, number]>> = [];
  for (const [index, segment] of narrative.segments.entries()) {
    let cursor = 100;
    const words = [...phrases[index]!].map((word, i) => {
      const start = cursor;
      cursor += i % 3 === 0 ? 190 : 90;
      const end = cursor;
      cursor += i % 4 === 0 ? 80 : 20;
      return { word, start: start / 1000, end: end / 1000 };
    });
    evidenceWindows.push(words.map(word => [Math.round(word.start * 1000), Math.round(word.end * 1000)]));
    const sampleFrames = durations[index]! * 16;
    const take = alignSemanticTake(narrative, {
      narrativeId: narrative.id, kind: "segment", id: segment.id,
      tokenStart: segment.tokenStart, tokenEndExclusive: segment.tokenEndExclusive,
    }, {
      timeline: { frameRate: { numerator: 1000, denominator: 1 }, frameCount: durations[index]! },
      audio: { artifact: { kind: "blob", resource: fixtureResource(`zh:${index}`), size: 1, mediaType: "audio/wav" } },
    }, { passages: interpretWhisperXTranscript({ language: "zh", segments: [{ start: 0,
      end: durations[index]! / 1000, words }] }, sampleFrames) });
    set = appendSpeechTrackTake(set, take);
  }
  const semantic = assembleSpeechTrack(sealSpeechTrackHeader({ id: "speech" }), set);
  const program: CaptionProgram = {
    id: "captions", documentId: document.id,
    styles: [{ id: "plain", rendering: { family: "test-caption@1", parameters: {} } }],
    runs: [{ id: "all", styleId: "plain", unitIds: document.units.map(unit => unit.id) }],
    wordRuns: [], mutedUnitIds: [],
  };
  const projection = temporalizeCaptionDocument(document, semantic, program);
  const wordText = new Map(document.words.map(word => [word.id, word.text]));
  const unitText = new Map(document.units.map(unit => [unit.id, unit.wordIds.map(id => wordText.get(id)!).join("")]));
  assert.deepEqual(projection.cues.map(cue => cue.units.map(unit => unitText.get(unit.unitId)).join("")),
    ["用ElevenLabs做视频，", "真方便。", "今年2026年，這個很好。"]);
  const units = projection.cues.flatMap(cue => cue.units);
  const windowsFor = (text: string) => units.filter(unit => unitText.get(unit.unitId) === text)
    .map(unit => [unit.startFrame, unit.endFrameExclusive]);
  const first = evidenceWindows[0]!;
  assert.deepEqual(windowsFor("用"), [first[0]]);
  assert.deepEqual(windowsFor("ElevenLabs"), [[first[1]![0], first[10]![1]]]);
  assert.deepEqual(windowsFor("做"), [first[11]]);
  const span = selectionFrameSpan(semantic, { ...narrative.selections[0]!, narrativeId: narrative.id });
  assert.deepEqual(span, { startFrame: first[1]![0], endFrameExclusive: first[10]![1] });
  const second = evidenceWindows[1]!;
  assert.deepEqual(windowsFor("2026"), [[4000 + second[2]![0], 4000 + second[5]![1]]]);
  assert.deepEqual(windowsFor("這"), [[4000 + second[7]![0], 4000 + second[7]![1]]]);
  assert.deepEqual(windowsFor("個"), [[4000 + second[8]![0], 4000 + second[8]![1]]]);
  assert.equal(document.units[0]!.role, "HOST");
});
