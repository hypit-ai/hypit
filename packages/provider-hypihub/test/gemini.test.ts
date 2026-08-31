import assert from "node:assert/strict";
import test from "node:test";

import { createHypiHubGeminiGenerator } from "../src/gemini.js";

test("HypiHub Gemini uses native wire format for text, image and video parts", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> | undefined;
  let uploads = 0;
  const generate = createHypiHubGeminiGenerator({
    apiKey: "test-key",
    model: "gemini-3.7-flash",
    baseUrl: "https://hypit.ai/v1",
    fetch: async (input, init) => {
      seenUrl = String(input);
      if (seenUrl.endsWith("/v1/files")) {
        uploads += 1;
        assert.equal(init?.method, "POST");
        assert.ok(init?.body instanceof FormData);
        return Response.json({ url: `https://hypit.ai/files/ref-${uploads}.png` });
      }
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
  assert.equal(uploads, 2);
  assert.deepEqual(seenBody?.contents, [{ role: "user", parts: [
    { text: "inspect" },
    { fileData: { mimeType: "image/png", fileUri: "https://hypit.ai/files/ref-1.png" } },
    { fileData: { mimeType: "video/mp4", fileUri: "https://hypit.ai/files/ref-2.png" } },
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

test("HypiHub Gemini retries upstream rate limits without reuploading files", async () => {
  let uploads = 0;
  let generations = 0;
  const generate = createHypiHubGeminiGenerator({
    apiKey: "test-key",
    maxRateLimitRetries: 2,
    rateLimitRetryDelayMs: 1,
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/files")) {
        uploads += 1;
        return Response.json({ url: "https://hypit.ai/files/ref" });
      }
      generations += 1;
      return generations < 3
        ? new Response("rate limited", { status: 429, headers: { "retry-after": "0" } })
        : Response.json({ candidates: [{ content: { parts: [{ text: "OK" }] } }] });
    },
  });
  assert.equal(await generate({ instruction: "x", parts: [
    { text: "x" }, { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
  ] }), "OK");
  assert.equal(uploads, 1);
  assert.equal(generations, 3);
});
