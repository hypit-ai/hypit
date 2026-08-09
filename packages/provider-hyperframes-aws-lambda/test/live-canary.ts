#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  sealComposition,
  sealVisualTrack,
} from "@narratage/composition";
import {
  EndpointRegistry,
  MemoryArtifactStore,
} from "@narratage/driver-node";
import type {
  EndpointOutcome,
  RecoverableEndpoint,
} from "@narratage/endpoint-kit";
import { compileHyperframesDocument } from "@narratage/hyperframes";
import type { HyperframesDocument } from "@narratage/hyperframes";
import {
  mediaTypes,
  verifyRenderedVisual,
} from "@narratage/media";
import type { RenderedVisual } from "@narratage/media";
import { sealProgramSpace } from "@narratage/program-space";
import {
  createAwsLambdaHyperframesProvider,
} from "@narratage/provider-hyperframes-aws-lambda";
import {
  digestOf,
} from "@narratage/protocol";
import type {
  CanonicalValue,
  Digest,
  Need,
} from "@narratage/protocol";
import {
  hyperframesVisualRequest,
  renderHyperframesCapabilities,
} from "@narratage/render-hyperframes";
import { sealOperationIdentity } from "@narratage/runtime";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`set ${name}`);
  return value;
}

const stateMachineArn = requiredEnvironment("NARRATAGE_HYPERFRAMES_STATE_MACHINE_ARN");
const bucketName = requiredEnvironment("NARRATAGE_HYPERFRAMES_BUCKET");
const rendererImplementationDigest = requiredEnvironment("NARRATAGE_HYPERFRAMES_RENDERER_DIGEST") as Digest;
assert(/^sha256:[0-9a-f]{64}$/u.test(rendererImplementationDigest),
  "invalid NARRATAGE_HYPERFRAMES_RENDERER_DIGEST");
const region = requiredEnvironment("AWS_REGION");

const run = promisify(execFile);
const memorySizeMb = Number.parseInt(process.env.NARRATAGE_HYPERFRAMES_MEMORY_MB ?? "2048", 10);
assert(Number.isSafeInteger(memorySizeMb) && memorySizeMb >= 2_048, "invalid HyperFrames canary memory size");

function documentFixture(canaryId: string): HyperframesDocument {
  const frameRate = { numerator: 24, denominator: 1 } as const;
  const frameCount = 24;
  const programSpace = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec: 1,
    frameRate,
  });
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: `hyperframes-aws-canary-${canaryId}`,
    presents: [{
      id: "card",
      span: { startFrame: 0, endFrameExclusive: frameCount },
      stacking: { order: 1, tieBreak: "card" },
      elements: [{
        id: "background",
        order: 0,
        kind: "box",
        style: [
          { name: "position", value: "absolute" },
          { name: "inset", value: 0 },
          { name: "background", value: "#261447" },
          { name: "border-radius", value: "12px" },
        ],
        animation: {
          keyframes: [
            { atFrame: 0, style: [{ name: "opacity", value: 0.35 }] },
            { atFrame: frameCount, easing: "linear", style: [{ name: "opacity", value: 1 }] },
          ],
        },
      }],
    }],
  });
  return compileHyperframesDocument(sealComposition({
    contract: "svml.composition@1",
    id: `hyperframes-aws-canary-${canaryId}`,
    canvas: { width: 160, height: 96, clearColor: "#000000" },
    tracks: [track],
  }), programSpace);
}

function requestNeed(document: HyperframesDocument, canaryId: string): Need {
  const constraints = hyperframesVisualRequest(document);
  return {
    id: `need:hyperframes-aws-canary:${canaryId}`,
    capability: renderHyperframesCapabilities.renderVisual,
    returns: mediaTypes.renderedVisual,
    constraints,
    requestedBy: `derivation:hyperframes-aws-canary:${canaryId}`,
    result: `record:hyperframes-aws-canary:${canaryId}`,
    accepts: "exact",
    conformanceFloor: "exact",
    requestDigest: digestOf({
      capability: renderHyperframesCapabilities.renderVisual,
      returns: mediaTypes.renderedVisual,
      constraints,
    }),
  };
}

async function endpointFor(request: Need): Promise<RecoverableEndpoint> {
  const registry = new EndpointRegistry();
  await createAwsLambdaHyperframesProvider({
    instance: "hyperframes.aws-lambda.canary",
    stateMachineArn,
    bucketName,
    rendererImplementationDigest,
    region,
    quality: "draft",
    targetChunkFrames: 12,
    maxParallelChunks: 2,
    defaultMemorySizeMb: memorySizeMb,
    defaultConcurrency: 1,
    pollIntervalMs: 2_000,
    maxOperationMs: 10 * 60_000,
    maxPollFailures: 10,
  }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "recoverable");
  return resolution.registration.endpoint;
}

async function deletePrefix(s3: S3Client, prefix: string): Promise<void> {
  let continuationToken: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken }),
    }));
    const objects = (page.Contents ?? []).flatMap((item) => item.Key === undefined ? [] : [{ Key: item.Key }]);
    if (objects.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucketName, Delete: { Objects: objects, Quiet: true } }));
    }
    continuationToken = page.IsTruncated === true ? page.NextContinuationToken : undefined;
  } while (continuationToken !== undefined);
}

async function main(): Promise<void> {
  const canaryId = digestOf(process.env.NARRATAGE_HYPERFRAMES_CANARY_ID ?? randomUUID()).slice(7, 23);
  const document = documentFixture(canaryId);
  const need = requestNeed(document, canaryId);
  const endpoint = await endpointFor(need);
  const artifacts = new MemoryArtifactStore();
  const commandId = `command:hyperframes-aws-canary:${canaryId}`;
  const operation = sealOperationIdentity({
    build: `build:hyperframes-aws-canary:${canaryId}`,
    command: commandId,
    endpoint: "hyperframes.aws-lambda.canary",
    implementationDigest: digestOf("hyperframes-aws-canary:implementation"),
    runtimeClosure: digestOf("hyperframes-aws-canary:runtime"),
    requestDigest: need.requestDigest,
    attempt: 1,
  });
  const context = {
    command: { kind: "fulfill-need", id: commandId, need } as const,
    need,
    artifacts,
    credentials: {},
    operation,
  };
  let lastCheckpoint: CanonicalValue | undefined;
  const work = await mkdtemp(join(tmpdir(), "narratage-hyperframes-canary-"));
  try {
    let outcome: EndpointOutcome = await endpoint.start(context);
    for (let polls = 0; outcome.status === "pending"; polls += 1) {
      assert(polls < 300, "HyperFrames canary exceeded 300 polls");
      lastCheckpoint = outcome.checkpoint;
      const waitMs = Math.max(0, (outcome.wakeAt ?? Date.now()) - Date.now());
      if (waitMs > 0) await delay(waitMs);
      outcome = await endpoint.resume({ ...context, checkpoint: outcome.checkpoint });
    }
    if (outcome.status === "failed") {
      throw new Error(`${outcome.failure.code}: ${outcome.failure.message}`);
    }
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.result.value.kind, "inline");
    const visual = outcome.result.value.value as unknown as RenderedVisual;
    verifyRenderedVisual(visual);
    const bytes = await artifacts.get(visual.artifact.digest);
    assert(bytes !== undefined && bytes.byteLength === visual.artifact.size);

    const output = join(work, "visual.mp4");
    await writeFile(output, bytes);
    const { stdout } = await run(process.env.NARRATAGE_CANARY_FFPROBE ?? "ffprobe", [
      "-v", "error", "-count_frames", "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,nb_read_frames,width,height",
      "-of", "json", output,
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    const probe = JSON.parse(stdout) as {
      streams?: Array<{ codec_name?: string; nb_read_frames?: string; width?: number; height?: number }>;
    };
    assert.deepEqual(probe.streams, [{
      codec_name: "h264",
      width: 160,
      height: 96,
      nb_read_frames: "24",
    }]);

    process.stdout.write(`${JSON.stringify({
      canaryId,
      stateMachineArn,
      bucketName,
      artifact: visual.artifact,
      frameRate: visual.frameRate,
      frameCount: visual.frameCount,
      canvas: visual.canvas,
      metadata: outcome.result.metadata,
      probe: probe.streams[0],
    }, null, 2)}\n`);
  } finally {
    await rm(work, { recursive: true, force: true });
    if (process.env.NARRATAGE_HYPERFRAMES_CANARY_KEEP !== "1" && lastCheckpoint !== undefined) {
      const checkpoint = lastCheckpoint as unknown as { executionName?: string; site?: { siteId?: string } };
      const s3 = new S3Client({ region });
      if (checkpoint.executionName !== undefined) await deletePrefix(s3, `renders/${checkpoint.executionName}/`);
      if (checkpoint.site?.siteId !== undefined) await deletePrefix(s3, `sites/${checkpoint.site.siteId}/`);
    }
  }
}

await main();
