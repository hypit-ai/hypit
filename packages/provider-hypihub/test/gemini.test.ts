import assert from "node:assert/strict";
import test from "node:test";

import { createHypiHubGeminiGenerator } from "../src/gemini.js";

test("Gemini honors configured concurrency while uploading a batch of unique references", async () => {
  let active = 0; let peak = 0; let created = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const generate = createHypiHubGeminiGenerator({ apiKey: "gemini-capacity-test", uploadConcurrency: 3, logger: () => {}, fetch: async (resource, init) => {
    const url = String(resource);
    if (url.endsWith("/files/uploads")) {
      created += 1; active += 1; peak = Math.max(peak, active);
      return Response.json({ upload_mode: "s3_multipart", upload_id: `up_${created}`, part_size: 16, part_count: 1, concurrency: 4 });
    }
    if (url.endsWith("/parts")) {
      const body = JSON.parse(String(init?.body)) as { parts: { checksum_sha256: string }[] };
      return Response.json({ parts: [{ part_number: 1, url: "https://s3.test/part", headers: { "content-length": "1", "x-amz-checksum-sha256": body.parts[0]!.checksum_sha256 } }] });
    }
    if (url === "https://s3.test/part") return new Response(null, { headers: { etag: "etag" } });
    if (url.endsWith("/complete")) { await barrier; active -= 1; return Response.json({ url: "https://hub.test/files/ref" }); }
    assert.equal(active, 0); assert.equal(created, 12);
    return Response.json({ candidates: [{ content: { parts: [{ text: "OK" }] } }] });
  } });
  const result = generate({ instruction: "inspect", parts: Array.from({ length: 12 }, (_, i) => ({ inlineData: { mimeType: "image/png", data: Buffer.from([i]).toString("base64") } })) });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(created, 3);
  release(); assert.equal(await result, "OK"); assert.equal(peak, 3);
});

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
        return Response.json({ upload_mode: "s3_multipart", upload_id: `up_native_${uploads}`, part_size: 16, part_count: 1, concurrency: 4 });
      }
      const uploadMatch = /\/v1\/files\/uploads\/(up_native_\d+)\/parts$/u.exec(seenUrl);
      if (uploadMatch) {
        const body = JSON.parse(String(init?.body)) as { parts: readonly { checksum_sha256: string }[] };
        return Response.json({ parts: [{ part_number: 1, url: `https://s3.example/${uploadMatch[1]}`, headers: { "content-length": "5", "x-amz-checksum-sha256": body.parts[0]?.checksum_sha256 } }] });
      }
      if (seenUrl.startsWith("https://s3.example/")) return new Response(null, { status: 200, headers: { etag: '"part"' } });
      const completeMatch = /\/v1\/files\/uploads\/(up_native_\d+)\/complete$/u.exec(seenUrl);
      if (completeMatch) return Response.json({ url: `https://hypit.ai/files/ref-${completeMatch[1]}.png` });
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

test("HypiHub Gemini reports unavailable models without misdiagnosing authentication", async () => {
  const generate = createHypiHubGeminiGenerator({
    apiKey: "test-key",
    fetch: async () => new Response("missing", { status: 404 }),
  });
  await assert.rejects(() => generate({ instruction: "x", parts: [{ text: "x" }] }), (error) => {
    assert.match(String(error), /HTTP 404/iu);
    assert.doesNotMatch(String(error), /auth login/iu);
    return true;
  });
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
        return Response.json({ upload_mode: "s3_multipart", upload_id: "up_retry", part_size: 16, part_count: 1, concurrency: 4 });
      }
      if (url.endsWith("/v1/files/uploads/up_retry/parts")) {
        const body = JSON.parse(String(init?.body)) as { parts: readonly { checksum_sha256: string }[] };
        return Response.json({ parts: [{ part_number: 1, url: "https://s3.example/retry", headers: { "content-length": "5", "x-amz-checksum-sha256": body.parts[0]?.checksum_sha256 } }] });
      }
      if (url === "https://s3.example/retry") return new Response(null, { status: 200, headers: { etag: '"part"' } });
      if (url.endsWith("/v1/files/uploads/up_retry/complete")) return Response.json({ url: "https://hypit.ai/files/ref" });
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

test("HypiHub Gemini uploads compressed media directly to regional S3", async () => {
  const calls: string[] = [];
  let generationBody: Record<string, unknown> | undefined;
  const generate = createHypiHubGeminiGenerator({
    apiKey: "test-key",
    baseUrl: "https://hypit.ai",
    fetch: async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/v1/files/uploads")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.equal(body.bytes, 5);
        assert.equal(body.mime_type, "image/webp");
        return Response.json({
          upload_mode: "s3_multipart",
          upload_id: "up_gemini",
          part_size: 16,
          part_count: 1,
          concurrency: 4,
        }, { status: 201 });
      }
      if (url.endsWith("/v1/files/uploads/up_gemini/parts")) {
        const body = JSON.parse(String(init?.body)) as {
          readonly parts: readonly { readonly checksum_sha256: string }[];
        };
        return Response.json({ parts: [{
          part_number: 1,
          url: "https://hypihub-prod-media-hk.s3.ap-east-1.amazonaws.com/opaque?signature=secret",
          headers: {
            "content-length": "5",
            "x-amz-checksum-sha256": body.parts[0]?.checksum_sha256,
          },
        }] });
      }
      if (url.startsWith("https://hypihub-prod-media-hk.s3.ap-east-1.amazonaws.com/")) {
        assert.equal(init?.method, "PUT");
        assert.deepEqual(new Uint8Array(await new Response(init?.body).arrayBuffer()),
          new Uint8Array(Buffer.from("small")));
        return new Response(null, { status: 200, headers: { etag: "\"gemini-part\"" } });
      }
      if (url.endsWith("/v1/files/uploads/up_gemini/complete")) {
        return Response.json({ url: "https://hypit.ai/files/as_gemini" });
      }
      if (url.includes(":generateContent")) {
        generationBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({ candidates: [{ content: { parts: [{ text: "OK" }] } }] });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  assert.equal(await generate({ instruction: "x", parts: [
    { text: "inspect" },
    { inlineData: { mimeType: "image/webp", data: Buffer.from("small").toString("base64") } },
  ] }), "OK");
  assert.equal(calls.some((url) => url.endsWith("/v1/files")), false);
  assert.equal(calls.some((url) => url.includes("s3-accelerate")), false);
  assert.deepEqual(generationBody?.contents, [{ role: "user", parts: [
    { text: "inspect" },
    { fileData: { mimeType: "image/webp", fileUri: "https://hypit.ai/files/as_gemini" } },
  ] }]);
});
