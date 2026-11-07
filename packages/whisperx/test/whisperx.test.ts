import { sealSpeechEvidenceAudio } from "@hypit/speech-evidence";
import type { SpeechEvidenceAudio } from "@hypit/speech-evidence";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  parseWhisperXLanguage,
  verifyWhisperXTranscriptionRequest,
  whisperXComponent,
  whisperXProducers,
  whisperXRequestForEvidenceAudio,
} from "@hypit/whisperx";

function evidenceAudio(): SpeechEvidenceAudio {
  return sealSpeechEvidenceAudio({
    artifact: {
      kind: "blob",
      resource: fixtureResource("whisperx-test:evidence-audio"),
      size: 32_044,
      mediaType: "audio/wav",
    },
    sampleFrames: 16_000,
  });
}

test("WhisperX request contains canonical audio, its sample span and the chosen language", () => {
  const valid = evidenceAudio();
  const request = whisperXRequestForEvidenceAudio(valid, { language: "es" });
  assert.deepEqual(request, {
    audio: valid.artifact,
    sampleFrames: 16_000,
    language: "es",
  });
  assert.deepEqual(verifyWhisperXTranscriptionRequest(request), request);
  assert.throws(() => verifyWhisperXTranscriptionRequest({ ...request, debug: true }),
    /unsupported field debug/u);
});

test("an explicit language reaches an independent transcription request", async () => {
  for (const language of ["en", "zh", "es", "ko", "ja", "id", "yue", "zzz"]) {
    const producer = whisperXComponent.producers.find((item) =>
      item.producer.name === whisperXProducers.request.name);
    assert.ok(producer);
    const result = await producer.handler({ inputs: {
      evidence: { value: (evidenceAudio()) },
      language: { value: language },
    } } as never);
    assert.equal(result.kind, "need");
    assert.equal(verifyWhisperXTranscriptionRequest(result.constraints).language, language);
  }
});

test("language spelling is explicit; auto-detection and locale aliases are not guessed", () => {
  for (const language of [undefined, "", "auto", "und", "KO", "zh-CN", "korean", " ko ", 42]) {
    assert.throws(() => parseWhisperXLanguage(language), /explicit lowercase/u);
    assert.throws(() => verifyWhisperXTranscriptionRequest({
      ...whisperXRequestForEvidenceAudio(evidenceAudio(), { language: "en" }), language,
    }), /explicit lowercase/u);
  }
});
