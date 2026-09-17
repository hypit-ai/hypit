import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";

import { artifactPath, collectArtifacts, inside, serveMedia } from "../src/artifacts.js";
import type { Artifact } from "../src/types.js";

// One 16×16 VP8 frame in a WebM container, produced offline with ffmpeg.
const video = Buffer.from(
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwH/////////EU2bdKtNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHLTbuMU6uEElTDZ1OsggEY7AEAAAAAAABoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmpSrXsYMPQkBNgIxMYXZmNjEuNy4xMDBXQYxMYXZmNjEuNy4xMDAWVK5ryK4BAAAAAAAAP9eBAXPFiNtN4AYzUKSynIEAIrWcg3VuZIiBAIaFVl9WUDiDgQEj44OEAmJaAOCQsIEQuoEQmoECVbCEVbmBARJUw2fXc3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2MS43LjEwMHNzsmPAi2PFiNtN4AYzUKSyZ8ihRaOHRU5DT0RFUkSHlExhdmM2MS4xOS4xMDEgbGlidnB4H0O2dajngQCjo4EAAIAQAgCdASoQABAAAEcIhYWIhYSIAgIADA1gAP7/q1CA",
  "base64",
);
const ffprobeAvailable = spawnSync("ffprobe", ["-version"], { stdio: "ignore", timeout: 5_000 }).status === 0;
const requiresFfprobe = { skip: ffprobeAvailable ? false : "ffprobe is required to verify genuine rendered video" };

async function directories(context: TestContext): Promise<{ root: string; output: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "surreel-artifacts-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, "run-output");
  await mkdir(output);
  return { root, output };
}

async function manifest(output: string, value: unknown): Promise<void> {
  await writeFile(join(output, "surreel-output.json"), JSON.stringify(value));
}

type Reply = { status: number; headers: IncomingHttpHeaders; body: Buffer };

async function mediaEndpoint(context: TestContext): Promise<(method?: string, range?: string) => Promise<Reply>> {
  const { output } = await directories(context);
  const path = join(output, "preview.webm");
  await writeFile(path, video);
  const artifact: Artifact = { id: randomUUID(), name: "Surreel preview.webm", mimeType: "video/webm", url: "/preview" };
  const server = createServer((incoming, response) => {
    void serveMedia(incoming, response, path, artifact).catch((error: unknown) => {
      if (!response.headersSent) response.writeHead(500);
      response.end(error instanceof Error ? error.message : "Media failure");
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  context.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return (method = "GET", range) => new Promise<Reply>((resolve, reject) => {
    const outgoing = request({
      host: "127.0.0.1", port: address.port, path: "/preview", method, agent: false,
      headers: range === undefined ? {} : { range },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
}

test("media GET and HEAD return accurate headers and preserve the exact video bytes", async (context) => {
  const get = await mediaEndpoint(context);
  const complete = await get();
  assert.equal(complete.status, 200);
  assert.equal(complete.headers["content-type"], "video/webm");
  assert.equal(complete.headers["content-length"], String(video.length));
  assert.equal(complete.headers["accept-ranges"], "bytes");
  assert.equal(complete.headers["content-range"], undefined);
  assert.match(String(complete.headers["content-disposition"]), /Surreel%20preview.webm/u);
  assert.deepEqual(complete.body, video);

  const head = await get("HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.headers["content-length"], String(video.length));
  assert.equal(head.headers["content-type"], "video/webm");
  assert.equal(head.body.length, 0);
});

test("media ranges handle bounded, open, suffix, single-byte, and oversized-end requests", async (context) => {
  const get = await mediaEndpoint(context);
  const ranges = [
    { range: "bytes=2-7", start: 2, end: 7 },
    { range: "bytes=10-", start: 10, end: video.length - 1 },
    { range: "bytes=-9", start: video.length - 9, end: video.length - 1 },
    { range: "bytes=-999999", start: 0, end: video.length - 1 },
    { range: "bytes=0-0", start: 0, end: 0 },
    { range: "bytes=5-999999", start: 5, end: video.length - 1 },
  ];
  for (const { range, start, end } of ranges) {
    const response = await get("GET", range);
    assert.equal(response.status, 206, range);
    assert.equal(response.headers["content-range"], `bytes ${start}-${end}/${video.length}`, range);
    assert.equal(response.headers["content-length"], String(end - start + 1), range);
    assert.deepEqual(response.body, video.subarray(start, end + 1), range);
  }
});

test("malformed and unsatisfiable media ranges return 416 without leaking a response body", async (context) => {
  const get = await mediaEndpoint(context);
  for (const range of ["", "items=0-1", "bytes=", "bytes=-", "bytes=-0", "bytes=5-2", "bytes=999999-",
    "bytes=1-2,4-5", "bytes=-5-10", "bytes=NaN-4", "bytes=9007199254740992-"]) {
    const response = await get("GET", range);
    assert.equal(response.status, 416, range);
    assert.equal(response.headers["content-range"], `bytes */${video.length}`, range);
    assert.equal(response.body.length, 0, range);
  }
});

test("publication copies only declared outputs and preserves their bytes", requiresFfprobe, async (context) => {
  const { root, output } = await directories(context);
  const id = randomUUID();
  await mkdir(join(output, "rendered"));
  await writeFile(join(output, "rendered", "preview.webm"), video);
  await writeFile(join(output, "undeclared.webm"), "This must never become an artifact.");
  await manifest(output, { artifacts: [{ path: "rendered/preview.webm", name: "  Launch preview  " }] });
  const artifacts = await collectArtifacts(root, id, output);
  assert.equal(artifacts.length, 1);
  const artifact = artifacts[0];
  assert.ok(artifact);
  assert.equal(artifact.name, "Launch preview");
  assert.equal(artifact.mimeType, "video/webm");
  assert.equal(artifact.url, `/api/projects/${id}/artifacts/${artifact.id}`);
  const copied = await artifactPath(root, id, artifact);
  assert.ok(inside(join(root, "exports", id), copied));
  assert.deepEqual(await readFile(copied), video);
  assert.deepEqual(await readdir(join(root, "exports", id)), [`${artifact.id}.webm`]);
});

test("an existing video is never published without an explicit valid output manifest", async (context) => {
  const { root, output } = await directories(context);
  const id = randomUUID();
  await writeFile(join(output, "preview.webm"), video);
  await assert.rejects(collectArtifacts(root, id, output), /ENOENT/u);
  for (const value of [null, [], {}, { artifacts: [] }, { artifacts: Array.from({ length: 21 }, () => ({ path: "preview.webm" })) }]) {
    await manifest(output, value);
    await assert.rejects(collectArtifacts(root, id, output), /valid output manifest/u);
  }
  await writeFile(join(output, "surreel-output.json"), "x".repeat(65_537));
  await assert.rejects(collectArtifacts(root, id, output), /64 KB/u);
});

test("output manifests reject absolute paths, traversal, hidden paths, and unsupported files", async (context) => {
  const { root, output } = await directories(context);
  await writeFile(join(root, "private.webm"), video);
  await writeFile(join(output, "script.html"), "<html>not media</html>");
  for (const path of ["../private.webm", join(root, "private.webm"), "sub/../preview.webm", "sub\\preview.webm",
    ".private.webm", "sub/.private.webm", "script.html"]) {
    const id = randomUUID();
    await manifest(output, { artifacts: [{ path }] });
    await assert.rejects(collectArtifacts(root, id, output), /relative media path|supported media file/u, path);
    assert.deepEqual(await readdir(join(root, "exports", id)), []);
  }
});

test("output directory, manifest, and declared-file symlinks cannot publish files", { skip: process.platform === "win32" }, async (context) => {
  const { root, output } = await directories(context);
  await writeFile(join(root, "outside.webm"), video);
  await writeFile(join(output, "inside.webm"), video);
  const linkedOutput = join(root, "linked-output");
  await symlink(output, linkedOutput, "dir");
  await assert.rejects(collectArtifacts(root, randomUUID(), linkedOutput), /symbolic link/u);

  await writeFile(join(root, "outside-manifest.json"), JSON.stringify({ artifacts: [{ path: "inside.webm" }] }));
  await symlink(join(root, "outside-manifest.json"), join(output, "surreel-output.json"));
  await assert.rejects(collectArtifacts(root, randomUUID(), output), /ELOOP|symbolic link/u);
  await unlink(join(output, "surreel-output.json"));

  for (const [name, target] of [["outside-link.webm", join(root, "outside.webm")], ["inside-link.webm", join(output, "inside.webm")]]) {
    assert.ok(name && target);
    await symlink(target, join(output, name));
    const id = randomUUID();
    await manifest(output, { artifacts: [{ path: name }] });
    await assert.rejects(collectArtifacts(root, id, output), /escaped|ELOOP|symbolic link/u);
    assert.deepEqual(await readdir(join(root, "exports", id)), []);
  }
});

test("publication removes already copied files if a later declared output is invalid", requiresFfprobe, async (context) => {
  const { root, output } = await directories(context);
  const id = randomUUID();
  await writeFile(join(output, "preview.webm"), video);
  await manifest(output, { artifacts: [{ path: "preview.webm" }, { path: "../private.webm" }] });
  await assert.rejects(collectArtifacts(root, id, output), /relative media path/u);
  assert.deepEqual(await readdir(join(root, "exports", id)), []);
});

test("a file named as a video cannot complete a run unless it contains a real video stream", async (context) => {
  const { root, output } = await directories(context);
  const id = randomUUID();
  await writeFile(join(output, "fake.mp4"), "A model response is not a rendered video.");
  await manifest(output, { artifacts: [{ path: "fake.mp4" }] });
  await assert.rejects(collectArtifacts(root, id, output));
  assert.deepEqual(await readdir(join(root, "exports", id)), []);
});

test("artifact lookup handles JPEG aliases and reports missing exports", async (context) => {
  const { root } = await directories(context);
  const projectId = randomUUID();
  const id = randomUUID();
  const destination = join(root, "exports", projectId);
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, `${id}.jpeg`), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const artifact: Artifact = { id, name: "Cover", url: "/cover", mimeType: "image/jpeg" };
  assert.equal(await artifactPath(root, projectId, artifact), join(destination, `${id}.jpeg`));
  await assert.rejects(artifactPath(root, projectId, { ...artifact, id: randomUUID() }), /no longer available/u);
  await assert.rejects(artifactPath(root, projectId, { ...artifact, mimeType: "text/html" }), /Unsupported/u);
  assert.equal(inside(destination, destination), false);
  assert.equal(inside(destination, `${destination}-other/file`), false);
});
