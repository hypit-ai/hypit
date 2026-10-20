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

for (const operation of ["pricing", "generation"] as const) {
  test(`HypiHub ${operation} waits for separately bounded OAuth before starting the API deadline`, async () => {
    const request = need(sealSeedanceRequest("seedance-2-mini", {
      prompt: ["A presenter"], resolution: ["720p"], aspectRatio: ["9:16"],
      duration: [5], generateAudio: [true], webSearch: [false],
    }) as unknown as CanonicalValue);
    for (const stalls of [false, true]) {
      let saved = false;
      let apiCalls = 0;
      const credentials = { apiKey: {
        secret: encodeOAuth2Credential({ accessToken: "expired", refreshToken: "refresh", expiresAt: 1 }),
        replace: async () => { saved = true; },
      } };
      const provider = createHypiHubProvider({
        // A successful refresh intentionally outlasts the ordinary API deadline.
        requestTimeoutMs: stalls ? 1_000 : 5,
        pricingRequestTimeoutMs: stalls ? 1_000 : 5,
        oauthRequestTimeoutMs: stalls ? 15 : 1_000,
        fetch: async (input, init) => {
          if (String(input).endsWith("/oauth/token")) {
            if (stalls) return await new Promise<Response>((_resolve, reject) => {
              init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
            });
            await new Promise(resolve => setTimeout(resolve, 20));
            return Response.json({ access_token: "fresh", refresh_token: "rotated", expires_in: 3600 });
          }
          apiCalls += 1;
          assert.equal((init!.headers as Record<string, string>).authorization, "Bearer fresh");
          if (String(input).includes("/models/")) return Response.json({ endpoints: ["videos"] });
          if (String(input).endsWith("/videos")) return Response.json({ id: "job_oauth", status: "queued" });
          return Response.json({ pricing: {} });
        },
      });
      if (operation === "pricing") {
        const result = Promise.resolve(provider.readPricing!({ request, credentials: async () => credentials }));
        if (stalls) await assert.rejects(result, /HypiHub OAuth refresh timed out/u);
        else assert.equal((await result).length, 1);
      } else {
        const registry = new EndpointRegistry();
        await installEndpoint(provider, registry);
        const resolution = registry.select(request);
        assert.equal(resolution.status, "resolved");
        assert.equal(resolution.registration.kind, "asynchronous");
        const result = await resolution.registration.endpoint.start({

          need: request, resources: new MemoryResourceStore(), credentials, operation: "operation:oauth",
        });
        assert.equal(result.status, stalls ? "failed" : "pending");
        if (result.status === "failed") assert.match(result.failure.message, /HypiHub OAuth refresh timed out/u);
      }
      assert.equal(saved, !stalls);
      assert.equal(apiCalls, stalls ? 0 : operation === "pricing" ? 1 : 2);
    }
  });
}

test("HypiHub Seedance 2.5 resolves and submits 1080p without downgrading", async () => {
  const request: Need = {
    ...need(sealSeedanceRequest("seedance-2.5", {
      prompt: ["A presenter speaks to camera."], resolution: ["1080p"], aspectRatio: ["9:16"],
      duration: [5], generateAudio: [true], webSearch: [false],
    }) as unknown as CanonicalValue),
    capability: seedanceEndpoints.v25!.capability,
    returns: seedanceEndpoints.v25!.returns,
  };
  let submitted: unknown;
  const endpoint = await endpointFor(request, async (input, init) => {
    const url = String(input);
    if (url.endsWith("/models/seedance-2.5")) return Response.json({ endpoints: ["videos"] });
    if (url.endsWith("/videos")) {
      submitted = JSON.parse(String(init?.body));
      return Response.json({ id: "job_seedance25_1080p", status: "queued" });
    }
    throw new Error(`Unexpected request ${url}`);
  });
  const started = await endpoint.start({

    need: request, resources: new MemoryResourceStore(),
    credentials: { apiKey: { secret: "test-key" } }, operation: "operation:seedance25",
  });
  assert.equal(started.status, "pending");
  assert.deepEqual(submitted, {
    model: "seedance-2.5", prompt: "A presenter speaks to camera.",
    resolution: "1080p", aspect_ratio: "9:16", seconds: 5, generate_audio: true, web_search: false,
  });
});

test("HypiHub portrait matting uses the video job lifecycle and stores transparent output", async () => {
  const resources = new MemoryResourceStore();
  const source = await resources.put(new Uint8Array([1, 2, 3]), "video/mp4");
  const request: Need = {
    id: "need:portrait-matting", capability: portraitMattingEndpoint.capability, returns: portraitMattingEndpoint.returns,
    constraints: sealPortraitMattingRequest({ source: [{ role: "video", artifact: source }] }) as unknown as CanonicalValue,
    result: "record:cutout",
  };
  let submissions = 0;
  const registry = new EndpointRegistry();
  await installEndpoint(createHypiHubProvider({
    publicAssetUrl: async (artifact) => { assert.equal(artifact.resource, source.resource); return "https://media.example.test/source.mp4"; },
    pollIntervalMs: 0,
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/models/matte-portrait-video")) return Response.json({ endpoints: ["videos"] });
      if (url.endsWith("/videos")) {
        submissions++;
        assert.deepEqual(JSON.parse(String(init?.body)), {
          model: "matte-portrait-video", ref_video_url: "https://media.example.test/source.mp4", format: "WEBM",
        });
        return Response.json({ id: "job_cutout", status: "queued" });
      }
      if (url.endsWith("/jobs/job_cutout")) return Response.json({ id: "job_cutout", status: "succeeded" });
      if (url.endsWith("/jobs/job_cutout/assets")) return Response.json({ items: [{ url: "https://media.example.test/cutout.webm" }] });
      if (url.endsWith("/cutout.webm")) return new Response(new Uint8Array([4, 5, 6]), { headers: { "content-type": "video/webm" } });
      throw new Error(`Unexpected request ${url}`);
    },
  }), registry);
  const resolution = registry.select(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "asynchronous");
  const endpoint = resolution.registration.endpoint;
  const context = {
    need: request, resources, credentials: { apiKey: { secret: "test-key" } }, operation: "operation:cutout" };
  const started = await endpoint.start(context);
  assert.equal(started.status, "pending");
  if (started.status !== "pending") return;
  const ready = await endpoint.poll({ ...context, handle: started.handle! });
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;
  const result = await endpoint.collect!({ ...context, handle: ready.handle });
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(submissions, 1);
  const artifact = (result.result.value as unknown as { videos: [typeof source] }).videos[0];
  assert.equal(artifact.mediaType, "video/webm");
  assert.deepEqual(await resources.get(artifact.resource), new Uint8Array([4, 5, 6]));
});
