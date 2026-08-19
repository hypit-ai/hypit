import assert from "node:assert/strict";
import test from "node:test";

import {
  captionGeminiCapabilities,
  compileCaptionGeminiRequest,
  sealCaptionGeminiProgram,
} from "@hypit/caption-gemini";
import {
  captionTypes,
  resolveCaptionProgram,
  sealCaptionStyle,
} from "@hypit/caption";
import type { CaptionGeminiRequest, RawCaptionGeminiResponse } from "@hypit/caption-gemini";
import { EndpointRegistry, MemoryArtifactStore } from "@hypit/driver-node";
import type { ImmediateEndpointHandler } from "@hypit/endpoint-kit";
import type { CanonicalValue, Need } from "@hypit/protocol";
import { createGoogleVertexCaptionProvider } from "@hypit/provider-google-vertex";
import type { GenerateCaptionContent } from "@hypit/provider-google-vertex";
import { captionDisplaySequence, parseScript } from "@hypit/script";

function request(): CaptionGeminiRequest {
  const narrative = parseScript("provider.svml", "<line><ALICE>Meaning becomes the source.</line>");
  const display = captionDisplaySequence(narrative, "story.caption");
  const style = sealCaptionStyle({

    id: "important",
    planning: {
      cue: { minimumWords: 1, maximumWords: 7, instruction: "Prefer one short complete semantic phrase." },
      fields: [{
        id: "important",
        value: { kind: "enum", values: ["important"] },
        instruction: "Select at most two important words.",
        minimumPerCue: 0,
        maximumPerCue: 2,
      }],
    },
    rendering: { family: "test-caption@1", parameters: {} },
  });
  const captionProgram = resolveCaptionProgram(display, "captions", style, []);
  return compileCaptionGeminiRequest(display, captionProgram, sealCaptionGeminiProgram({

    model: "gemini-2.5-flash",
  }));
}

function response(requestValue: CaptionGeminiRequest): RawCaptionGeminiResponse {
  return { runs: requestValue.runs.map((run) => ({
    cues: [{
      atom_count: run.atoms.length,
      fields: [{ declaration_id: "important", atom_number: 1, word_number: 1, value: "important" }],
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
    result: "record:caption-gemini",
  };
}

test("Vertex transports the exact model request while the model package validates the result", async () => {
  const requestValue = request();
  let captured: Parameters<GenerateCaptionContent>[0] | undefined;
  const provider = createGoogleVertexCaptionProvider({
    project: "hypit-test-project",
    location: "global",
    generateContent: async (input) => {
      captured = input;
      return {
        text: JSON.stringify(response(requestValue)),
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
});

test("Vertex configuration exposes credential/queue policy without changing the model request", () => {
  const provider = createGoogleVertexCaptionProvider({ project: "hypit-test-project", defaultConcurrency: 3 });
  assert.equal(provider.instance.id, "google-vertex.caption");
  assert.deepEqual(provider.offers, [{
    capability: captionGeminiCapabilities.plan,
    returns: captionTypes.plan,
    endpoint: "google-vertex.caption",
  }]);
});

test("Vertex defers projectEnv resolution until the Endpoint handles a Need", async () => {
  const variable = "HYPIT_TEST_MISSING_VERTEX_PROJECT";
  const previous = process.env[variable];
  delete process.env[variable];
  try {
    const provider = createGoogleVertexCaptionProvider({
      projectEnv: variable,
      generateContent: async () => {
        throw new Error("transport must not be reached");
      },
    });
    const registry = new EndpointRegistry();
    await provider.install(registry);
    const requestNeed = need(request());
    const resolution = registry.resolve(requestNeed);
    assert.equal(resolution.status, "resolved");
    assert.equal(resolution.registration.kind, "immediate");
    const handler: ImmediateEndpointHandler = resolution.registration.handler;
    await assert.rejects(async () => await handler({
      command: { kind: "fulfill-need", id: "command:caption-gemini-missing-project", need: requestNeed },
      need: requestNeed,
      artifacts: new MemoryArtifactStore(),
      credentials: { googleCredentials: { secret: JSON.stringify({ type: "service_account" }) } },
    }), new RegExp(`Google Vertex project environment ${variable} is empty`));
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }
});
