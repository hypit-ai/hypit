import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { serveFile } from "../src/build/artifacts.js";

const BODY = "0123456789abcdefghij";

async function withServer<T>(
  path: string,
  run: (base: string) => Promise<T>,
): Promise<T> {
  const server = createServer((request, response) => {
    void serveFile(request, response, path, "video/mp4");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-serve-"));
  const path = join(directory, "final.mp4");
  writeFileSync(path, BODY, "utf8");
  return path;
}

test("a whole file is served with a length and a range offer", async () => {
  await withServer(fixture(), async (base) => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    // Without this a browser will not even attempt to seek.
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("content-length"), String(BODY.length));
    assert.equal(await response.text(), BODY);
  });
});

test("a range request is answered with exactly that range", async () => {
  await withServer(fixture(), async (base) => {
    const response = await fetch(`${base}/`, { headers: { range: "bytes=4-8" } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes 4-8/${BODY.length}`);
    assert.equal(response.headers.get("content-length"), "5");
    assert.equal(await response.text(), "456789abcdefghij".slice(0, 5));
  });
});

test("an open-ended range runs to the last byte", async () => {
  await withServer(fixture(), async (base) => {
    const response = await fetch(`${base}/`, { headers: { range: "bytes=15-" } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes 15-19/${BODY.length}`);
    assert.equal(await response.text(), "fghij");
  });
});

test("a suffix range asks for the last bytes", async () => {
  await withServer(fixture(), async (base) => {
    const response = await fetch(`${base}/`, { headers: { range: "bytes=-4" } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes 16-19/${BODY.length}`);
    assert.equal(await response.text(), "ghij");
  });
});

test("a range past the end falls back to the whole file", async () => {
  await withServer(fixture(), async (base) => {
    const response = await fetch(`${base}/`, { headers: { range: "bytes=999-" } });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), BODY);
  });
});

test("HEAD reports the size without a body", async () => {
  await withServer(fixture(), async (base) => {
    const response = await fetch(`${base}/`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-length"), String(BODY.length));
    assert.equal(await response.text(), "");
  });
});

test("a missing file is a 404 rather than a broken stream", async () => {
  await withServer(join(tmpdir(), "svml-playground-absent.mp4"), async (base) => {
    assert.equal((await fetch(`${base}/`)).status, 404);
  });
});
