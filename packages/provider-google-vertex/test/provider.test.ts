import assert from "node:assert/strict";
import test from "node:test";

import {
  captionGeminiCapabilities,
  compileCaptionGeminiRequest,
  sealCaptionGeminiProgram,
} from "@svml/caption-gemini";
import {
  captionTypes,
  defaultCaptionTrackProgram,
  resolveCaptionProgram,
  sealCaptionStyle,
} from "@svml/caption";
import type { CaptionGeminiRequest, RawCaptionGeminiResponse } from "@svml/caption-gemini";
import { EndpointRegistry, MemoryArtifactStore } from "@svml/driver-node";
import type { ImmediateEndpointHandler } from "@svml/endpoint-kit";
import { digestOf } from "@svml/protocol";
import type { CanonicalValue, Need } from "@svml/protocol";
import {
  createGoogleVertexCaptionProvider,
  googleVertexProviderImplementationDigest,
} from "@svml/provider-google-vertex";
import type { GenerateCaptionContent } from "@svml/provider-google-vertex";
import { parseScript } from "@svml/script";

function request(): CaptionGeminiRequest {
  const narrative = parseScript("provider.svml", "<line><ALICE>Meaning becomes the source.</line>");
  const base = defaultCaptionTrackProgram("important");
  const style = sealCaptionStyle({
    contract: "svml.caption-style@1",
    id: "important",
    planning: {
      cueInstruction: "Prefer one short complete semantic phrase.",
      fields: [{
        id: "important",
        value: { kind: "enum", values: ["important"] },
        instruction: "Select at most two important words.",
        minimumPerCue: 0,
        maximumPerCue: 2,
      }],
    },
    presentation: { mode: "whole", stackingOrder: 100, style: base.style },
  });
  const captionProgram = resolveCaptionProgram(narrative, "captions", style, []);
  return compileCaptionGeminiRequest(narrative, captionProgram, sealCaptionGeminiProgram({
    contract: "svml.caption-gemini-program@1",
    model: "gemini-2.5-flash",
  }));
}

function response(requestValue: CaptionGeminiRequest): RawCaptionGeminiResponse {
  return { runs: requestValue.runs.map((run) => ({
    run_id: run.id,
    cues: [{
      after_atom_id: run.atomIds.at(-1)!,
      fields: [{ declaration_id: "important", atom_id: run.atomIds[0]!, value: "important" }],
    }],
  })) };
}

function need(requestValue: CaptionGeminiRequest): Need {
  const constraints = requestValue as unknown as CanonicalValue;
  return {
    id: "need:caption-gemini",
    capability: captionGeminiCapabilities.plan,
    returns: captionTypes.plan,
    constraints,
    requestedBy: "derivation:caption-gemini",
    result: "record:caption-gemini",
    accepts: "exact",
    conformanceFloor: "exact",
    requestDigest: digestOf({ capability: captionGeminiCapabilities.plan, constraints }),
  };
}

test("Vertex transports the exact model request while the model package validates the result", async () => {
  const requestValue = request();
  let captured: Parameters<GenerateCaptionContent>[0] | undefined;
  const provider = createGoogleVertexCaptionProvider({
    project: "svml-test-project",
    location: "global",
    generateContentImplementationDigest: digestOf("caption-gemini:test-transport"),
    generateContent: async (input) => {
      captured = input;
      return {
        text: JSON.stringify(response(requestValue)),
        totalTokenCount: 123,
        modelVersion: "gemini-2.5-flash-001",
      };
    },
  });
  const registry = new EndpointRegistry();
  await provider.install(registry);
  const requestNeed = need(requestValue);
  const resolution = registry.resolve(requestNeed);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  const handler: ImmediateEndpointHandler = resolution.registration.handler;
  const result = await handler({
    command: { kind: "fulfill-need", id: "command:caption-gemini", need: requestNeed },
    need: requestNeed,
    artifacts: new MemoryArtifactStore(),
    credentials: { googleCredentials: { secret: JSON.stringify({ type: "service_account" }) } },
  });
  assert.equal(captured?.model, "gemini-2.5-flash");
  assert.equal(captured?.prompt, requestValue.prompt);
  assert.equal(captured?.systemInstruction, requestValue.systemInstruction);
  assert.equal(captured?.temperature, 0.2);
  assert.equal(result.value.kind, "inline");
  const plan = result.value.kind === "inline" ? result.value.value as Record<string, unknown> : {};
  assert.equal(plan.contract, "svml.caption-plan@1");
  assert.equal((result.metadata as Record<string, unknown>).provider, "google-vertex");
});

test("Vertex configuration exposes credential/queue policy without changing the model request", () => {
  const provider = createGoogleVertexCaptionProvider({ project: "svml-test-project", defaultConcurrency: 3 });
  assert.equal(provider.name, "google-vertex.caption");
  const facet = provider.manifest.facets[0];
  assert.equal(facet?.role, "capability-endpoint");
  assert(facet?.role === "capability-endpoint");
  assert.equal(facet.defaultConcurrency, 3);
  assert.deepEqual(facet.credentialSlots, ["googleCredentials"]);
  assert.deepEqual(provider.bindings, [{
    capability: captionGeminiCapabilities.plan,
    returns: captionTypes.plan,
    endpoint: "google-vertex.caption",
  }]);
  assert.equal(facet.implementation.digest, googleVertexProviderImplementationDigest);
});
