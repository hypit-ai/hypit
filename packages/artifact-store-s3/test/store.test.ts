import assert from "node:assert/strict";
import test from "node:test";

import {
  S3ArtifactStore,
  createS3ArtifactStorePackage,
} from "@svml/artifact-store-s3";
import type { S3ObjectClient } from "@svml/artifact-store-s3";

class FakeS3 implements S3ObjectClient {
  readonly values = new Map<string, Uint8Array>();
  conflicts = 0;

  async put(input: Parameters<S3ObjectClient["put"]>[0]): Promise<void> {
    const key = input.Key!;
    if (this.conflicts > 0) {
      this.conflicts -= 1;
      throw { $metadata: { httpStatusCode: 409 } };
    }
    if (input.IfNoneMatch === "*" && this.values.has(key)) {
      throw { $metadata: { httpStatusCode: 412 } };
    }
    assert.ok(input.Body instanceof Uint8Array);
    this.values.set(key, Uint8Array.from(input.Body));
  }

  async get(input: Parameters<S3ObjectClient["get"]>[0]): Promise<Uint8Array | undefined> {
    const value = this.values.get(input.Key!);
    return value === undefined ? undefined : Uint8Array.from(value);
  }
}

test("S3 artifacts use conditional immutable writes and verify downloaded content", async () => {
  const client = new FakeS3();
  const store = new S3ArtifactStore({ client, bucket: "fixture", prefix: "projects/acme" });
  const bytes = new TextEncoder().encode("one immutable remote artifact");
  client.conflicts = 1;
  const first = await store.put(bytes, "video/mp4");
  const second = await store.put(bytes, "video/mp4");
  assert.equal(first.digest, second.digest);
  assert.match(store.key(first.digest), /^projects\/acme\/sha256\//u);
  assert.deepEqual(await store.get(first.digest), bytes);

  client.values.set(store.key(first.digest), new TextEncoder().encode("tampered"));
  await assert.rejects(store.get(first.digest), /content digest differs/u);
});

test("configured S3 service locks location without putting AWS credentials in the Closure", () => {
  const configured = createS3ArtifactStorePackage({
    instance: "artifacts.team",
    client: new FakeS3(),
    bucket: "team-artifacts",
    prefix: "svml",
    region: "us-east-1",
    expectedBucketOwner: "123456789012",
  });
  assert.equal(configured.services[0]?.instance.id, "artifacts.team");
  assert.ok(configured.services[0]?.instance.configurationDigest);
  assert.equal(JSON.stringify(configured).includes("AWS_SECRET_ACCESS_KEY"), false);
});
