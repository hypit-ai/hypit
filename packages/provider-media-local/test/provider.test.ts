import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  contractTypes,
  assertSpeechEvidenceAudioIdentity,
  sealRenderedVisual,
  verifyMuxedMedia,
  verifyMediaInspection,
  verifySynchronizedMedia,
  verifyTimelineAudio,
} from "@svml/contracts";
import type {
  MediaAudioStream,
  MediaInspection,
  MuxedMedia,
  SynchronizedMedia,
  TimelineAudio,
  SpeechEvidenceAudio,
} from "@svml/contracts";
import {
  MemoryArtifactStore,
  EndpointRegistry,
} from "@svml/driver-node";
import type { EndpointRegistration } from "@svml/driver-node";
import type { ImmediateEndpointHandler } from "@svml/endpoint-kit";
import {
  mediaPipelineCapabilities,
  sealAudioProgramPlan,
  sealMediaSelectionRequest,
  selectMediaStreams,
} from "@svml/media-pipeline";
import { canonicalize, digestOf } from "@svml/protocol";
import type { CapabilityRef, CanonicalValue, Need, TypeRef } from "@svml/protocol";

import { createLocalMediaProvider } from "../src/index.js";

const hasMediaBinaries = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
  && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

async function run(executable: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${executable} ${String(code)}: ${stderr}`)));
  });
}

function presentationSampleFrames(stream: MediaAudioStream): number {
  assert(stream.startPts !== undefined && stream.endPts !== undefined);
  const startNumerator = BigInt(stream.startPts.ticks) * BigInt(stream.startPts.timeBase.numerator);
  const startDenominator = BigInt(stream.startPts.timeBase.denominator);
  const endNumerator = BigInt(stream.endPts.ticks) * BigInt(stream.endPts.timeBase.numerator);
  const endDenominator = BigInt(stream.endPts.timeBase.denominator);
  const numerator = (endNumerator * startDenominator - startNumerator * endDenominator) * 48_000n;
  const denominator = endDenominator * startDenominator;
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}

async function fixture(root: string): Promise<string> {
  const primary = join(root, "primary.mp4");
  const cover = join(root, "cover.jpg");
  const source = join(root, "source.mp4");
  await run("ffmpeg", [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=s=160x96:r=24:d=1",
    "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=32000:duration=1.05",
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    primary,
  ]);
  await run("ffmpeg", [
    "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=160x96", "-frames:v", "1", cover,
  ]);
  await run("ffmpeg", [
    "-v", "error", "-y", "-i", primary, "-i", cover,
    "-map", "0:v:0", "-map", "0:a:0", "-map", "1:v:0",
    "-c", "copy", "-disposition:v:1", "attached_pic", source,
  ]);
  return source;
}

function need(
  id: string,
  capability: CapabilityRef,
  returns: TypeRef,
  constraints: CanonicalValue,
): Need {
  return {
    id,
    capability,
    returns,
    constraints,
    requestedBy: `derivation:${id}`,
    result: `record:${id}`,
    accepts: "exact",
    conformanceFloor: "exact",
    requestDigest: digestOf({ capability, returns, constraints }),
  };
}

async function fulfillInline(artifacts: MemoryArtifactStore, request: Need): Promise<CanonicalValue> {
  const provider = await handlerFor(request);
  const result = await provider.handler({
    command: { kind: "fulfill-need", id: `command:${request.id}`, need: request },
    need: request,
    artifacts,
    credentials: {},
  });
  assert.equal(result.value.kind, "inline");
  return result.value.kind === "inline" ? result.value.value : null;
}

async function handlerFor(request: Need): Promise<{ handler: ImmediateEndpointHandler; registration: EndpointRegistration }> {
  const registry = new EndpointRegistry();
  await createLocalMediaProvider({ processTimeoutMs: 30_000 }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  return { handler: resolution.registration.handler, registration: resolution.registration };
}

async function inspectArtifact(artifacts: MemoryArtifactStore, source: Awaited<ReturnType<MemoryArtifactStore["put"]>>) {
  const constraints = canonicalize({ contract: "svml.inspect-media-request@1", source });
  const request = need("need:media-inspect", mediaPipelineCapabilities.inspect,
    contractTypes.mediaInspection, constraints);
  const provider = await handlerFor(request);
  const result = await provider.handler({
    command: { kind: "fulfill-need", id: "command:media-inspect", need: request },
    need: request,
    artifacts,
    credentials: {},
  });
  assert.equal(result.value.kind, "inline");
  const value = result.value.kind === "inline" ? result.value.value : null;
  verifyMediaInspection(value);
  return value as unknown as MediaInspection;
}

async function normalizeArtifact(args: {
  artifacts: MemoryArtifactStore;
  source: Awaited<ReturnType<MemoryArtifactStore["put"]>>;
  inspection: MediaInspection;
  selection: ReturnType<typeof selectMediaStreams>;
  frameRate: { readonly numerator: number; readonly denominator: number };
}): Promise<SynchronizedMedia> {
  const constraints = canonicalize({
    contract: "svml.normalize-media-request@1",
    source: args.source,
    inspection: args.inspection,
    selection: args.selection,
    frameRate: args.frameRate,
    audio: { sampleRate: 48_000, channels: 2, codec: "pcm_s16le", loudness: "preserve" },
  });
  const request = need("need:media-normalize", mediaPipelineCapabilities.normalize,
    contractTypes.synchronizedMedia, constraints);
  const provider = await handlerFor(request);
  const result = await provider.handler({
    command: { kind: "fulfill-need", id: "command:media-normalize", need: request },
    need: request,
    artifacts: args.artifacts,
    credentials: {},
  });
  assert.equal(result.value.kind, "inline");
  const value = result.value.kind === "inline" ? result.value.value : null;
  verifySynchronizedMedia(value);
  return value as unknown as SynchronizedMedia;
}

test("local media Provider enumerates attached pictures and jointly normalizes 32k AAC without inventing speech", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-provider-media-local-"));
  try {
    const sourcePath = await fixture(root);
    const artifacts = new MemoryArtifactStore();
    const source = await artifacts.put(await readFile(sourcePath), "video/mp4");
    const typedInspection = await inspectArtifact(artifacts, source);
    assert.deepEqual(typedInspection.streams.map((stream) => [stream.index, stream.kind,
      stream.kind === "video" ? stream.role : stream.codecName]), [
      [0, "video", "moving"],
      [1, "audio", "aac"],
      [2, "video", "attached-picture"],
    ]);
    const audio = typedInspection.streams.find((stream) => stream.kind === "audio");
    assert.equal(audio?.kind === "audio" && audio.sampleRate, 32_000);

    const selectionRequest = sealMediaSelectionRequest({
      contract: "svml.media-selection-request@1",
      video: { mode: "primary-moving" },
      audio: { mode: "default" },
      spanAuthority: "video",
      frameRate: { numerator: 30, denominator: 1 },
    });
    const selection = selectMediaStreams(typedInspection, selectionRequest);
    assert.equal(selection.videoStreamIndex, 0);
    assert.equal(selection.audioStreamIndex, 1);
    const typed = await normalizeArtifact({ artifacts, source, inspection: typedInspection,
      selection, frameRate: selectionRequest.frameRate });
    assert.equal(typed.timeline.frameCount, 30);
    assert.equal(typed.timeline.sampleFrames, 48_000);
    assert.equal(typed.visual?.sourceStreamIndex, 0);
    assert.equal(typed.visual?.muted, true);
    assert.equal(typed.audio?.sourceStreamIndex, 1);
    assert.equal(typed.audio?.sampleRate, 48_000);
    assert.equal(typed.audio?.channels, 2);
    assert.equal(typed.sourceMap.audioHeadSamples + typed.sourceMap.audioContentSamples
      + typed.sourceMap.audioTailSamples, typed.timeline.sampleFrames);
    assert.ok(typed.sourceMap.audioTrimEndSamples > 0, "AAC tail beyond the final picture must be trimmed");
    assert.equal(typed.sourceMap.audioHeadSamples, 0);
    assert.equal("basisDigest" in typed, false);
    assert.equal("narrativeDigest" in typed, false);
    assert.equal(await artifacts.has(typed.visual!.artifact.digest), true);
    assert.equal(await artifacts.has(typed.audio!.artifact.digest), true);

    const visualBytes = await artifacts.get(typed.visual!.artifact.digest);
    assert(visualBytes !== undefined);
    const visualPath = join(root, "normalized-visual.mp4");
    await writeFile(visualPath, visualBytes);
    const probePath = join(root, "normalized-probe.json");
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffprobe", ["-v", "error", "-show_streams", "-of", "json", visualPath], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const chunks: Buffer[] = [];
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on("error", reject);
      child.on("close", async (code) => {
        if (code !== 0) reject(new Error(stderr));
        else {
          await writeFile(probePath, Buffer.concat(chunks));
          resolve();
        }
      });
    });
    const outputProbe = JSON.parse((await readFile(probePath)).toString("utf8")) as {
      streams: Array<{ codec_type: string; nb_frames?: string }>;
    };
    assert.deepEqual(outputProbe.streams.map((stream) => stream.codec_type), ["video"]);
    assert.equal(outputProbe.streams[0]?.nb_frames, "30");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local media Provider derives one exact 16 kHz mono WhisperX evidence artifact without a hidden second transcode", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-provider-media-evidence-"));
  try {
    const sourcePath = join(root, "speech-master.wav");
    await run("ffmpeg", [
      "-v", "error", "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
      "-af", "atrim=start_sample=0:end_sample=48001,asetpts=N/SR/TB,aformat=sample_rates=48000:channel_layouts=stereo",
      "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", sourcePath,
    ]);
    const artifacts = new MemoryArtifactStore();
    const source = await artifacts.put(await readFile(sourcePath), "audio/wav");
    const constraints = canonicalize({
      contract: "svml.project-speech-evidence-audio-request@1",
      source,
      sourceSampleRate: 48_000,
      sourceChannels: 2,
      sourceCodec: "pcm_s16le",
      sourceSampleFrames: 48_001,
      evidenceSampleRate: 16_000,
      evidenceChannels: 1,
      evidenceCodec: "pcm_s16le",
      evidenceSampleFrames: 16_000,
      durationSec: 48_001 / 48_000,
      segments: [{
        segmentId: "line",
        startSec: 0,
        endSec: 48_001 / 48_000,
      }],
    });
    const request = need(
      "need:speech-evidence-audio",
      mediaPipelineCapabilities.projectSpeechEvidenceAudio,
      contractTypes.speechEvidenceAudio,
      constraints,
    );
    const value = await fulfillInline(artifacts, request);
    assertSpeechEvidenceAudioIdentity(value as unknown as SpeechEvidenceAudio);
    const evidence = value as unknown as SpeechEvidenceAudio;
    assert.equal(evidence.sampleMap.sourceSampleFrames, 48_001);
    assert.equal(evidence.sampleMap.evidenceSampleFrames, 16_000);
    assert.equal(evidence.sampleMap.sourceOriginSample, 0);
    assert.equal(evidence.sampleMap.evidenceOriginSample, 0);
    assert.equal(evidence.sampleFrames, 16_000);
    const inspected = await inspectArtifact(artifacts, evidence.artifact);
    const audio = inspected.streams.find((stream) => stream.kind === "audio");
    assert.equal(audio?.kind, "audio");
    assert.equal(audio?.kind === "audio" && audio.codecName, "pcm_s16le");
    assert.equal(audio?.kind === "audio" && audio.sampleRate, 16_000);
    assert.equal(audio?.kind === "audio" && audio.channels, 1);
    assert.equal(audio?.kind === "audio" && audio.decodedSampleFrames, 16_000);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

test("local media Provider preserves one source A/V origin when audio starts later than picture", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-provider-media-offset-"));
  try {
    const sourcePath = join(root, "offset.mkv");
    await run("ffmpeg", [
      "-v", "error", "-y", "-copyts",
      "-f", "lavfi", "-i", "testsrc2=s=160x96:r=24:d=1",
      "-f", "lavfi", "-i", "sine=frequency=700:sample_rate=48000:duration=0.6",
      "-filter_complex", "[0:v]setpts=PTS+0.4/TB[v];[1:a]asetpts=PTS+0.6/TB[a]",
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "pcm_s16le", "-avoid_negative_ts", "disabled",
      sourcePath,
    ]);
    const artifacts = new MemoryArtifactStore();
    const source = await artifacts.put(await readFile(sourcePath), "video/x-matroska");
    const inspection = await inspectArtifact(artifacts, source);
    const request = sealMediaSelectionRequest({
      contract: "svml.media-selection-request@1",
      video: { mode: "primary-moving" },
      audio: { mode: "default" },
      spanAuthority: "video",
      frameRate: { numerator: 30, denominator: 1 },
    });
    const selection = selectMediaStreams(inspection, request);
    const normalized = await normalizeArtifact({ artifacts, source, inspection, selection, frameRate: request.frameRate });
    const video = inspection.streams.find((stream) => stream.kind === "video" && stream.index === selection.videoStreamIndex)!;
    const audio = inspection.streams.find((stream) => stream.kind === "audio" && stream.index === selection.audioStreamIndex)!;
    assert(video.startPts !== undefined && audio.startPts !== undefined && audio.endPts !== undefined);
    const seconds = (value: NonNullable<typeof video.startPts>) =>
      Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
    const expectedHead = Math.round((seconds(audio.startPts) - seconds(video.startPts)) * 48_000);
    const expectedEnd = Math.round((seconds(audio.endPts) - seconds(video.startPts)) * 48_000);
    const expectedTail = 48_000 - Math.min(48_000, expectedEnd);
    assert.equal(normalized.timeline.frameCount, 30);
    assert.equal(normalized.timeline.sampleFrames, 48_000);
    assert.equal(normalized.sourceMap.audioHeadSamples, expectedHead,
      "normalized audio head must preserve the measured stream-start offset");
    assert.equal(normalized.sourceMap.audioTailSamples, expectedTail,
      "normalized audio tail must preserve the measured stream end");
    assert.ok(normalized.sourceMap.audioHeadSamples > 9_000, "fixture must retain a substantial audio lag");
    assert.equal(normalized.sourceMap.audioTrimStartSamples, 0);
    assert.equal(normalized.sourceMap.audioTrimEndSamples, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a silent generated MP4 remains a visual-only product and cannot satisfy a requested audio stream", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-provider-media-silent-"));
  try {
    const sourcePath = join(root, "silent.mp4");
    await run("ffmpeg", [
      "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x96:r=24:d=0.5",
      "-frames:v", "12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", sourcePath,
    ]);
    const artifacts = new MemoryArtifactStore();
    const source = await artifacts.put(await readFile(sourcePath), "video/mp4");
    const inspection = await inspectArtifact(artifacts, source);
    const request = sealMediaSelectionRequest({
      contract: "svml.media-selection-request@1",
      video: { mode: "primary-moving" },
      audio: { mode: "none" },
      spanAuthority: "video",
      frameRate: { numerator: 30, denominator: 1 },
    });
    const selection = selectMediaStreams(inspection, request);
    const normalized = await normalizeArtifact({ artifacts, source, inspection, selection, frameRate: request.frameRate });
    assert.equal(normalized.timeline.frameCount, 15);
    assert.ok(normalized.visual);
    assert.equal(normalized.audio, undefined);
    assert.deepEqual({
      trimStart: normalized.sourceMap.audioTrimStartSamples,
      trimEnd: normalized.sourceMap.audioTrimEndSamples,
      head: normalized.sourceMap.audioHeadSamples,
      content: normalized.sourceMap.audioContentSamples,
      tail: normalized.sourceMap.audioTailSamples,
    }, { trimStart: 0, trimEnd: 0, head: 0, content: 0, tail: 0 });

    const invalid = sealMediaSelectionRequest({
      contract: "svml.media-selection-request@1",
      video: { mode: "primary-moving" },
      audio: { mode: "default" },
      spanAuthority: "video",
      frameRate: { numerator: 30, denominator: 1 },
    });
    assert.throws(() => selectMediaStreams(inspection, invalid), /no eligible stream/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local media Provider renders one frame-domain audio plan and muxes exactly one silent visual with it", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-provider-media-program-"));
  try {
    const firstPath = join(root, "first.wav");
    const secondPath = join(root, "second.wav");
    const visualPath = join(root, "visual.mp4");
    await Promise.all([
      run("ffmpeg", [
        "-v", "error", "-y", "-f", "lavfi", "-i",
        "sine=frequency=440:sample_rate=48000:duration=0.5",
        "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", firstPath,
      ]),
      run("ffmpeg", [
        "-v", "error", "-y", "-f", "lavfi", "-i",
        "sine=frequency=880:sample_rate=48000:duration=0.5",
        "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", secondPath,
      ]),
      run("ffmpeg", [
        "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x96:r=30:d=1",
        "-frames:v", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", visualPath,
      ]),
    ]);

    const artifacts = new MemoryArtifactStore();
    const [first, second, visualArtifact] = await Promise.all([
      artifacts.put(await readFile(firstPath), "audio/wav"),
      artifacts.put(await readFile(secondPath), "audio/wav"),
      artifacts.put(await readFile(visualPath), "video/mp4"),
    ]);
    const plan = sealAudioProgramPlan({
      contract: "svml.audio-program-plan@1",
      frameRate: { numerator: 30, denominator: 1 },
      frameCount: 30,
      sampleRate: 48_000,
      sampleFrames: 48_000,
      clips: [
        {
          id: "speech:first",
          artifact: first,
          targetStartSample: 0,
          targetEndSampleExclusive: 24_000,
          sourceStartSample: 0,
          playbackRate: 1,
          gain: 1,
          fadeInSamples: 0,
          fadeOutSamples: 0,
          bus: "speech",
        },
        {
          id: "speech:second",
          artifact: second,
          targetStartSample: 24_000,
          targetEndSampleExclusive: 48_000,
          sourceStartSample: 0,
          playbackRate: 1,
          gain: 1,
          fadeInSamples: 0,
          fadeOutSamples: 0,
          bus: "speech",
        },
      ],
      mix: { normalize: false, limiter: "none" },
    });
    const audioRequest = need(
      "need:render-program-audio",
      mediaPipelineCapabilities.renderAudio,
      contractTypes.timelineAudio,
      canonicalize({ contract: "svml.render-audio-request@1", plan }),
    );
    const audioValue = await fulfillInline(artifacts, audioRequest);
    verifyTimelineAudio(audioValue);
    const audio = audioValue as unknown as TimelineAudio;
    assert.equal(audio.sampleFrames, 48_000);
    assert.equal(await artifacts.has(audio.artifact.digest), true);

    const visual = sealRenderedVisual({
      contract: "svml.rendered-visual@1",
      frameRate: { numerator: 30, denominator: 1 },
      frameCount: 30,
      canvas: { width: 160, height: 96 },
      artifact: visualArtifact,
      muted: true,
    });
    const muxRequest = need(
      "need:mux-program-media",
      mediaPipelineCapabilities.mux,
      contractTypes.muxedMedia,
      canonicalize({ contract: "svml.mux-media-request@1", visual, audio }),
    );
    const muxValue = await fulfillInline(artifacts, muxRequest);
    verifyMuxedMedia(muxValue);
    const muxed = muxValue as unknown as MuxedMedia;
    assert.equal(muxed.presentationSampleFrames, 48_000);
    assert.equal(await artifacts.has(muxed.artifact.digest), true);

    const inspection = await inspectArtifact(artifacts, muxed.artifact);
    const videos = inspection.streams.filter((stream) => stream.kind === "video");
    const audios = inspection.streams.filter((stream) => stream.kind === "audio");
    assert.equal(inspection.streams.length, 2);
    assert.equal(videos.length, 1);
    assert.equal(videos[0]?.decodedUnitCount, 30);
    assert.equal(audios.length, 1);
    assert.equal(audios[0]?.kind === "audio" && audios[0].sampleRate, 48_000);
    assert.equal(audios[0]?.kind === "audio" && audios[0].channels, 2);
    assert.equal(audios[0]?.kind === "audio" && presentationSampleFrames(audios[0]), 48_000,
      "AAC packet duration/padding metadata must preserve the authoritative presentation span");
    assert.ok(audios[0]?.kind === "audio" && audios[0].decodedSampleFrames >= 48_000,
      "AAC coding frames may include padding, but must cover the complete presentation span");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
