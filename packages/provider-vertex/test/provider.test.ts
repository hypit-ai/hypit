import assert from "node:assert/strict";
import test from "node:test";

import { EndpointRegistry } from "@hypit/driver-node";
import { geminiCapabilities } from "@hypit/gemini";
import { credentialRef } from "@hypit/runtime";
import { textTypes } from "@hypit/text";

import { createVertexProvider } from "../src/provider.js";

test("Vertex Runtime provider exposes the same provider-neutral Gemini capabilities", async () => {
  const registry = new EndpointRegistry();
  const provider = createVertexProvider({
    project: credentialRef("env", "GOOGLE_CLOUD_PROJECT"),
    credentials: credentialRef("env", "GOOGLE_APPLICATION_CREDENTIALS_JSON"),
  });
  await provider.install(registry);
  for (const model of ["gemini-3.7-flash-openai"] as const) {
    const resolution = registry.resolve({
      id: `need:${model}`,
      capability: geminiCapabilities[model],
      returns: textTypes.text,
      constraints: { instruction: "x", prompt: "x", media: [] },
      result: `record:${model}`,
    });
    assert.equal(resolution.status, "resolved");
    assert.equal(resolution.registration.kind, "immediate");
  }
  assert.deepEqual(provider.credentials.map((item) => ({ slot: item.slot, kind: item.kind })), [
    { slot: "credentials", kind: "json" },
    { slot: "project", kind: "secret" },
  ]);
});
