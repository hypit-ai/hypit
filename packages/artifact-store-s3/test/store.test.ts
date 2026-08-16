import assert from "node:assert/strict";
import test from "node:test";

import {
  S3ArtifactStore,
  createS3ArtifactStorePackage,
} from "@narratage/artifact-store-s3";
import type { S3ObjectClient } from "@narratage/artifact-store-s3";
import { isManagedArtifactStore, isStreamingArtifactStore } from "@narratage/runtime";

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

test("configured S3 service locks its location", () => {
  const configured = createS3ArtifactStorePackage({
    instance: "artifacts.team",
    client: new FakeS3(),
    bucket: "team-artifacts",
    prefix: "svml",
    region: "us-east-1",
    expectedBucketOwner: "123456789012",
  });
  assert.equal(configured.parts[0]?.instance.id, "artifacts.team.store");
});

/** A client that can do everything, backed by an in-memory bucket. */
class FullFakeS3 extends FakeS3 {
  readonly uploads = new Map<string, Uint8Array[]>();
  copies = 0;
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
    this.copies += 1;
    const source = input.CopySource!.slice(input.CopySource!.indexOf("/") + 1);
    const value = this.values.get(source);
    if (value === undefined) throw new Error(`copy source ${source} is absent`);
    this.values.set(input.Key!, Uint8Array.from(value));
  }

  async delete(input: Parameters<NonNullable<S3ObjectClient["delete"]>>[0]) {
    this.values.delete(input.Key!);
  }

  async list(input: Parameters<NonNullable<S3ObjectClient["list"]>>[0]) {
    const keys = [...this.values.keys()].filter((key) => key.startsWith(input.Prefix ?? "")).sort();
    return { keys };
  }
}

test("a client that cannot stream or enumerate makes the store admit it, rather than throw later", () => {
  const store = new S3ArtifactStore({ client: new FakeS3(), bucket: "fixture" });
  assert.equal(isStreamingArtifactStore(store), false);
  assert.equal(isManagedArtifactStore(store), false);
  const full = new S3ArtifactStore({ client: new FullFakeS3(), bucket: "fixture" });
  assert.equal(isStreamingArtifactStore(full), true);
  assert.equal(isManagedArtifactStore(full), true);
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

test("two Builds streaming identical bytes use the same destination", async () => {
  const client = new FullFakeS3();
  const store = new S3ArtifactStore({ client, bucket: "fixture" });
  const bytes = () => (async function* () { yield new TextEncoder().encode("same"); })();
  const first = await store.putStream!(bytes(), "text/plain");
  const second = await store.putStream!(bytes(), "text/plain");
  assert.equal(first.digest, second.digest);
  assert.equal(client.copies, 2);
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

test("retention reports the Artifacts it stored, and whether a delete found one", async () => {
  const client = new FullFakeS3();
  const store = new S3ArtifactStore({ client, bucket: "fixture", prefix: "svml" });
  const one = await store.put(new TextEncoder().encode("one"), "text/plain");
  const two = await store.put(new TextEncoder().encode("two"), "text/plain");
  // A key under the same prefix that this store did not write is not an Artifact.
  client.values.set("svml/sha256/zz/not-a-digest", new Uint8Array(1));

  assert.deepEqual([...await store.list!()].sort(), [one.digest, two.digest].sort());
  assert.equal(await store.delete!(one.digest), true);
  assert.equal(await store.delete!(one.digest), false, "deleting what is gone is not an error");
  assert.deepEqual(await store.list!(), [two.digest]);
});
