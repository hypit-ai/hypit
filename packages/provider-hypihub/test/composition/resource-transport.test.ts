import assert from "node:assert/strict";
import test from "node:test";
import { encodeOAuth2Credential } from "@hypit/runtime";

import { EndpointRegistry, MemoryResourceStore } from "@hypit/executor";
import { defineEndpoint, installEndpoint } from "@hypit/endpoint";
import type { CanonicalValue, Need } from "@hypit/protocol";
import { mimoSpeechEndpoints, sealMimoSpeechRequest } from "@hypit/mimo-speech";
import { fishAudioSpeechEndpoints, sealFishAudioSpeechRequest } from "@hypit/fishaudio-speech";
import { elevenLabsSpeechEndpoints, sealElevenLabsSpeechRequest } from "@hypit/elevenlabs-speech";
import { generationTypes } from "@hypit/generation";
import { gptImageEndpoints, sealGptImage2Request } from "@hypit/gpt-image";
import { sealSeedanceRequest, seedanceEndpoints } from "@hypit/seedance";
import { sealSpeechEvidenceAudio, speechEvidenceTypes } from "@hypit/speech-evidence";
import { whisperXCapabilities, whisperXRequestForEvidenceAudio } from "@hypit/whisperx";
import { portraitMattingEndpoint, sealPortraitMattingRequest } from "@hypit/volcengine-matting";

import { createHypiHubProvider, diagnoseHypiHubProvider } from "../../src/provider.js";

import { endpointFor, need, packageVersion, wav } from "../provider-scenario.js";

test("HypiHub stores both preview JSON and ordinary speech JSON as audio Resources", async () => {
  const resources = new MemoryResourceStore();
  const voiceReference = await resources.put(new Uint8Array([1, 2, 3, 4]), "audio/wav");
  const submitted: Record<string, unknown>[] = [];
  const provider = createHypiHubProvider({
    publicAssetUrl: async (artifact) => {
      assert.equal(artifact.resource, voiceReference.resource);
      return "https://hypit.ai/assets/voice.wav";
    },
    fetch: async (input, init) => {
      const url = String(input);
      if (url.includes("/models/")) return Response.json({ endpoints: ["audio_speech"] });
      assert.match(url, /\/audio\/speech$/u);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      submitted.push(body);
      const data = Buffer.from([9, 8, 7, submitted.length]).toString("base64");
      return cases[submitted.length - 1]!.previews
        ? Response.json({ object: "audio.voice_previews", previews: [
          { b64_json: data, mime_type: "audio/wav" },
          { b64_json: Buffer.from([6, 5, 4]).toString("base64"), mime_type: "audio/wav" },
        ] })
        : Response.json({ object: "audio.speech", b64_json: data, mime_type: "audio/wav" });
    },
  });
  const registry = new EndpointRegistry();
  await installEndpoint(provider, registry);
  const cases = [
    {
      endpoint: mimoSpeechEndpoints.voiceDesign,
      constraints: sealMimoSpeechRequest("mimo-v2.5-tts-voicedesign", {
        text: ["A short voice sample."], voiceDescription: ["Warm and confident."],
      }),
      previews: true,
      wire: { model: "mimo-v2.5-tts-voicedesign", input: "A short voice sample.", voice_description: "Warm and confident." },
    },
    {
      endpoint: mimoSpeechEndpoints.voiceClone,
      constraints: sealMimoSpeechRequest("mimo-v2.5-tts-voiceclone", {
        text: ["Independent narration."], instruction: ["Quietly direct."],
        voiceReference: [{ role: "audio", artifact: voiceReference }],
      }),
      previews: false,
      wire: { model: "mimo-v2.5-tts-voiceclone", input: "Independent narration.", prompt: "Quietly direct.",
        reference_audio: ["https://hypit.ai/assets/voice.wav"] },
    },
    {
      endpoint: fishAudioSpeechEndpoints.voiceDesign,
      constraints: sealFishAudioSpeechRequest("voice-design-1", {
        text: ["A Fish Audio voice sample."], voiceDescription: ["A bright, playful young woman."],
      }),
      previews: true,
      wire: { model: "fishaudio/voice-design-1", input: "A Fish Audio voice sample.", voice_description: "A bright, playful young woman." },
    },
    {
      endpoint: fishAudioSpeechEndpoints.voiceClone,
      constraints: sealFishAudioSpeechRequest("voice-clone", {
        text: ["Fish Audio narration."], voiceReference: [{ role: "audio", artifact: voiceReference }],
      }),
      previews: false,
      wire: { model: "fishaudio/voice-clone", input: "Fish Audio narration.", voice_description: "reference",
        reference_audio: ["https://hypit.ai/assets/voice.wav"] },
    },
    {
      endpoint: elevenLabsSpeechEndpoints.voiceDesign,
      constraints: sealElevenLabsSpeechRequest("eleven_ttv_v3", {
        text: ["This is a clear conversational voice sample, with enough room to hear the speaker's warmth, energy and natural rhythm."],
        voiceDescription: ["A warm young woman with bright conversational delivery."],
      }),
      previews: true,
      wire: { model: "eleven_ttv_v3",
        input: "This is a clear conversational voice sample, with enough room to hear the speaker's warmth, energy and natural rhythm.",
        voice_description: "A warm young woman with bright conversational delivery." },
    },
  ];
  for (const [index, item] of cases.entries()) {
    const request = {
      id: `need:hypihub-speech-${index}`,
      capability: item.endpoint.capability,
      returns: item.endpoint.returns,
      constraints: item.constraints as unknown as CanonicalValue,
      result: `record:hypihub-speech-${index}`,
    };
    const resolution = registry.select(request);
    assert.equal(resolution.status, "resolved");
    assert.equal(resolution.registration.kind, "immediate");
    const result = await resolution.registration.handler({

      need: request,
      resources,
      credentials: { apiKey: { secret: "test-key" } },
    });
    const set = result as Record<string, unknown>;
    const audios = set.audios as Array<{ resource: `res_${string}` }>;
    assert.equal(audios.length, item.previews ? 2 : 1);
    for (const audio of audios) assert.equal(await resources.has(audio.resource), true);
    assert.deepEqual(submitted[index], { ...item.wire, output: "b64_json" });
  }
});

test("HypiHub uploads one referenced Resource once and submits its HTTPS URL", async () => {
  const resources = new MemoryResourceStore();
  const referenceBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const reference = await resources.put(referenceBytes, "image/png");
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter turns toward camera."],
    referenceImage: [
      { role: "image", artifact: reference, fields: { personReference: true } },
      { role: "image", artifact: reference, fields: { personReference: true } },
    ],
    resolution: ["720p"], aspectRatio: ["16:9"], duration: [5],
    generateAudio: [false], webSearch: [false],
  }) as unknown as CanonicalValue);
  const calls: string[] = [];
  const signedBatches: number[][] = [];
  const partAttempts = new Map<number, number>();
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/v1/files/uploads")) {
      assert.equal(init?.method, "POST");
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-key");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.bytes, referenceBytes.byteLength);
      assert.equal(body.mime_type, "image/png");
      assert.equal(body.filename, "reference.png");
      assert.equal(body.is_person_reference, true);
      return Response.json({
        upload_mode: "s3_multipart",
        upload_id: "up_reference",
        part_size: 5,
        part_count: 3,
        concurrency: 2,
      });
    }
    if (url.endsWith("/v1/files/uploads/up_reference/parts")) {
      const body = JSON.parse(String(init?.body)) as {
        readonly parts: readonly {
          readonly part_number: number;
          readonly bytes: number;
          readonly checksum_sha256: string;
        }[];
      };
      signedBatches.push(body.parts.map((part) => part.part_number));
      return Response.json({ parts: body.parts.map((part) => ({
        part_number: part.part_number,
        url: `https://s3.example/reference-${part.part_number}?signature=secret`,
        headers: {
          "content-length": String(part.bytes),
          "x-amz-checksum-sha256": part.checksum_sha256,
        },
      })) });
    }
    if (url.startsWith("https://s3.example/reference")) {
      assert.equal(init?.method, "PUT");
      const match = /reference-(\d+)/u.exec(url);
      assert.ok(match);
      const part = Number(match[1]);
      const attempt = (partAttempts.get(part) ?? 0) + 1;
      partAttempts.set(part, attempt);
      if (part === 2 && attempt === 1) return new Response("retry", { status: 503 });
      return new Response(null, {
        headers: {
          etag: `part-${part}`,
          "x-amz-checksum-sha256": (init?.headers as Record<string, string>)["x-amz-checksum-sha256"] ?? "",
        },
      });
    }
    if (url.endsWith("/v1/files/uploads/up_reference/complete")) {
      const body = JSON.parse(String(init?.body)) as { readonly parts: readonly unknown[] };
      assert.equal(body.parts.length, 3);
      return Response.json({ url: "https://hypit.ai/files/as_reference.png" });
    }
    if (url.endsWith("/v1/models/seedance-2-mini")) {
      return Response.json({ endpoints: ["videos"] });
    }
    if (url.endsWith("/v1/videos")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.model, "seedance-2-mini");
      assert.deepEqual(body.reference_image_urls, [
        "https://hypit.ai/files/as_reference.png",
        "https://hypit.ai/files/as_reference.png",
      ]);
      return Response.json({ id: "job_hypihub_test", status: "queued" });
    }
    if (url.endsWith("/v1/jobs/job_hypihub_test")) {
      return Response.json({ id: "job_hypihub_test", status: "succeeded" });
    }
    if (url.endsWith("/v1/jobs/job_hypihub_test/assets")) {
      return Response.json({ items: [{ url: "https://download.hypit.test/result.mp4" }] });
    }
    if (url === "https://download.hypit.test/result.mp4") {
      return new Response(new Uint8Array([9, 8, 7]), { headers: { "content-type": "video/mp4" } });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const endpoint = await endpointFor(request, fakeFetch);
  const common = {

    need: request, resources, credentials: { apiKey: { secret: "test-key" } },
    operation: "operation:hypihub-test",
  };
  const started = await endpoint.start(common);
  assert.equal(started.status, "pending");
  assert.equal(calls.filter((url) => url.endsWith("/v1/files/uploads")).length, 1);
  assert.deepEqual(signedBatches, [[1, 2, 3], [2]]);
  assert.deepEqual([...partAttempts.entries()].sort(), [[1, 1], [2, 2], [3, 1]]);
  if (started.status !== "pending") return;
  const ready = await endpoint.poll({ ...common, handle: started.handle! });
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;
  const completed = await endpoint.collect!({ ...common, handle: ready.handle });
  assert.equal(completed.status, "completed");
});

test("HypiHub stops before paid submission when a reference upload fails", async () => {
  const resources = new MemoryResourceStore();
  const reference = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter turns toward camera."],
    referenceImage: [{ role: "image", artifact: reference, fields: { personReference: true } }],
    resolution: ["720p"], aspectRatio: ["16:9"], duration: [5],
    generateAudio: [false], webSearch: [false],
  }) as unknown as CanonicalValue);
  let signingCalls = 0;
  let uploadAttempts = 0;
  let cancelled = false;
  let paidSubmissions = 0;
  const registry = new EndpointRegistry();
  await installEndpoint(createHypiHubProvider({
    uploadPartAttempts: 2,
    requestTimeoutMs: 1_000,
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/models/seedance-2-mini")) {
        return Response.json({ endpoints: ["videos"] });
      }
      if (url.endsWith("/v1/files/uploads")) {
        return Response.json({
          upload_mode: "s3_multipart",
          upload_id: "up_failure",
          part_size: 16,
          part_count: 1,
          concurrency: 1,
        });
      }
      if (url.endsWith("/v1/files/uploads/up_failure/parts")) {
        signingCalls += 1;
        const body = JSON.parse(String(init?.body)) as {
          readonly parts: readonly { readonly checksum_sha256: string }[];
        };
        return Response.json({ parts: [{
          part_number: 1,
          url: "https://private.s3.example/reference?signature=must-not-leak",
          headers: {
            "content-length": "3",
            "x-amz-checksum-sha256": body.parts[0]?.checksum_sha256,
          },
        }] });
      }
      if (url.startsWith("https://private.s3.example/")) {
        uploadAttempts += 1;
        throw new Error(`network failure at ${url}`);
      }
      if (url.endsWith("/v1/files/uploads/up_failure") && init?.method === "DELETE") {
        cancelled = true;
        return Response.json({});
      }
      if (url.endsWith("/v1/videos")) {
        paidSubmissions += 1;
        return Response.json({ id: "must-not-exist", status: "queued" });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  }), registry);
  const resolution = registry.select(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "asynchronous");
  const outcome = await resolution.registration.endpoint.start({

    need: request,
    resources,
    credentials: { apiKey: { secret: "test-key" } },
    operation: "operation:hypihub-upload-failure",
  });
  assert.equal(outcome.status, "failed");
  assert.equal(signingCalls, 2);
  assert.equal(uploadAttempts, 2);
  assert.equal(cancelled, true);
  assert.equal(paidSubmissions, 0);
  assert.match(outcome.status === "failed" ? outcome.failure.message : "", /reference upload failed before generation submission/u);
  assert.doesNotMatch(outcome.status === "failed" ? outcome.failure.message : "", /must-not-leak/u);
});

for (const language of ["en", "ko"]) test(`HypiHub forwards ${language} for the Provider-neutral WhisperX transcription capability`, async () => {
  const resources = new MemoryResourceStore();
  const bytes = wav(32_000);
  const artifact = await resources.put(bytes, "audio/wav");
  const request: Need = {
    id: "need:hypihub-whisperx",
    capability: whisperXCapabilities.transcription,
    returns: speechEvidenceTypes.transcript,
    constraints: whisperXRequestForEvidenceAudio(sealSpeechEvidenceAudio({
      artifact,
      sampleFrames: 32_000,
    }), { language }) as unknown as CanonicalValue,
    result: "record:hypihub-whisperx",
  };
  let submitted = false;
  const registry = new EndpointRegistry();
  await installEndpoint(createHypiHubProvider({ fetch: async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/models/victor-upmeet%2Fwhisperx")) {
      return Response.json({ endpoints: ["transcriptions"] });
    }
    if (url.endsWith("/v1/files/uploads")) {
      return Response.json({
        upload_mode: "s3_multipart",
        upload_id: "up_whisperx",
        part_size: 100_000,
        part_count: 1,
        concurrency: 1,
      });
    }
    if (url.endsWith("/v1/files/uploads/up_whisperx/parts")) {
      const body = JSON.parse(String(init?.body)) as {
        readonly parts: readonly { readonly checksum_sha256: string }[];
      };
      return Response.json({ parts: [{
        part_number: 1,
        url: "https://s3.example/whisperx?signature=secret",
        headers: {
          "content-length": String(bytes.byteLength),
          "x-amz-checksum-sha256": body.parts[0]?.checksum_sha256,
        },
      }] });
    }
    if (url.startsWith("https://s3.example/whisperx")) {
      assert.deepEqual(new Uint8Array(await new Response(init?.body).arrayBuffer()), bytes);
      return new Response(null, { headers: { etag: "whisperx" } });
    }
    if (url.endsWith("/v1/files/uploads/up_whisperx/complete")) {
      return Response.json({ url: "https://hypit.ai/files/alignment-evidence.wav" });
    }
    if (url.endsWith("/v1/audio/transcriptions")) {
      submitted = true;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.model, "victor-upmeet/whisperx");
      assert.equal(body.language, language);
      assert.equal(body.response_format, "verbose_json");
      assert.equal(body.url, "https://hypit.ai/files/alignment-evidence.wav");
      assert.deepEqual(body.timestamp_granularities, ["segment", "word"]);
      return Response.json({
        language,
        words: [
          { word: "hello", start: 0.1, end: 0.4 },
          { word: "world", start: 1.2, end: 1.6 },
        ],
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  } }), registry);
  const resolution = registry.select(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  const result = await resolution.registration.handler({

    need: request,
    resources,
    credentials: { apiKey: { secret: "test-key" } },
  });
  assert.equal(submitted, true);
  assert.deepEqual(result, ({
    sampleFrames: 32_000,
    passages: [{
    startSample: 1_600,
    endSampleExclusive: 25_600,
    words: [
      { text: "hello", startSample: 1_600, endSampleExclusive: 6_400 },
      { text: "world", startSample: 19_200, endSampleExclusive: 25_600 },
    ],
    chars: [],
  }] }));
});
