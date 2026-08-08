#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { AwsS3ObjectClient, S3ArtifactStore } from "@narratage/artifact-store-s3";
import {
  sealRenderedVisual,
  verifyMediaInspection,
  verifyMuxedMedia,
  verifySynchronizedMedia,
  verifyTimelineAudio,
} from "@narratage/media";
import type {
  MediaInspection,
  MuxedMedia,
  SynchronizedMedia,
  TimelineAudio,
} from "@narratage/media";
import {
  sealAudioProgramPlan,
  sealMediaSelectionRequest,
  selectMediaStreams,
} from "@narratage/media-pipeline";
import type { MediaLambdaOperation } from "@narratage/provider-media-aws-lambda";
import {
  parseMediaLambdaResponse,
  sealMediaLambdaRequest,
} from "@narratage/provider-media-aws-lambda";
import type { CanonicalValue } from "@narratage/protocol";
import {
  assertSpeechEvidenceAudioIdentity,
  speechEvidenceSampleBoundary,
} from "@narratage/speech";
import type { SpeechEvidenceAudio } from "@narratage/speech";
import { AwsLambdaJsonInvoker } from "@narratage/transport-aws-lambda";

const run = promisify(execFile);
const functionArn = process.env.NARRATAGE_MEDIA_FUNCTION_ARN;
const bucket = process.env.NARRATAGE_MEDIA_ARTIFACT_BUCKET;
const region = process.env.AWS_REGION;
if (functionArn === undefined || bucket === undefined || region === undefined) {
  throw new Error("set NARRATAGE_MEDIA_FUNCTION_ARN, NARRATAGE_MEDIA_ARTIFACT_BUCKET and AWS_REGION");
}
if (!/:\d+$/u.test(functionArn)) throw new Error("canary requires an immutable numeric function version ARN");

const prefix = process.env.NARRATAGE_MEDIA_CANARY_PREFIX
  ?? `canary/media-lambda/${new Date().toISOString().replaceAll(/[^0-9A-Za-z]/gu, "-")}`;
const store = new S3ArtifactStore({
  client: new AwsS3ObjectClient({ region }),
  bucket,
  prefix,
  expectedBucketOwner: functionArn.split(":")[4],
});
const invoker = new AwsLambdaJsonInvoker({ functionName: functionArn, region });

async function invoke(operation: MediaLambdaOperation, constraints: CanonicalValue): Promise<CanonicalValue> {
  const reply = parseMediaLambdaResponse(await invoker.invoke(sealMediaLambdaRequest({
    contract: "svml.media-lambda-request@1",
    operation,
    artifacts: { bucket, prefix },
    constraints,
  })));
  if (!reply.ok) throw new Error(`${operation} failed (${reply.code}): ${reply.message}`);
  return reply.value;
}

async function main() {
  const work = await mkdtemp(join(tmpdir(), "narratage-media-canary-"));
  try {
    const sourcePath = join(work, "source.mp4");
    await run(process.env.NARRATAGE_CANARY_FFMPEG ?? "ffmpeg", [
      "-v", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=s=160x96:r=24:d=1",
      "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=32000:duration=1.05",
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", sourcePath,
    ], { timeout: 30_000 });
    const source = await store.put(await readFile(sourcePath), "video/mp4");

    const inspection = await invoke("inspect", {
      contract: "svml.inspect-media-request@1",
      source,
    }) as unknown as MediaInspection;
    verifyMediaInspection(inspection);
    const selectionRequest = sealMediaSelectionRequest({
      contract: "svml.media-selection-request@1",
      video: { mode: "primary-moving" },
      audio: { mode: "default" },
      spanAuthority: "video",
      frameRate: { numerator: 30, denominator: 1 },
    });
    const selection = selectMediaStreams(inspection, selectionRequest);

    const synchronized = await invoke("normalize", {
      contract: "svml.normalize-media-request@1",
      source,
      inspection,
      selection,
      frameRate: selectionRequest.frameRate,
      audio: { sampleRate: 48_000, channels: 2, codec: "pcm_s16le", loudness: "preserve" },
    }) as unknown as SynchronizedMedia;
    verifySynchronizedMedia(synchronized);
    assert(synchronized.visual !== undefined && synchronized.audio !== undefined);

    const durationSec = synchronized.timeline.sampleFrames / 48_000;
    const evidence = await invoke("project-speech-evidence-audio", {
      contract: "svml.project-speech-evidence-audio-request@1",
      source: synchronized.audio.artifact,
      sourceSampleRate: 48_000,
      sourceChannels: 2,
      sourceCodec: "pcm_s16le",
      sourceSampleFrames: synchronized.audio.sampleFrames,
      evidenceSampleRate: 16_000,
      evidenceChannels: 1,
      evidenceCodec: "pcm_s16le",
      evidenceSampleFrames: speechEvidenceSampleBoundary(synchronized.audio.sampleFrames),
      durationSec,
      segments: [{ segmentId: "canary", startSec: 0, endSec: durationSec }],
    }) as unknown as SpeechEvidenceAudio;
    assertSpeechEvidenceAudioIdentity(evidence);

    const plan = sealAudioProgramPlan({
      contract: "svml.audio-program-plan@1",
      frameRate: synchronized.timeline.frameRate,
      frameCount: synchronized.timeline.frameCount,
      sampleRate: 48_000,
      sampleFrames: synchronized.timeline.sampleFrames,
      clips: [{
        id: "canary:source",
        artifact: synchronized.audio.artifact,
        targetStartSample: 0,
        targetEndSampleExclusive: synchronized.timeline.sampleFrames,
        sourceStartSample: 0,
        playbackRate: 1,
        gain: 1,
        fadeInSamples: 0,
        fadeOutSamples: 0,
        bus: "source",
      }],
      mix: { normalize: false, limiter: "none" },
    });
    const audio = await invoke("render-audio", {
      contract: "svml.render-audio-request@1",
      plan,
    }) as unknown as TimelineAudio;
    verifyTimelineAudio(audio);

    const visual = sealRenderedVisual({
      contract: "svml.rendered-visual@1",
      frameRate: synchronized.visual.frameRate,
      frameCount: synchronized.visual.frameCount,
      canvas: { width: synchronized.visual.width, height: synchronized.visual.height },
      artifact: synchronized.visual.artifact,
      muted: true,
    });
    const muxed = await invoke("mux", {
      contract: "svml.mux-media-request@1",
      visual,
      audio,
    }) as unknown as MuxedMedia;
    verifyMuxedMedia(muxed);

    const finalInspection = await invoke("inspect", {
      contract: "svml.inspect-media-request@1",
      source: muxed.artifact,
    }) as unknown as MediaInspection;
    verifyMediaInspection(finalInspection);
    assert.equal(finalInspection.streams.filter((stream) => stream.kind === "video").length, 1);
    assert.equal(finalInspection.streams.filter((stream) => stream.kind === "audio").length, 1);

    process.stdout.write(`${JSON.stringify({
      functionArn,
      prefix,
      source: source.digest,
      normalized: {
        frameCount: synchronized.timeline.frameCount,
        sampleFrames: synchronized.timeline.sampleFrames,
        visual: synchronized.visual.artifact.digest,
        audio: synchronized.audio.artifact.digest,
      },
      evidence: evidence.artifact.digest,
      timelineAudio: audio.artifact.digest,
      muxed: muxed.artifact.digest,
      finalStreams: finalInspection.streams.map((stream) => ({
        index: stream.index,
        kind: stream.kind,
        codec: stream.codecName,
        decodedUnits: stream.decodedUnitCount,
      })),
    }, null, 2)}\n`);
  } finally {
    await rm(work, { recursive: true, force: true });
    if (process.env.NARRATAGE_MEDIA_CANARY_KEEP !== "1" && store.list !== undefined && store.delete !== undefined) {
      for (const digest of await store.list()) await store.delete(digest);
    }
  }
}

await main();
