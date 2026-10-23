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

test("HypiHub exposes model groups beneath its own total capacity", async () => {
  const registry = new EndpointRegistry();
  await installEndpoint(createHypiHubProvider({ pool: "hub-account", defaultConcurrency: 8,
    capabilityConcurrency: { "seedance-2-mini": 2, transcription: 1 } }), registry);
  const requests = [
    need({}),
    { ...need({}), capability: whisperXCapabilities.transcription, returns: speechEvidenceTypes.transcript },
  ];
  for (const [index, request] of requests.entries()) {
    const selected = registry.select(request);
    assert.equal(selected.status, "resolved");
    assert.deepEqual(selected.registration.scheduling?.resources, [
      { id: "pool:hub-account", limit: 8 },
      { id: `capacity:hub-account/${["seedance-2-mini", "transcription"][index]}`, limit: [2, 1][index] },
    ]);
  }
  assert.throws(() => createHypiHubProvider({ capabilityConcurrency: { invented: 1 } }), /unknown HypiHub capacity/);
});

test("HypiHub operation deadlines fail while polling transport errors keep the job pending", async () => {
  const request = need({});
  let requests = 0;
  let reply: (() => Response) | undefined;
  const registry = new EndpointRegistry();
  await installEndpoint(createHypiHubProvider({ pollIntervalMs: 0, operationTimeoutMs: 60_000,
    fetch: async (url) => {
      requests++; assert.match(String(url), /\/jobs\/test$/);
      if (reply === undefined) throw new Error("offline");
      return reply();
    } }), registry);
  const selected = registry.select(request);
  assert.equal(selected.status, "resolved"); assert.equal(selected.registration.kind, "asynchronous");
  const endpoint = selected.registration.endpoint;
  const common = {
    need: request, resources: new MemoryResourceStore(), credentials: { apiKey: { secret: "test" } }, operation: "op:test",
    handle: { contract: "hypit.hypihub-operation@1", jobId: "test",
      route: `${request.capability.module.name}@${request.capability.module.version}#${request.capability.name}`, startedAt: 0 } };
  const timedOut = await endpoint.poll(common);
  assert.equal(timedOut.status, "failed");
  assert.equal(timedOut.status === "failed" && timedOut.failure.code, "HYPIHUB_OPERATION_TIMEOUT");
  assert.equal(requests, 0);
  const live = { ...common, handle: { ...common.handle, startedAt: Date.now() } };
  const offline = await endpoint.poll(live);
  assert.equal(offline.status, "pending");
  assert.equal(offline.status === "pending" && offline.progress?.phase, "retrying");
  assert.equal(requests, 1);
  reply = () => new Response("", { status: 429, headers: { "retry-after": "3" } });
  const before = Date.now();
  const limited = await endpoint.poll(live);
  assert.equal(limited.status, "pending");
  assert.ok(limited.status === "pending" && limited.wakeAt! >= before + 3_000);
  reply = () => new Response("{}", { status: 404 });
  const missing = await endpoint.poll(live);
  assert.equal(missing.status, "failed");
  assert.equal(requests, 3);
  const unconfigured = await endpoint.poll({ ...live, credentials: {} });
  assert.equal(unconfigured.status, "failed");
  assert.equal(requests, 3);
});

test("reference URL reuse includes its authored classification and forwards it to custom transport", async () => {
  const resources = new MemoryResourceStore();
  const reference = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const flags = [true, false, true];
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A person waves."], resolution: ["720p"], aspectRatio: ["9:16"],
    duration: [5], generateAudio: [false], webSearch: [false],
    referenceImage: flags.map((flag) => ({ role: "image", artifact: reference,
      fields: { personReference: flag } })),
  }) as unknown as CanonicalValue);
  const seen: unknown[] = [];
  const provider = createHypiHubProvider({
    publicAssetUrl: async (_artifact, _resources, fields) => {
      seen.push(fields);
      return `https://media.test/${String(fields?.personReference)}`;
    },
    fetch: async (input, init) => {
      if (String(input).includes("/models/")) return Response.json({ endpoints: ["videos"] });
      assert.deepEqual(JSON.parse(String(init?.body)).reference_image_urls, flags.map((flag) => `https://media.test/${String(flag)}`));
      return Response.json({ id: "classified-inputs", status: "queued" });
    },
  });
  const registry = new EndpointRegistry();
  await installEndpoint(provider, registry);
  const resolved = registry.select(request);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.registration.kind, "asynchronous");
  const started = await resolved.registration.endpoint.start({ need: request, resources,
    credentials: { apiKey: { secret: "test-key" } }, operation: "classified" });
  assert.equal(started.status, "pending");
  assert.deepEqual(seen, [{ personReference: true }, { personReference: false }]);
});

test("generation and voice cloning check their exact catalogue operation before resolving references", async () => {
  const resources = new MemoryResourceStore();
  const image = await resources.put(new Uint8Array([1, 2, 3]), "image/png");
  const voice = await resources.put(wav(100), "audio/wav");
  const cases = [
    {
      endpoint: seedanceEndpoints.mini!, model: "seedance-2-mini", operation: "videos", path: "/videos",
      constraints: sealSeedanceRequest("seedance-2-mini", {
        prompt: ["A presenter speaks."], referenceImage: [{ role: "image", artifact: image, fields: { personReference: true } }],
        resolution: ["720p"], aspectRatio: ["9:16"], duration: [5], generateAudio: [true], webSearch: [false],
      }),
      references: true,
    },
    {
      endpoint: gptImageEndpoints.image!, model: "gpt-image-2", operation: "image_edits", path: "/images/edits",
      constraints: sealGptImage2Request({ prompt: ["Edit this portrait."], aspectRatio: ["1:1"], resolution: ["1K"],
        images: [{ role: "image", artifact: image }],
      }),
      references: true,
    },
    {
      endpoint: gptImageEndpoints.image!, model: "gpt-image-2", operation: "images", path: "/images/generations",
      constraints: sealGptImage2Request({ prompt: ["A portrait."], aspectRatio: ["1:1"], resolution: ["1K"] }),
      references: false,
    },
    {
      endpoint: mimoSpeechEndpoints.voiceClone, model: "mimo-v2.5-tts-voiceclone", operation: "audio_speech", path: "/audio/speech",
      constraints: sealMimoSpeechRequest("mimo-v2.5-tts-voiceclone", {
        text: ["Continue speaking."], voiceReference: [{ role: "audio", artifact: voice }],
      }),
      references: true,
    },
  ];
  for (const item of cases) for (const availability of ["missing", "different-operation", "undeclared", "unknown", "available"] as const) {
    const events: string[] = [];
    const progress: string[] = [];
    const registry = new EndpointRegistry();
    await installEndpoint(createHypiHubProvider({
      publicAssetUrl: async (artifact) => {
        events.push("reference");
        return `https://media.test/${artifact.resource}`;
      },
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === `/v1/models/${encodeURIComponent(item.model)}`) {
          events.push("catalogue");
          if (availability === "missing") return Response.json({ error: { code: "model_not_found", message: "No route for this account." } }, {
            status: 404, headers: { "x-request-id": "catalogue-request" },
          });
          if (availability === "unknown") throw new Error("Connection closed before catalogue response");
          if (availability === "undeclared") return Response.json({ id: item.model });
          return Response.json({ endpoints: availability === "different-operation" ? ["transcriptions"] : [item.operation] });
        }
        assert.equal(url.pathname, `/v1${item.path}`);
        events.push("submit");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, item.model);
        if (item.operation === "image_edits") assert.equal(body.reference_images.length, 1);
        if (item.operation === "images") assert.equal(body.reference_images, undefined);
        if (item.operation === "audio_speech") return new Response(new Uint8Array(wav(100)), { headers: { "content-type": "audio/wav" } });
        return Response.json({ id: "selected-job", status: "queued" });
      },
    }), registry);
    const request: Need = {
      id: "need:catalogue", capability: item.endpoint.capability, returns: item.endpoint.returns,
      constraints: item.constraints as unknown as CanonicalValue, result: "result:catalogue",
    };
    const selected = registry.select(request);
    assert.equal(selected.status, "resolved");
    const context = {
      need: request, resources,
      credentials: { apiKey: { secret: "test-key" } }, operation: "operation:catalogue",
      reportProgress: async (value: { readonly phase?: string }) => { progress.push(value.phase!); },
    };
    let failed: { code?: string; message: string } | undefined;
    if (selected.registration.kind === "asynchronous") {
      const outcome = await selected.registration.endpoint.start(context);
      if (outcome.status === "failed") failed = outcome.failure;
      else assert.equal(outcome.status, "pending");
    } else {
      assert.equal(selected.registration.kind, "immediate");
      try { await selected.registration.handler(context); }
      catch (error) { failed = error as Error & { code?: string }; }
    }
    if (availability === "available" || availability === "unknown") {
      assert.equal(failed, undefined);
      assert.deepEqual(events, item.references ? ["catalogue", "reference", "submit"] : ["catalogue", "submit"]);
      assert.match(progress.at(-1)!, /Submitting HypiHub request/u);
    } else {
      assert.ok(failed);
      assert.deepEqual(events, ["catalogue"], "neither a reference nor another model is tried");
      if (availability === "missing") {
        assert.equal(failed.code, "model_not_found");
        assert.match(failed.message, /HTTP 404.*request=catalogue-request.*No route for this account/u);
      } else if (availability === "different-operation") {
        assert.equal(failed.code, "HYPIHUB_MODEL_OPERATION_UNAVAILABLE");
        assert.match(failed.message, /does not list operation.*listed operations: transcriptions/u);
      } else if (availability === "undeclared") {
        assert.match(failed.message, /returned no valid operation list.*is unknown/u);
        assert.doesNotMatch(failed.message, /does not list operation|model_not_found/u);
      }
      assert.equal(progress.length, 1);
      assert.match(progress[0]!, /Reading HypiHub model catalogue/u);
    }
  }
});

test("an unavailable model reports availability without prescribing another login", async () => {
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter speaks."], resolution: ["720p"], aspectRatio: ["9:16"],
    duration: [5], generateAudio: [true], webSearch: [false],
  }) as unknown as CanonicalValue);
  const endpoint = await endpointFor(request, async () => Response.json({ error: "model_not_found" }, { status: 404 }));
  const outcome = await endpoint.start({

    need: request, resources: new MemoryResourceStore(),
    credentials: { apiKey: { secret: "test-key" } }, operation: "operation:unavailable",
  });
  assert.equal(outcome.status, "failed");
  if (outcome.status !== "failed") return;
  assert.match(outcome.failure.message, /404.*model_not_found/u);
  assert.doesNotMatch(outcome.failure.message, /sign in|auth login/iu);
});

test("HTTP evidence keeps model, request id and the complete public reason without inferring account action", async () => {
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter speaks."], resolution: ["720p"], aspectRatio: ["9:16"],
    duration: [5], generateAudio: [true], webSearch: [false],
  }) as unknown as CanonicalValue);
  for (const [status, code] of [[404, "model_not_found"], [401, "account_disabled"], [402, "insufficient_credits"]] as const) {
    let calls = 0;
    const reason = `A detailed public reason. ${"detail ".repeat(70)}End of reason.`;
    const endpoint = await endpointFor(request, async (url) => {
      calls++;
      if (String(url).includes("/models/")) return Response.json({ endpoints: ["videos"] });
      return Response.json({ error: { code, message: reason }, internal: "not-public-evidence" }, {
        status, headers: { "x-request-id": "req-evidence" },
      });
    });
    const outcome = await endpoint.start({
      need: request,
      resources: new MemoryResourceStore(), credentials: { apiKey: { secret: "private-key" } }, operation: "evidence",
    });
    assert.equal(calls, 2);
    assert.equal(outcome.status, "failed");
    if (outcome.status !== "failed") continue;
    assert.equal(outcome.failure.code, code);
    assert.match(outcome.failure.message, new RegExp(`HTTP ${status}`));
    assert.match(outcome.failure.message, /POST https:\/\/hypit.ai\/v1\/videos; model=seedance-2-mini; request=req-evidence/u);
    assert.ok(outcome.failure.message.endsWith(reason));
    assert.doesNotMatch(outcome.failure.message, /auth login|Sign in|private-key|not-public-evidence/u);
  }
});

test("terminal jobs preserve service error codes and receipts on both submission and polling", async () => {
  const request = need(sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter speaks."], resolution: ["720p"], aspectRatio: ["9:16"],
    duration: [5], generateAudio: [true], webSearch: [false],
  }) as unknown as CanonicalValue);
  for (const phase of ["start", "poll"] as const) {
    const endpoint = await endpointFor(request, async (url) => String(url).includes("/models/")
      ? Response.json({ endpoints: ["videos"] })
      : Response.json({ id: "job-rejected", status: "failed", model: "seedance-2-mini",
        error_code: "upstream_rejected", error: "Reference could not be processed" }));
    const context = {
      need: request,
      resources: new MemoryResourceStore(), credentials: { apiKey: { secret: "test-key" } }, operation: "job",
    };
    const outcome = phase === "start" ? await endpoint.start(context) : await endpoint.poll({ ...context,
      handle: { contract: "hypit.hypihub-operation@1", jobId: "job-rejected", startedAt: Date.now(),
        route: `${request.capability.module.name}@${request.capability.module.version}#${request.capability.name}` },
    });
    assert.equal(outcome.status, "failed");
    if (outcome.status !== "failed") continue;
    assert.equal(outcome.failure.code, "upstream_rejected");
    assert.deepEqual(outcome.receipt, { id: "job-rejected" });
    assert.match(outcome.failure.message, /job-rejected failed; upstream_rejected; model=seedance-2-mini: Reference could not be processed/u);
  }
});

for (const kind of ["pricing", "speech"] as const) {
  test(`${kind} failures retain service evidence across their throwing boundary`, async () => {
    const request: Need = kind === "pricing" ? need(sealSeedanceRequest("seedance-2-mini", {
      prompt: ["A presenter."], resolution: ["720p"], aspectRatio: ["9:16"],
      duration: [5], generateAudio: [true], webSearch: [false],
    }) as unknown as CanonicalValue) : {
      id: "need:voice", ...mimoSpeechEndpoints.voiceDesign,
      constraints: sealMimoSpeechRequest("mimo-v2.5-tts-voicedesign", {
        text: ["A short sample."], voiceDescription: ["Warm and confident."],
      }) as unknown as CanonicalValue, result: "voice",
    };
    let calls = 0;
    const provider = createHypiHubProvider({ fetch: async (url) => {
      calls++;
      if (String(url).includes("/models/")) return Response.json({ endpoints: ["audio_speech"] });
      return Response.json({ error: { code: "no_available_provider", message: "No route is ready" } }, {
        status: 503, headers: { "x-request-id": `req-${kind}` },
      });
    } });
    const credentials = { apiKey: { secret: "private-credential" } };
    const invoke = async () => {
      if (kind === "pricing") return await provider.readPricing!({ request, credentials: async () => credentials });
      const registry = new EndpointRegistry();
      await installEndpoint(provider, registry);
      const selected = registry.select(request);
      assert.equal(selected.status, "resolved");
      assert.equal(selected.registration.kind, "immediate");
      return await selected.registration.handler({ need: request, credentials, resources: new MemoryResourceStore(),

      });
    };
    await assert.rejects(invoke, (error: Error) => {
      assert.match(error.message, /HTTP 503; no_available_provider/u);
      assert.ok(error.message.includes(`request=req-${kind}`));
      assert.ok(error.message.includes(kind === "pricing" ? "model=seedance-2-mini" : "model=mimo-v2.5-tts-voicedesign"));
      assert.ok(error.message.endsWith("No route is ready"));
      assert.doesNotMatch(error.message, /private-credential|auth login/u);
      return true;
    });
    assert.equal(calls, kind === "pricing" ? 1 : 2);
  });
}

for (const mode of ['success', 'error', 'body-timeout'] as const) {
  test(`hosted transcription keeps its receipt on ${mode} without resubmitting`, async () => {
    const resources = new MemoryResourceStore();
    const artifact = await resources.put(wav(32_000), 'audio/wav');
    const request: Need = {
      id: 'need:transcription-receipt', capability: whisperXCapabilities.transcription,
      returns: speechEvidenceTypes.transcript,
      constraints: whisperXRequestForEvidenceAudio(sealSpeechEvidenceAudio({ artifact, sampleFrames: 32_000 }), { language: 'en' }) as unknown as CanonicalValue,
      result: 'record:transcription-receipt',
    };
    const messages: string[] = [];
    let submissions = 0;
    const registry = new EndpointRegistry();
    await installEndpoint(createHypiHubProvider({
      requestTimeoutMs: 40,
      publicAssetUrl: async () => 'https://assets.test/evidence.wav',
      fetch: async (input) => {
        if (String(input).includes('/models/')) return Response.json({ endpoints: ['transcriptions'] });
        submissions++;
        const headers = { 'x-request-id': 'req_example', location: '/v1/audio/transcriptions/req_example' };
        if (mode === 'body-timeout') return new Response(new ReadableStream({ start() {} }), { headers });
        return Response.json(mode === 'success' ? { words: [{ word: 'hello', start: 0.1, end: 0.4 }] } : { error: 'upstream unavailable' }, { status: mode === 'success' ? 200 : 502, headers });
      },
    }), registry);
    const resolution = registry.select(request);
    assert.equal(resolution.status, 'resolved');
    assert.equal(resolution.registration.kind, 'immediate');
    const work = resolution.registration.handler({

      need: request, resources, credentials: { apiKey: { secret: 'test-key' } },
      reportDiagnostic: async (entry) => { messages.push(entry.message); },
    });
    if (mode === 'success') await work;
    else await assert.rejects(Promise.resolve(work), mode === 'error' ? /502/ : /timed out/);
    assert.equal(submissions, 1);
    assert.equal(messages.length, 1);
    assert.match(messages[0]!, /request req_example/);
    assert.match(messages[0]!, /https:\/\/hypit.ai\/v1\/audio\/transcriptions\/req_example/);
  });
}
