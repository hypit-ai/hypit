import assert from "node:assert/strict";
import test from "node:test";

import { createHypiHubGeminiGenerator } from "../src/gemini.js";

test("HypiHub Gemini uses native wire format for text, image and video parts", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> | undefined;
  const generate = createHypiHubGeminiGenerator({
    apiKey: "test-key",
    model: "gemini-3.7-flash",
    baseUrl: "https://hypit.ai/v1",
    fetch: async (input, init) => {
      seenUrl = String(input);
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ candidates: [{ content: { parts: [{ text: "OK" }] } }] });
    },
  });

  assert.equal(await generate({ instruction: "Answer briefly.", parts: [
    { text: "inspect" },
    { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
    { inlineData: { mimeType: "video/mp4", data: "dmlkZW8=" } },
  ] }), "OK");
  assert.equal(seenUrl, "https://hypit.ai/v1beta/models/gemini-3.7-flash:generateContent");
  assert.deepEqual(seenBody?.contents, [{ role: "user", parts: [
    { text: "inspect" },
    { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
    { inlineData: { mimeType: "video/mp4", data: "dmlkZW8=" } },
  ] }]);
});

test("HypiHub Gemini points unavailable models to HypiHub", async () => {
  const generate = createHypiHubGeminiGenerator({
    apiKey: "test-key",
    fetch: async () => new Response("missing", { status: 404 }),
  });
  await assert.rejects(() => generate({ instruction: "x", parts: [{ text: "x" }] }),
    /get a HypiHub key with this model enabled at https:\/\/hypit\.ai/iu);
});
