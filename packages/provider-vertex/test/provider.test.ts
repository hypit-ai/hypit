import assert from "node:assert/strict";
import test from "node:test";

import { EndpointRegistry } from "@hypit/driver-node";
import { geminiCapabilities, geminiTypes } from "@hypit/gemini";
import { credentialRef } from "@hypit/runtime";

import { createVertexProvider } from "../src/provider.js";
import { vertexModelId } from "../src/gemini.js";

test("Vertex Runtime provider exposes the same provider-neutral Gemini capabilities", async () => {
  const registry = new EndpointRegistry();
  const provider = createVertexProvider({
    project: credentialRef("env", "GOOGLE_CLOUD_PROJECT"),
    credentials: credentialRef("env", "GOOGLE_APPLICATION_CREDENTIALS_JSON"),
  });
  await provider.install(registry);
  for (const model of ["gemini-3.1-pro"] as const) {
    const resolution = registry.resolve({
      capability: geminiCapabilities[model],
      returns: geminiTypes.visualObservation,
      constraints: { instruction: "x", prompt: "x", media: [] },
    });
    assert.equal(resolution.status, "resolved");
    assert.equal(resolution.registration.kind, "immediate");
  }
  assert.deepEqual(provider.credentials.map((item) => ({ slot: item.slot, kind: item.kind })), [
    { slot: "credentials", kind: "json" },
    { slot: "project", kind: "secret" },
  ]);
});

test("Vertex model ids fail closed", () => {
  assert.equal(vertexModelId("gemini-3.1-pro"), "gemini-3.1-pro-preview");
  assert.throws(() => vertexModelId("gemini-99"), /no published model id for gemini-99/u);
});
