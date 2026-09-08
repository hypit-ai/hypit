import assert from "node:assert/strict";
import { test } from "node:test";
import { HypiHubUploader } from "../src/upload.js";

const input = { bytes: new Uint8Array([1, 2, 3, 4]), mediaType: "video/mp4" };
const retry = (status: number, code = "rate_limited") => Response.json({ error: { code } }, { status, headers: { "retry-after": "0" } });
function fixture(hook: (url: string, init: RequestInit, calls: string[]) => Response | undefined | Promise<Response | undefined> = () => undefined) {
  const calls: string[] = [];
  const logs: string[] = [];
  const fetcher: typeof fetch = async (resource, init = {}) => {
    const url = String(resource);
    calls.push(`${init.method} ${url}`);
    const override = await hook(url, init, calls);
    if (override !== undefined) return override;
    if (url.endsWith("/files/uploads")) return Response.json({ upload_mode: "s3_multipart", upload_id: "up_test", part_size: 16, part_count: 1, concurrency: 4 });
    if (url.endsWith("/parts")) {
      const body = JSON.parse(String(init.body)) as { parts: { part_number: number; bytes: number; checksum_sha256: string }[] };
      return Response.json({ parts: body.parts.map((p) => ({ part_number: p.part_number, url: `https://s3.test/${p.part_number}`, headers: { "content-length": String(p.bytes), "x-amz-checksum-sha256": p.checksum_sha256 } })) });
    }
    if (url.startsWith("https://s3.test/")) return new Response(null, { headers: { etag: "etag" } });
    if (url.endsWith("/complete")) return Response.json({ url: "https://hub.test/files/result" });
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    throw new Error(`unexpected request ${url}`);
  };
  const uploader = () => new HypiHubUploader({ baseUrl: "https://hub.test", requestTimeoutMs: 5000, uploadPartAttempts: 1, fetch: fetcher, logger: (message) => logs.push(message) });
  return { uploader, calls, logs };
}

test("completion retries HTML 502 and 429 on the same session without creating another upload", async () => {
  let completes = 0;
  const f = fixture((url) => {
    if (!url.endsWith("/complete")) return;
    completes += 1;
    if (completes === 1) return new Response("<html>gateway</html>", { status: 502, headers: { "retry-after": "0" } });
    if (completes === 2) return retry(429);
  });
  assert.equal(await f.uploader().upload(input, "test-key"), "https://hub.test/files/result");
  assert.equal(completes, 3);
  assert.equal(f.calls.filter((c) => c.endsWith("/files/uploads")).length, 1);
  assert.equal(f.calls.filter((c) => c.startsWith("DELETE")).length, 0);
});

test("part signing retries and cancellation survives a transient gateway failure", async () => {
  let signs = 0;
  let cancels = 0;
  const f = fixture((url, init) => {
    if (url.endsWith("/parts") && ++signs === 1) return retry(429);
    if (url.startsWith("https://s3.test")) return new Response(null, { status: 400 });
    if (init.method === "DELETE" && ++cancels === 1) return retry(502);
  });
  await assert.rejects(f.uploader().upload(input, "test-key"), /S3 upload part 1 failed/u);
  assert.equal(signs, 2);
  assert.equal(cancels, 2);
  assert.equal(f.calls.filter((c) => c.endsWith("/files/uploads")).length, 1);
});

test("new sessions retry explicit temporary rejection, but never an unknown creation result", async () => {
  for (const mode of ["network", "500", "daily", "storage", "429"] as const) {
    let creates = 0;
    const f = fixture((url) => {
      if (!url.endsWith("/files/uploads")) return;
      creates += 1;
      if (mode === "network") throw new TypeError("fetch failed");
      if (mode === "500") return retry(500);
      if (mode === "daily") return retry(429, "upload_daily_limit");
      if (mode === "storage") return retry(429, "upload_storage_limit");
      if (creates === 1) return retry(429, "upload_concurrency_limit");
    });
    if (mode === "429") { await f.uploader().upload(input, "test-key"); assert.equal(creates, 2); }
    else { await assert.rejects(f.uploader().upload(input, "test-key")); assert.equal(creates, 1); }
  }
});

test("lifecycle retries are bounded and an unconfirmed cancellation retains its diagnostic id", async () => {
  const f = fixture((url, init) => {
    if (url.endsWith("/complete") || init.method === "DELETE") return retry(503);
  });
  await assert.rejects(f.uploader().upload(input, "test-key"), /503/u);
  assert.equal(f.calls.filter((c) => c.endsWith("/complete")).length, 4);
  assert.equal(f.calls.filter((c) => c.startsWith("DELETE")).length, 4);
  assert(f.logs.some((line) => line.includes("cancellation still pending upload=up_test")));
  assert(!f.logs.some((line) => line.includes("test-key")));
});

test("a Retry-After beyond the retry budget is not shortened or retried early", async () => {
  const f = fixture((url) => url.endsWith("/complete")
    ? new Response(null, { status: 429, headers: { "retry-after": "60" } }) : undefined);
  await assert.rejects(f.uploader().upload(input, "test-key"), /429/u);
  assert.equal(f.calls.filter((c) => c.endsWith("/complete")).length, 1);
});

test("file concurrency is shared across uploader instances for the same origin and credential", async () => {
  let active = 0;
  let maximum = 0;
  let nextId = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const f = fixture(async (url) => {
    if (url.endsWith("/files/uploads")) {
      active += 1; maximum = Math.max(maximum, active); nextId += 1;
      return Response.json({ upload_mode: "s3_multipart", upload_id: `up_${nextId}`, part_size: 16, part_count: 1, concurrency: 4 });
    }
    if (url.endsWith("/complete")) {
      await barrier; active -= 1;
      return Response.json({ url: "https://hub.test/files/result" });
    }
  });
  const uploads = Array.from({ length: 6 }, () => f.uploader().upload(input, "test-key"));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(nextId, 2);
  release();
  await Promise.all(uploads);
  assert.equal(nextId, 6); assert.equal(maximum, 2); assert.equal(active, 0);
});

test("cancellation waits for other in-flight part workers to settle", async () => {
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const f = fixture(async (url) => {
    if (url.endsWith("/files/uploads")) return Response.json({ upload_mode: "s3_multipart", upload_id: "up_test", part_size: 2, part_count: 2, concurrency: 2 });
    if (url === "https://s3.test/1") return new Response(null, { status: 400 });
    if (url === "https://s3.test/2") { await barrier; return new Response(null, { headers: { etag: "etag" } }); }
  });
  const result = assert.rejects(f.uploader().upload(input, "test-key"), /S3 upload part 1 failed/u);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.calls.filter((c) => c.startsWith("DELETE")).length, 0);
  release(); await result;
  assert.equal(f.calls.filter((c) => c.startsWith("DELETE")).length, 1);
});

test("invalid negotiated policy still cancels its known upload session", async () => {
  const f = fixture((url) => url.endsWith("/files/uploads")
    ? Response.json({ upload_mode: "s3_multipart", upload_id: "up_test", part_size: 0 }) : undefined);
  await assert.rejects(f.uploader().upload(input, "test-key"), /part size/u);
  assert.equal(f.calls.filter((c) => c.startsWith("DELETE")).length, 1);
});
