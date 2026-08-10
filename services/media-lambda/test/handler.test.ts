import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { s3ArtifactKey } from "@narratage/artifact-store-s3";
import type { S3ObjectClient } from "@narratage/artifact-store-s3";
import type { Digest } from "@narratage/protocol";

import { createMediaLambdaHandler } from "../src/handler.js";

const run = promisify(execFile);

/** The bucket, in memory. Conditional writes behave as S3's do. */
class Bucket implements S3ObjectClient {
  readonly values = new Map<string, Uint8Array>();
  async put(input: Parameters<S3ObjectClient["put"]>[0]): Promise<void> {
    if (input.IfNoneMatch === "*" && this.values.has(input.Key!)) {
      throw { $metadata: { httpStatusCode: 412 } };
    }
    this.values.set(input.Key!, Uint8Array.from(input.Body as Uint8Array));
  }
  async get(input: Parameters<S3ObjectClient["get"]>[0]): Promise<Uint8Array | undefined> {
    const value = this.values.get(input.Key!);
    return value === undefined ? undefined : Uint8Array.from(value);
  }
}

async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"]);
    await run("ffprobe", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

test("the function answers a real Need with real media, over a bucket it addresses like the store does",
  { skip: (await ffmpegAvailable()) ? false : "ffmpeg and ffprobe are not on PATH" },
  async () => {
    const work = await mkdtemp(join(tmpdir(), "svml-media-lambda-"));
    try {
      // One second of real audio, so ffprobe has something true to report.
      const path = join(work, "source.wav");
      await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
        "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", path]);
      const bytes = await readFile(path);
      const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Digest;

      const bucket = new Bucket();
      // Placed at the key the ArtifactStore would have used — the shared law.
      bucket.values.set(s3ArtifactKey("svml", digest), Uint8Array.from(bytes));

      const handle = createMediaLambdaHandler({ client: bucket, ffmpegPath: "ffmpeg", ffprobePath: "ffprobe" });
      const reply = await handle({
        contract: "svml.media-lambda-request@1",
        operation: "inspect",
        artifacts: { bucket: "fixture", prefix: "svml" },
        constraints: {
          contract: "svml.inspect-media-request@1",
          source: { kind: "blob", digest, size: bytes.byteLength, mediaType: "audio/wav" },
        },
      }) as Record<string, unknown>;

      assert.equal(reply.ok, true, `the function failed: ${JSON.stringify(reply)}`);
      assert.equal(reply.operation, "inspect");
      const stored = reply.value as { kind: string; value: { contract: string; streams: { kind: string; sampleRate: number }[] } };
      assert.equal(stored.kind, "inline");
      const value = stored.value;
      assert.equal(value.contract, "svml.media-inspection@1");
      assert.equal(value.streams.length, 1);
      assert.equal(value.streams[0]!.kind, "audio");
      assert.equal(value.streams[0]!.sampleRate, 48_000);
      assert.deepEqual(reply.metadata, { operation: "inspect", provider: "media.aws-lambda" });
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

test("a source the bucket does not hold is a typed failure, never a throw", async () => {
  const handle = createMediaLambdaHandler({ client: new Bucket() });
  const reply = await handle({
    contract: "svml.media-lambda-request@1",
    operation: "inspect",
    artifacts: { bucket: "fixture" },
    constraints: {
      contract: "svml.inspect-media-request@1",
      source: { kind: "blob", digest: `sha256:${"0".repeat(64)}`, size: 1, mediaType: "audio/wav" },
    },
  }) as Record<string, unknown>;
  assert.equal(reply.ok, false);
  assert.equal(reply.code, "MEDIA_OPERATION_FAILED");
  assert.match(String(reply.message), /is unavailable/u);
});

test("an envelope from another contract is refused before any media is touched", async () => {
  const handle = createMediaLambdaHandler({ client: new Bucket() });
  const reply = await handle({ contract: "svml.media-lambda-request@invalid" }) as Record<string, unknown>;
  assert.equal(reply.ok, false);
  assert.match(String(reply.message), /contract must be svml\.media-lambda-request@1/u);
});

test("a Layer that lies about its FFmpeg version fails before reading an Artifact",
  { skip: (await ffmpegAvailable()) ? false : "ffmpeg and ffprobe are not on PATH" },
  async () => {
    const handle = createMediaLambdaHandler({
      client: new Bucket(),
      ffmpegPath: "ffmpeg",
      ffprobePath: "ffprobe",
      expectedFfmpegVersion: "0.0.0-impossible",
    });
    const reply = await handle({
      contract: "svml.media-lambda-request@1",
      operation: "inspect",
      artifacts: { bucket: "fixture" },
      constraints: {
        contract: "svml.inspect-media-request@1",
        source: {
          kind: "blob",
          digest: `sha256:${"0".repeat(64)}`,
          size: 1,
          mediaType: "audio/wav",
        },
      },
    }) as Record<string, unknown>;
    assert.equal(reply.ok, false);
    assert.match(String(reply.message), /Layer mismatch: expected 0\.0\.0-impossible/u);
  });
