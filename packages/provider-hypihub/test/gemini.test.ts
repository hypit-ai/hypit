import assert from "node:assert/strict";
import test from "node:test";

import { createHypiHubGeminiGenerator } from "../src/gemini.js";

test("HypiHub Gemini uses native wire format for text, image and video parts", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> | undefined;
  let uploads = 0;
  const generate = createHypiHubGeminiGenerator({
    apiKey: "test-key",
    model: "gemini-3.1-pro",
    baseUrl: "https://hypit.ai/v1",
    fetch: async (input, init) => {
      seenUrl = String(input);
      if (seenUrl.endsWith("/v1/files/uploads")) {
        uploads += 1;
        return Response.json({
          upload_mode: "s3_multipart",
          upload_id: `up_native_${uploads}`,
          part_size: 16,
          part_count: 1,
          concurrency: 2,
        });
      }
      const parts = /\/v1\/files\/uploads\/(up_native_\d+)\/parts$/u.exec(seenUrl);
      if (parts) {
        const body = JSON.parse(String(init?.body)) as {
          readonly parts: readonly { readonly bytes: number; readonly checksum_sha256: string }[];
        };
        return Response.json({ parts: [{
          part_number: 1,
          url: `https://s3.example/${parts[1]}?signature=secret`,
          headers: {
            "content-length": String(body.parts[0]?.bytes),
            "x-amz-checksum-sha256": body.parts[0]?.checksum_sha256,
          },
        }] });
      }
      if (seenUrl.startsWith("https://s3.example/up_native_")) {
        return new Response(null, { headers: { etag: "part" } });
      }
      const completed = /\/v1\/files\/uploads\/(up_native_\d+)\/complete$/u.exec(seenUrl);
      if (completed) {
        return Response.json({ url: `https://hypit.ai/files/ref-${completed[1]}.png` });
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
  assert.equal(seenUrl, "https://hypit.ai/v1beta/models/gemini-3.1-pro:generateContent");
  assert.equal(uploads, 2);
  assert.deepEqual(seenBody?.contents, [{ role: "user", parts: [
    { text: "inspect" },
    { fileData: { mimeType: "image/png", fileUri: "https://hypit.ai/files/ref-up_native_1.png" } },
    { fileData: { mimeType: "video/mp4", fileUri: "https://hypit.ai/files/ref-up_native_2.png" } },
  ] }]);
});

test("HypiHub Gemini points unavailable models to HypiHub", async () => {
  const generate = createHypiHubGeminiGenerator({
    apiKey: "test-key",
    fetch: async () => new Response("missing", { status: 404 }),
  });
  await assert.rejects(() => generate({ instruction: "x", parts: [{ text: "x" }] }),
    /sign in to HypiHub at https:\/\/hypit\.ai with hypit auth login/iu);
});

test("HypiHub Gemini retries upstream rate limits without reuploading files", async () => {
  let uploads = 0;
  let generations = 0;
  const generate = createHypiHubGeminiGenerator({
    apiKey: "test-key",
    maxRateLimitRetries: 2,
    rateLimitRetryDelayMs: 1,
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/files/uploads")) {
        uploads += 1;
        return Response.json({
          upload_mode: "s3_multipart",
          upload_id: "up_retry",
          part_size: 16,
          part_count: 1,
          concurrency: 1,
        });
      }
      if (url.endsWith("/v1/files/uploads/up_retry/parts")) {
        const body = JSON.parse(String(init?.body)) as {
          readonly parts: readonly { readonly checksum_sha256: string }[];
        };
        return Response.json({ parts: [{
          part_number: 1,
          url: "https://s3.example/retry?signature=secret",
          headers: {
            "content-length": "5",
            "x-amz-checksum-sha256": body.parts[0]?.checksum_sha256,
          },
        }] });
      }
      if (url.startsWith("https://s3.example/retry")) {
        return new Response(null, { headers: { etag: "part" } });
      }
      if (url.endsWith("/v1/files/uploads/up_retry/complete")) {
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
