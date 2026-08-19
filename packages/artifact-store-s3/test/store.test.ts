import assert from "node:assert/strict";
import test from "node:test";

import { S3ArtifactStore } from "@hypit/artifact-store-s3";
import type { S3ObjectClient } from "@hypit/artifact-store-s3";
import { isStreamingArtifactStore } from "@hypit/runtime";

class FakeS3 implements S3ObjectClient {
  readonly values = new Map<string, Uint8Array>();
  gets = 0;

  async put(input: Parameters<S3ObjectClient["put"]>[0]): Promise<void> {
    const key = input.Key!;
    assert.ok(input.Body instanceof Uint8Array);
    this.values.set(key, Uint8Array.from(input.Body));
  }

  async get(input: Parameters<S3ObjectClient["get"]>[0]): Promise<Uint8Array | undefined> {
    this.gets += 1;
    const value = this.values.get(input.Key!);
    return value === undefined ? undefined : Uint8Array.from(value);
  }
}

test("S3 artifacts use deterministic content-addressed keys", async () => {
  const client = new FakeS3();
  const store = new S3ArtifactStore({ client, bucket: "fixture", prefix: "projects/acme" });
  const bytes = new TextEncoder().encode("one immutable remote artifact");
  const first = await store.put(bytes, "video/mp4");
  const second = await store.put(bytes, "video/mp4");
  assert.equal(first.digest, second.digest);
  assert.match(store.key(first.digest), /^projects\/acme\/sha256\//u);
  assert.deepEqual(await store.get(first.digest), bytes);
});

/** A client that can do everything, backed by an in-memory bucket. */
class FullFakeS3 extends FakeS3 {
  readonly uploads = new Map<string, Uint8Array[]>();
  heads = 0;

  async open(input: Parameters<NonNullable<S3ObjectClient["open"]>>[0]) {
    const value = this.values.get(input.Key!);
    if (value === undefined) return undefined;
    // Two chunks, so a consumer cannot assume one whole-object read.
    const half = Math.ceil(value.byteLength / 2);
    return (async function* () {
      yield Uint8Array.from(value.subarray(0, half));
      yield Uint8Array.from(value.subarray(half));
    })();
  }

  async head(input: Parameters<NonNullable<S3ObjectClient["head"]>>[0]) {
    this.heads += 1;
    const value = this.values.get(input.Key!);
    return value === undefined ? undefined : { size: value.byteLength };
  }

  async createMultipart(input: Parameters<NonNullable<S3ObjectClient["createMultipart"]>>[0]) {
    const id = `upload-${this.uploads.size + 1}`;
    this.uploads.set(`${id}:${input.Key!}`, []);
    return id;
  }

  async uploadPart(input: Parameters<NonNullable<S3ObjectClient["uploadPart"]>>[0]) {
    const parts = this.uploads.get(`${input.UploadId!}:${input.Key!}`)!;
    parts[input.PartNumber! - 1] = Uint8Array.from(input.Body as Uint8Array);
    return { etag: `"etag-${input.PartNumber}"` };
  }

  async completeMultipart(input: Parameters<NonNullable<S3ObjectClient["completeMultipart"]>>[0]) {
    const parts = this.uploads.get(`${input.UploadId!}:${input.Key!}`)!;
    const size = parts.reduce((total, part) => total + part.byteLength, 0);
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.byteLength;
    }
    this.values.set(input.Key!, joined);
  }

  async abortMultipart() {}

  async copy(input: Parameters<NonNullable<S3ObjectClient["copy"]>>[0]) {
    const source = input.CopySource!.slice(input.CopySource!.indexOf("/") + 1);
    const value = this.values.get(source);
    if (value === undefined) throw new Error(`copy source ${source} is absent`);
    this.values.set(input.Key!, Uint8Array.from(value));
  }

  async delete(input: Parameters<NonNullable<S3ObjectClient["delete"]>>[0]) {
    this.values.delete(input.Key!);
  }

}

test("streaming is exposed only when the client supports it", () => {
  const store = new S3ArtifactStore({ client: new FakeS3(), bucket: "fixture" });
  assert.equal(isStreamingArtifactStore(store), false);
  const full = new S3ArtifactStore({ client: new FullFakeS3(), bucket: "fixture" });
  assert.equal(isStreamingArtifactStore(full), true);
});

test("a streamed Artifact reaches the content-addressed key it earned by being hashed", async () => {
  const client = new FullFakeS3();
  const store = new S3ArtifactStore({ client, bucket: "fixture", prefix: "svml" });
  const parts = ["first ", "second ", "third"].map((text) => new TextEncoder().encode(text));
  const ref = await store.putStream!((async function* () { yield* parts; })(), "video/mp4");

  const whole = new TextEncoder().encode("first second third");
  assert.equal(ref.size, whole.byteLength);
  assert.deepEqual(await store.get(ref.digest), whole);
  assert.match(store.key(ref.digest), /^svml\/sha256\//u);
  // The staging key is gone, so it is not mistaken for an Artifact.
  assert.deepEqual([...client.values.keys()].filter((key) => key.includes(".incoming")), []);
});

test("an empty Artifact is a legitimate one, and S3 will not accept a partless upload", async () => {
  const store = new S3ArtifactStore({ client: new FullFakeS3(), bucket: "fixture" });
  const ref = await store.putStream!((async function* () {})(), "application/octet-stream");
  assert.equal(ref.size, 0);
  assert.deepEqual(await store.get(ref.digest), new Uint8Array(0));
});

test("a streamed read hands back bytes as they arrive", async () => {
  const client = new FullFakeS3();
  const store = new S3ArtifactStore({ client, bucket: "fixture" });
  const bytes = new TextEncoder().encode("streamed artifact bytes");
  const ref = await store.put(bytes, "text/plain");

  const chunks: Uint8Array[] = [];
  for await (const chunk of (await store.open!(ref.digest))!) chunks.push(chunk);
  assert.equal(chunks.length, 2, "the stream was not assembled on the caller's behalf");
});

test("presence uses object metadata without downloading bytes", async () => {
  const client = new FullFakeS3();
  const store = new S3ArtifactStore({ client, bucket: "fixture" });
  const ref = await store.put(new TextEncoder().encode("present"), "text/plain");
  const gets = client.gets;
  assert.equal(await store.has(ref.digest), true);
  assert.equal(client.heads, 1);
  assert.equal(client.gets, gets, "has did not download the object");
});
