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
} from "@hypit/composition";
import {
  EndpointRegistry,
  MemoryResourceStore,
} from "@hypit/driver-node";
import type {
  EndpointOutcome,
  AsyncEndpoint,
} from "@hypit/endpoint-kit";
import { compileHyperframesDocument } from "@hypit/hyperframes";
import type { HyperframesDocument } from "@hypit/hyperframes";
import {
  mediaTypes,
  verifyRenderedVisual,
} from "@hypit/media";
import type { RenderedVisual } from "@hypit/media";
import { sealProgramSpace } from "@hypit/program-space";
import {
  createAwsLambdaHyperframesProvider,
} from "@hypit/provider-hyperframes-aws-lambda";
import {
  } from "@hypit/protocol";
import type {
  CanonicalValue,
  Need,
} from "@hypit/protocol";
import {
  hyperframesVisualRequest,
  renderHyperframesCapabilities,
} from "@hypit/render-hyperframes";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`set ${name}`);
  return value;
}

const stateMachineArn = requiredEnvironment("HYPIT_HYPERFRAMES_STATE_MACHINE_ARN");
const bucketName = requiredEnvironment("HYPIT_HYPERFRAMES_BUCKET");
const region = requiredEnvironment("AWS_REGION");

const run = promisify(execFile);
const memorySizeMb = Number.parseInt(process.env.HYPIT_HYPERFRAMES_MEMORY_MB ?? "2048", 10);
assert(Number.isSafeInteger(memorySizeMb) && memorySizeMb >= 2_048, "invalid HyperFrames canary memory size");

function documentFixture(canaryId: string): HyperframesDocument {
  const frameRate = { numerator: 24, denominator: 1 } as const;
  const frameCount = 24;
  const programSpace = sealProgramSpace({ id: "test-space", narrativeId: "test-narrative",
    durationSec: 1,
    frameRate,
  });
  const track = sealVisualTrack({ programSpaceId: "test-space",
    visualIr: "hypit.visual-ir@1",
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
    result: `record:hyperframes-aws-canary:${canaryId}`,
  };
}

async function endpointFor(request: Need): Promise<AsyncEndpoint> {
  const registry = new EndpointRegistry();
  await createAwsLambdaHyperframesProvider({
    instance: "hyperframes.aws-lambda.canary",
    stateMachineArn,
    bucketName,
    quality: "draft",
    targetChunkFrames: 12,
    maxParallelChunks: 2,
    defaultMemorySizeMb: memorySizeMb,
    defaultConcurrency: 1,
    pollIntervalMs: 2_000,
    maxOperationMs: 10 * 60_000,
  }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "asynchronous");
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
  const canaryId = process.env.HYPIT_HYPERFRAMES_CANARY_ID ?? randomUUID().slice(0, 16);
  const document = documentFixture(canaryId);
  const need = requestNeed(document, canaryId);
  const endpoint = await endpointFor(need);
  const resources = new MemoryResourceStore();
  const commandId = `command:hyperframes-aws-canary:${canaryId}`;
  const operation = `operation:hyperframes-aws-canary:${canaryId}`;
  const context = {
    command: { kind: "fulfill-need", id: commandId, need } as const,
    need,
    resources,
    credentials: {},
    operation,
  };
  let lastHandle: CanonicalValue | undefined;
  const work = await mkdtemp(join(tmpdir(), "hypit-hyperframes-canary-"));
  try {
    let outcome: EndpointOutcome = await endpoint.start(context);
    for (let polls = 0; outcome.status === "pending"; polls += 1) {
      assert(polls < 300, "HyperFrames canary exceeded 300 polls");
      lastHandle = outcome.handle;
      const waitMs = Math.max(0, (outcome.wakeAt ?? Date.now()) - Date.now());
      if (waitMs > 0) await delay(waitMs);
      outcome = await endpoint.poll({ ...context, handle: outcome.handle });
    }
    if (outcome.status === "failed") {
      throw new Error(`${outcome.failure.code}: ${outcome.failure.message}`);
    }
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.result.value.kind, "inline");
    const visual = outcome.result.value.value as unknown as RenderedVisual;
    verifyRenderedVisual(visual);
    const bytes = await resources.get(visual.artifact.resource);
    assert(bytes !== undefined && bytes.byteLength === visual.artifact.size);

    const output = join(work, "visual.mp4");
    await writeFile(output, bytes);
    const { stdout } = await run(process.env.HYPIT_CANARY_FFPROBE ?? "ffprobe", [
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
      probe: probe.streams[0],
    }, null, 2)}\n`);
  } finally {
    await rm(work, { recursive: true, force: true });
    if (process.env.HYPIT_HYPERFRAMES_CANARY_KEEP !== "1" && lastHandle !== undefined) {
      const handle = lastHandle as unknown as { executionName?: string; site?: { siteId?: string } };
      const s3 = new S3Client({ region });
      if (handle.executionName !== undefined) await deletePrefix(s3, `renders/${handle.executionName}/`);
      if (handle.site?.siteId !== undefined) await deletePrefix(s3, `sites/${handle.site.siteId}/`);
    }
  }
}

await main();
