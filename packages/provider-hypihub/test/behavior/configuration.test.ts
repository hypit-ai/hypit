import assert from "node:assert/strict";
import test from "node:test";
import { encodeOAuth2Credential } from "@hypit/runtime";

import { EndpointRegistry, MemoryResourceStore } from "@hypit/executor";
import { defineEndpoint, endpointOffers, installEndpoint } from "@hypit/endpoint";
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

test("HypiHub declares its own credential acquisition flow", () => {
  const [credential] = createHypiHubProvider().credentials;
  assert.equal(credential?.acquisition?.kind, "oauth2-pkce");
  assert.equal(credential?.acquisition?.authorizationEndpoint, "https://hypit.ai/oauth/consent");
  assert.equal(credential?.acquisition?.tokenEndpoint, "https://hypit.ai/oauth/token");
  assert.equal(credential?.acquisition?.requestTimeoutMs, 30_000);
});

test("HypiHub publishes GPT Image request limits through its Endpoint offer", () => {
  const offer = endpointOffers(createHypiHubProvider()).find((item) => item.capability.name === "gpt-image-2");
  assert.ok(offer);
  assert.deepEqual(offer.supports?.({
    capability: offer.capability,
    returns: offer.returns,
    constraints: {
      fields: {
        prompt: ["cutout"], aspectRatio: ["1:1"], resolution: ["2K"], background: ["opaque"],
      },
    },
  }), {
    status: "unsupported",
    reason: "HypiHub GPT Image 2 accepts the background option only at 1K; omit it at 2K",
  });
});

test("HypiHub derives credential acquisition from its configured service origin", () => {
  const [credential] = createHypiHubProvider({
    baseUrl: "https://gateway.example.test/v1",
    oauthRequestTimeoutMs: 12_000,
  }).credentials;
  assert.equal(credential?.acquisition?.authorizationEndpoint, "https://gateway.example.test/oauth/consent");
  assert.equal(credential?.acquisition?.tokenEndpoint, "https://gateway.example.test/oauth/token");
  assert.equal(credential?.acquisition?.requestTimeoutMs, 12_000);
});

test("HypiHub returns its current model-pricing document", async () => {
  const provider = createHypiHubProvider({
    pricingRequestTimeoutMs: 1_000,
    fetch: async (input, init) => {
      assert.equal(String(input), "https://hypit.ai/v1/pricing?model=seedance-2");
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-key");
      assert.equal((init?.headers as Record<string, string>)["user-agent"],
        `hypit-provider-hypihub/${packageVersion}`);
      return Response.json({
        object: "model_pricing",
        model: "seedance-2",
        pricing: { mode: "per_second", per_second_usd: 0.1045 },
      });
    },
  });
  const request = {
    capability: seedanceEndpoints.standard!.capability,
    returns: seedanceEndpoints.standard!.returns,
    constraints: sealSeedanceRequest("seedance-2", {
    prompt: ["A presenter speaks to camera."], resolution: ["720p"], aspectRatio: ["9:16"],
    duration: [5], generateAudio: [true], webSearch: [false],
    }) as unknown as CanonicalValue,
  };
  assert.deepEqual(await provider.readPricing!({
    request,
    credentials: async () => ({ apiKey: { secret: "test-key" } }),
  }), [{
    source: "https://hypit.ai/v1/pricing?model=seedance-2",
    data: {
      object: "model_pricing",
      model: "seedance-2",
      pricing: { mode: "per_second", per_second_usd: 0.1045 },
    },
  }]);
});

test("HypiHub reads model pricing for a concrete canonical request", async () => {
  const rateCard = {
    object: "model_pricing", model: "gpt-image-2",
    pricing: { mode: "per_image", per_image_usd: 0.03 },
    operations: [
      { operation: "text-to-image", pricing: { mode: "per_image", per_image_usd: 0.03 } },
      { operation: "image-to-image", pricing: { mode: "per_image", per_image_usd: 0.05 } },
    ],
  };
  const provider = createHypiHubProvider({
    pricingRequestTimeoutMs: 1_000,
    fetch: async (input) => {
      assert.equal(String(input), "https://hypit.ai/v1/pricing?model=gpt-image-2");
      return Response.json(rateCard);
    },
  });
  const request = {
    capability: { module: { name: "@hypit/gpt-image", version: "1" }, name: "gpt-image-2" },
    returns: generationTypes.imageSet,
    constraints: {
      fields: { prompt: ["A portrait."], aspectRatio: ["9:16"], resolution: ["1K"] },
    },
  } as const;
  const [document] = await provider.readPricing!({
    request,
    credentials: async () => ({ apiKey: { secret: "test-key" } }),
  });
  assert.deepEqual(document?.data, rateCard);
});

test("HypiHub doctor leaves expired OAuth refresh validity unknown without misidentifying the Store", async () => {
  const diagnostics = await diagnoseHypiHubProvider({ fetch: async () => {
    throw new Error("Read-only doctor must not rotate an expired credential");
  } }, {
    credentials: { apiKey: { secret: encodeOAuth2Credential({
      accessToken: "expired", refreshToken: "unverified-refresh", expiresAt: Date.now() - 1_000,
    }) } },
    capabilities: [whisperXCapabilities.transcription],
  });
  assert.equal(diagnostics[0]?.code, "HYPIHUB_OAUTH_REFRESH_UNCHECKED");
  assert.equal(diagnostics[0]?.severity, "warning");
  assert.doesNotMatch(diagnostics[0]!.message, /credential is read-only/u);
});

test("HypiHub doctor checks the authenticated catalogue only when actively invoked", async () => {
  let calls = 0;
  const diagnostics = await diagnoseHypiHubProvider({ fetch: async (input, init) => {
    calls += 1;
    assert.match(String(input), /\/v1\/models$/u);
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-key");
    return Response.json({ data: [{ id: "victor-upmeet/whisperx", endpoints: ["transcriptions"] }] });
  } }, {
    credentials: { apiKey: { secret: "test-key" } },
    capabilities: [whisperXCapabilities.transcription],
  });
  assert.equal(calls, 1);
  assert.deepEqual(diagnostics, []);
});

test("HypiHub doctor recognizes the canonical cards returned by the service", async () => {
  const cards = [
    { id: "gpt-image-2", endpoints: ["images", "image_edits"] },
    { id: "seedream-5-lite", endpoints: ["images", "image_edits"] },
    { id: "minimax-h3", endpoints: ["videos"] },
    { id: "grok-imagine-video", endpoints: ["videos"] },
    { id: "seedance-2-mini", endpoints: ["videos"] },
  ];
  const capabilities = [
    { module: { name: "@hypit/gpt-image", version: "1" }, name: "gpt-image-2" },
    { module: { name: "@hypit/seedream", version: "1" }, name: "seedream-5-lite" },
    { module: { name: "@hypit/minimax-h3", version: "1" }, name: "minimax-h3" },
    { module: { name: "@hypit/grok-imagine", version: "1" }, name: "grok-imagine-video" },
    seedanceEndpoints.mini!.capability,
    { module: { name: "@hypit/grok-imagine", version: "1" }, name: "grok-imagine-video-1.5-preview" },
  ];
  const diagnostics = await diagnoseHypiHubProvider({
    fetch: async () => Response.json({ data: cards }),
  }, { credentials: { apiKey: { secret: "test-key" } }, capabilities });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "HYPIHUB_CAPABILITY_UNAVAILABLE");
  assert.match(diagnostics[0]!.message, /grok-imagine-video-1\.5-preview/u);
});

test("HypiHub declares both MiMo speech capabilities; who serves them is the Profile's binding", async () => {
  const registry = new EndpointRegistry();
  await installEndpoint(createHypiHubProvider({ fetch: async () => { throw new Error("audio must not call fetch"); } }), registry);
  const needs = Object.values(mimoSpeechEndpoints).map((endpoint) => ({
    id: `need:hypihub-${endpoint.key}`,
    capability: endpoint.capability,
    returns: endpoint.returns,
    constraints: { fields: {} },
    result: `record:hypihub-${endpoint.key}`,
  }));
  assert.ok(needs.every((item) => registry.select(item).status === "resolved"));

  // A second Endpoint offering the same capability makes the choice the deployment's, not the Provider's.
  const other = defineEndpoint({
    instance: "mimo.official",
    pool: "mimo.official",
    capabilities: [{
      capability: mimoSpeechEndpoints.voiceDesign.capability,
      returns: mimoSpeechEndpoints.voiceDesign.returns,
      lifecycle: "immediate",
      handler: () => ({ value: (null) }),
    }],
  });
  await installEndpoint(other, registry);
  assert.equal(registry.select(needs[0]!).status, "ambiguous");
  registry.bind(mimoSpeechEndpoints.voiceDesign.capability, "mimo.official");
  const resolved = registry.select(needs[0]!);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.status === "resolved" ? resolved.registration.id : undefined, "mimo.official");
});
