import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { artifactTypes } from "@narratage/artifact";
import { mediaTypes, sealRenderedVisual, synchronizedMediaSampleFrames, verifyMediaInspection, verifyMuxedMedia, verifySynchronizedMedia, verifyTimelineAudio } from "@narratage/media";
import type { MediaAudioStream, MediaInspection, MuxedMedia, SynchronizedMedia, TimelineAudio } from "@narratage/media";
import { assertSpeechEvidenceAudioIdentity, speechTypes } from "@narratage/speech";
import type { SpeechEvidenceAudio } from "@narratage/speech";
import assert from "node:assert/strict";
import {
  MemoryArtifactStore,
  EndpointRegistry,
} from "@narratage/driver-node";
import type { EndpointRegistration } from "@narratage/driver-node";
import type { ImmediateEndpointHandler } from "@narratage/endpoint-kit";
import {
  mediaPipelineCapabilities,
  sealAudioProgramPlan,
  sealMediaSelectionRequest,
  selectMediaStreams,
} from "@narratage/media-pipeline";
import { canonicalize } from "@narratage/protocol";
import type { CapabilityRef, CanonicalValue, Need, TypeRef } from "@narratage/protocol";

import { createLocalMediaProvider } from "../src/index.js";
import { localMediaToolchainProgram } from "../src/program.js";

const hasMediaBinaries = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
  && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

test("the local media Provider declares its external toolchain without owning a second daemon", async () => {
  const program = localMediaToolchainProgram({ dataRoot: "/project", instance: "media", config: {} });
  assert.equal(program.id, "media-ffmpeg-toolchain");
  assert.equal(program.prepare, undefined);
  assert.equal(program.start, undefined);
  const state = await program.probe();
  assert.equal(state.state, hasMediaBinaries ? "ready" : "down");
});

// Five 64x48 lossless frames at 100 ms each. Later frames are partial alpha
// rectangles, so this fixture exercises WebP blend and canvas persistence.
const animatedWebp = Buffer.from([
  "UklGRjQEAABXRUJQVlA4WAoAAAASAAAAPwAALwAAQU5JTQYAAAAAbPz/AABBTk1GpgIAAAAAAAAAAD8AAC8AAGQAAAJWUDhMjQIAAC8/wAsAp8EQkiRJeQ9KwxzeARbKgjBq20iQd/egFMzCOSgH58AUyjwIBCEy0kojzX8gd0AYXnAa/lMIRRkGIQiDELwMG5RBcaEUJQhCDyEIwkotw3l4P34IQlA+o4RdINm27bZt6KLGC9aIhJAnMGqge/f/fxzee1C06Iwyiei/A7dtI6nGCh0PvOk1g3nD02opOIu6Seg2ofsrKS4wj3qYs66vH6+l1G/59+0qqXlC1wktVyYwAaBPqCorqTI7pYgRASOzP2iulqdwCiEYGHS9ZlFpnpIKo+bxoJmAiej6XvoxX3C/qs4gqG6I+WMS5nQpMgWEUfqq30sg0I72QFk473xR9L1MtLXzzhtjgttxAYyCAaPzzpd35Z3zq2UI5mWXg3Z59+kauK9Sox42v7B9NlkcFxfQ9/Hq17l7LrtPv57NALIADBFZThD1XetdU1Vk2SYiy/eJEPI3D4xk+T/FOA+zmYElA85Z4gTnGj+0RWUp2hmPhwOWwgi/y8NoiROWuIBEvnMgS7Yeftdk9bkj23hveDx44QL63PH4hlqOcyGA7S63ZKn+HmpL2rbUuD9iPYznAtq2VH981WKcH0nbKttGu6rqhG2VbUVf20eyl9j1R8I+KfsUAby+a/uQsvFKeb73KL9c0/jPItqxXFW2g1vDD8a8OHABjHjzHHjj8X3dlc+uYQAb2hHyrnS0cUUZ0dYRdbuh3TYzmdmJAmFEDoQR8G7H4yu9EzDA+edOhItLnjvBo7SZFzx32UkqU8891HPfy2dPAMB0752FwnTvHW1P9d5J2VO9dy6wKxk+B/3eSduzye3/gOdOabrvNm6LSZvGdN+dE178mKYTix8NHeCE8H/UxT9/7q4BAEFOTUZSAAAAAAAAAAAABwAACQAAZAAAAFZQOEw6AAAALwdAAhA/EIraSIFWzCkFgchDCg+BQJK/ypDPf4C3zAiyOaCQkSTmFA7mCd6k+0M0hIj+JwfeYjBtNEFOTUZOAAAAAAAAAQAACQAABwAAZAAAAFZQOEw2AAAALwnAARA3MGxq2jZgCrD8NaH0mKr5D8A1EMgogKBt25jCxuUIqvE4fxolEdH/GGRxg/T6q+kDQU5NRl4AAAABAAABAAAJAAAJAABkAAAAVlA4TEYAAAAvCUACEEcgFkzmfwUYmEK2EaCDmT/PfTBTNf9BQOA5mQ8F4KiRJEeKdUCq1r0dkMV01I9ERP+jbSWJ4gre4grOQv78FnwHQU5NRkQAAAACAAACAAAHAAAJAABkAAAAVlA4TCwAAAAvB0ACECcQAoFkmPyJhpmq+Y8gbqCQjSRoGNZgzuDz5zuEiP5nKqXKvxvuAA==",
].join(""), "base64");

async function run(executable: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${executable} ${String(code)}: ${stderr}`)));
  });
}

function rampWav(sampleFrames: number): Buffer {
  const dataBytes = sampleFrames * 2 * 2;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(36 + dataBytes, 4); bytes.write("WAVE", 8);
  bytes.write("fmt ", 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(48_000, 24); bytes.writeUInt32LE(48_000 * 4, 28);
  bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < sampleFrames; frame += 1) {
    const value = frame + 1;
    bytes.writeInt16LE(value, 44 + frame * 4);
    bytes.writeInt16LE(value, 46 + frame * 4);
  }
  return bytes;
}

function pcm16StereoAudibleSpan(bytes: Uint8Array): {
  readonly firstSample: number;
  readonly endSampleExclusive: number;
  readonly sampleFrames: number;
} {
  const wav = Buffer.from(bytes);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  let dataStart = -1;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      assert.equal(wav.readUInt16LE(offset + 8), 1);
      assert.equal(wav.readUInt16LE(offset + 10), 2);
      assert.equal(wav.readUInt32LE(offset + 12), 48_000);
      assert.equal(wav.readUInt16LE(offset + 22), 16);
    }
    if (id === "data") {
      dataStart = offset + 8;
      dataBytes = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  assert(dataStart >= 0 && dataStart + dataBytes <= wav.length, "normalized WAV has no complete data chunk");
  const sampleFrames = Math.floor(dataBytes / 4);
  let firstSample = sampleFrames;
  let endSampleExclusive = 0;
  for (let frame = 0; frame < sampleFrames; frame += 1) {
    const offset = dataStart + frame * 4;
    if (Math.max(Math.abs(wav.readInt16LE(offset)), Math.abs(wav.readInt16LE(offset + 2))) > 64) {
      firstSample = Math.min(firstSample, frame);
      endSampleExclusive = frame + 1;
    }
  }
  assert(firstSample < endSampleExclusive, "normalized WAV contains no audible samples");
  return { firstSample, endSampleExclusive, sampleFrames };
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

async function fixture(dataRoot: string): Promise<string> {
  const primary = join(dataRoot, "primary.mp4");
  const cover = join(dataRoot, "cover.jpg");
  const source = join(dataRoot, "source.mp4");
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
    result: `record:${id}`,
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
  const constraints = canonicalize({ source });
  const request = need("need:media-inspect", mediaPipelineCapabilities.inspect,
    mediaTypes.inspection, constraints);
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
    source: args.source,
    inspection: args.inspection,
    selection: args.selection,
    frameRate: args.frameRate,
    audio: { sampleRate: 48_000, channels: 2, codec: "pcm_s16le", loudness: "preserve" },
  });
  const request = need("need:media-normalize", mediaPipelineCapabilities.normalize,
    mediaTypes.synchronized, constraints);
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
  const root = await mkdtemp(join(tmpdir(), "narratage-provider-media-local-"));
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
    assert.equal(synchronizedMediaSampleFrames(typed), 48_000);
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
    const audioOutput = await inspectArtifact(artifacts, typed.audio!.artifact);
    const normalizedAudio = audioOutput.streams.find((stream) => stream.kind === "audio");
    assert.equal(normalizedAudio?.kind === "audio" && normalizedAudio.sampleRate, 48_000);
    assert.equal(normalizedAudio?.kind === "audio" && normalizedAudio.channels, 2);
    assert.equal(normalizedAudio?.kind === "audio" && normalizedAudio.decodedSampleFrames, 48_000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local media normalization materializes rotation and sample aspect before Spatial", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-provider-media-display-geometry-"));
  try {
    const base = join(root, "base.mp4");
    const sourcePath = join(root, "rotated.mp4");
    await run("ffmpeg", [
      "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x96:r=4:d=0.5",
      "-vf", "setsar=2/1", "-c:v", "libx264", "-pix_fmt", "yuv420p", base,
    ]);
    await run("ffmpeg", [
      "-v", "error", "-y", "-display_rotation", "90", "-i", base, "-c", "copy", sourcePath,
    ]);
    const artifacts = new MemoryArtifactStore();
    const source = await artifacts.put(await readFile(sourcePath), "video/mp4");
    const inspection = await inspectArtifact(artifacts, source);
    const inputVideo = inspection.streams.find((stream) => stream.kind === "video");
    assert.equal(inputVideo?.kind, "video");
    if (inputVideo?.kind !== "video") return;
    assert.deepEqual(inputVideo.sampleAspectRatio, { numerator: 2, denominator: 1 });
    assert.equal(inputVideo.rotationDegrees, 90);
    const request = sealMediaSelectionRequest({
      video: { mode: "primary-moving" }, audio: { mode: "none" },
      spanAuthority: "video", frameRate: { numerator: 4, denominator: 1 },
    });
    const selection = selectMediaStreams(inspection, request);
    const normalized = await normalizeArtifact({ artifacts, source, inspection, selection, frameRate: request.frameRate });
    assert.equal(normalized.visual?.width, 96);
    assert.equal(normalized.visual?.height, 320);
    const output = await inspectArtifact(artifacts, normalized.visual!.artifact);
    const outputVideo = output.streams.find((stream) => stream.kind === "video");
    assert.equal(outputVideo?.kind, "video");
    if (outputVideo?.kind !== "video") return;
    assert.deepEqual(outputVideo.sampleAspectRatio, { numerator: 1, denominator: 1 });
    assert.equal(outputVideo.rotationDegrees, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("animated WebP keeps its authored frame timing before fixed-rate normalization", {
  skip: !hasMediaBinaries,
}, async () => {
  const artifacts = new MemoryArtifactStore();
  const source = await artifacts.put(animatedWebp, "image/webp");
  const inspection = await inspectArtifact(artifacts, source);
  assert.deepEqual(inspection.container.formatNames, ["webp", "webp-animation"]);
  assert.deepEqual(inspection.streams.map((stream) => [stream.kind, stream.kind === "video" ? stream.role : undefined,
    stream.decodedUnitCount]), [["video", "moving", 5]]);
  const video = inspection.streams[0];
  assert.equal(video?.kind, "video");
  assert.equal(video?.startPts?.ticks, "0");
  assert.equal(video?.endPts?.ticks, "500");
  const request = sealMediaSelectionRequest({
    video: { mode: "primary-moving" },
    audio: { mode: "none" },
    spanAuthority: "video",
    frameRate: { numerator: 20, denominator: 1 },
  });
  const selection = selectMediaStreams(inspection, request);
  const normalized = await normalizeArtifact({ artifacts, source, inspection, selection, frameRate: request.frameRate });
  assert.equal(normalized.timeline.frameCount, 10);
  assert.equal(normalized.visual?.width, 64);
  assert.equal(normalized.visual?.height, 48);
  const output = await inspectArtifact(artifacts, normalized.visual!.artifact);
  assert.equal(output.streams[0]?.decodedUnitCount, 10);
});

test("animated GIF keeps its authored frame timing before fixed-rate normalization", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-provider-media-gif-"));
  try {
    const path = join(root, "animated.gif");
    await run("ffmpeg", [
      "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=64x48:r=10:d=0.5",
      "-frames:v", "5", path,
    ]);
    const artifacts = new MemoryArtifactStore();
    const source = await artifacts.put(await readFile(path), "image/gif");
    const inspection = await inspectArtifact(artifacts, source);
    assert.deepEqual(inspection.streams.map((stream) => [stream.kind, stream.kind === "video" ? stream.role : undefined,
      stream.decodedUnitCount]), [["video", "moving", 5]]);
    const request = sealMediaSelectionRequest({
      video: { mode: "primary-moving" },
      audio: { mode: "none" },
      spanAuthority: "video",
      frameRate: { numerator: 20, denominator: 1 },
    });
    const selection = selectMediaStreams(inspection, request);
    const normalized = await normalizeArtifact({ artifacts, source, inspection, selection, frameRate: request.frameRate });
    assert.equal(normalized.timeline.frameCount, 10);
    const output = await inspectArtifact(artifacts, normalized.visual!.artifact);
    assert.equal(output.streams[0]?.decodedUnitCount, 10);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local media Provider derives one exact 16 kHz mono WhisperX evidence artifact without a hidden second transcode", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-provider-media-evidence-"));
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
      source,
      sourceSampleFrames: 48_001,
      evidenceSampleFrames: 16_000,
    });
    const request = need(
      "need:speech-evidence-audio",
      mediaPipelineCapabilities.projectSpeechEvidenceAudio,
      speechTypes.evidenceAudio,
      constraints,
    );
    const value = await fulfillInline(artifacts, request);
    assertSpeechEvidenceAudioIdentity(value as unknown as SpeechEvidenceAudio);
    const evidence = value as unknown as SpeechEvidenceAudio;
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
  const root = await mkdtemp(join(tmpdir(), "narratage-provider-media-offset-"));
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
    const bytes = await artifacts.get(normalized.audio!.artifact.digest);
    assert(bytes !== undefined);
    const audible = pcm16StereoAudibleSpan(bytes);
    assert.equal(audible.sampleFrames, 48_000);
    assert.ok(Math.abs(audible.firstSample - expectedHead) <= 64,
      `normalized audio begins at ${audible.firstSample}, expected ${expectedHead}`);
    assert.ok(Math.abs(audible.endSampleExclusive - (48_000 - expectedTail)) <= 64,
      `normalized audio ends at ${audible.endSampleExclusive}, expected ${48_000 - expectedTail}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a silent generated MP4 remains a visual-only product and cannot satisfy a requested audio stream", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-provider-media-silent-"));
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

    const invalid = sealMediaSelectionRequest({
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

test("local media Provider transforms A/V and extracts ordinary audio and frame Artifacts", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-provider-media-ordinary-ops-"));
  try {
    const sourcePath = await fixture(root);
    const artifacts = new MemoryArtifactStore();
    const source = await artifacts.put(await readFile(sourcePath), "video/mp4");
    const inspection = await inspectArtifact(artifacts, source);
    const selectionRequest = sealMediaSelectionRequest({
      video: { mode: "primary-moving" },
      audio: { mode: "default" },
      spanAuthority: "video",
      frameRate: { numerator: 30, denominator: 1 },
    });
    const selection = selectMediaStreams(inspection, selectionRequest);
    const normalized = await normalizeArtifact({
      artifacts, source, inspection, selection, frameRate: selectionRequest.frameRate,
    });
    const executeArtifact = async (request: Need) => {
      const provider = await handlerFor(request);
      const result = await provider.handler({
        command: { kind: "fulfill-need", id: `command:${request.id}`, need: request },
        need: request,
        artifacts,
        credentials: {},
      });
      assert.equal(result.value.kind, "blob");
      return result.value.kind === "blob" ? result.value : (() => { throw new Error("expected BlobArtifact"); })();
    };

    const transformed = await executeArtifact(need(
      "need:transform",
      mediaPipelineCapabilities.transform,
      artifactTypes.blob,
      canonicalize({
        media: normalized,
        program: {
          operations: [
            { kind: "trim", tailSec: 0.2 },
            { kind: "retime", rate: 2, pitch: "preserve" },
          ],
        },
      }),
    ));
    const transformedInspection = await inspectArtifact(artifacts, transformed);
    assert.equal(transformedInspection.streams.find((item) => item.kind === "video")?.decodedUnitCount, 12);

    const audioIndex = inspection.streams.find((item) => item.kind === "audio")!.index;
    const extractedAudio = await executeArtifact(need(
      "need:extract-audio",
      mediaPipelineCapabilities.extractAudio,
      artifactTypes.blob,
      canonicalize({
        source,
        streamIndex: audioIndex,
        output: { container: "wav", codec: "pcm_s16le", sampleRate: 48_000, channels: 2 },
      }),
    ));
    assert.equal(extractedAudio.mediaType, "audio/wav");
    const audioInspection = await inspectArtifact(artifacts, extractedAudio);
    const audio = audioInspection.streams.find((item) => item.kind === "audio");
    assert.ok(audio?.kind === "audio" && audio.sampleRate === 48_000 && audio.channels === 2);

    const video = inspection.streams.find((item) => item.kind === "video" && item.role === "moving")!;
    const extractedFrame = await executeArtifact(need(
      "need:extract-frame",
      mediaPipelineCapabilities.extractFrame,
      artifactTypes.blob,
      canonicalize({
        source,
        streamIndex: video.index,
        sourceFrameCount: video.decodedUnitCount,
        at: { kind: "last" },
        output: { format: "png" },
      }),
    ));
    assert.equal(extractedFrame.mediaType, "image/png");
    const frameInspection = await inspectArtifact(artifacts, extractedFrame);
    assert.equal(frameInspection.streams.find((item) => item.kind === "video")?.decodedUnitCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

test("local media Provider renders one frame-domain audio plan and muxes exactly one silent visual with it", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-provider-media-program-"));
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
          sourceSampleFrames: 24_000,
          sourceStartSample: 0,
          sourceEndSampleExclusive: 24_000,
          sourceLoop: false,
          sourcePhaseSample: 0,
          playbackRate: 1,
          pitch: "preserve",
          gain: 1,
          fadeInSamples: 0,
          fadeOutSamples: 0,
        },
        {
          id: "speech:second",
          artifact: second,
          targetStartSample: 24_000,
          targetEndSampleExclusive: 48_000,
          sourceSampleFrames: 24_000,
          sourceStartSample: 0,
          sourceEndSampleExclusive: 24_000,
          sourceLoop: false,
          sourcePhaseSample: 0,
          playbackRate: 1,
          pitch: "preserve",
          gain: 1,
          fadeInSamples: 0,
          fadeOutSamples: 0,
        },
      ],
      mix: { normalize: false, limiter: "none" },
    });
    const audioRequest = need(
      "need:render-program-audio",
      mediaPipelineCapabilities.renderAudio,
      mediaTypes.timelineAudio,
      canonicalize({ plan }),
    );
    const audioValue = await fulfillInline(artifacts, audioRequest);
    verifyTimelineAudio(audioValue);
    const audio = audioValue as unknown as TimelineAudio;
    assert.equal(audio.sampleFrames, 48_000);
    assert.equal(await artifacts.has(audio.artifact.digest), true);

    const visual = sealRenderedVisual({
      frameRate: { numerator: 30, denominator: 1 },
      frameCount: 30,
      canvas: { width: 160, height: 96 },
      artifact: visualArtifact,
    });
    const muxRequest = need(
      "need:mux-program-media",
      mediaPipelineCapabilities.mux,
      mediaTypes.muxed,
      canonicalize({ visual, audio }),
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

test("local media Provider executes an end-aligned loop from the exact authored sample phase", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "narratage-provider-media-loop-"));
  try {
    const artifacts = new MemoryArtifactStore();
    const source = await artifacts.put(rampWav(100), "audio/wav");
    const plan = sealAudioProgramPlan({
      frameRate: { numerator: 30, denominator: 1 },
      frameCount: 30,
      sampleRate: 48_000,
      sampleFrames: 48_000,
      clips: [{
        id: "loop:end",
        artifact: source,
        targetStartSample: 0,
        targetEndSampleExclusive: 250,
        sourceSampleFrames: 100,
        sourceStartSample: 0,
        sourceEndSampleExclusive: 100,
        sourceLoop: true,
        sourcePhaseSample: 50,
        playbackRate: 1,
        pitch: "preserve",
        gain: 1,
        fadeInSamples: 0,
        fadeOutSamples: 0,
      }],
      mix: { normalize: false, limiter: "none" },
    });
    const value = await fulfillInline(artifacts, need(
      "need:render-loop-audio",
      mediaPipelineCapabilities.renderAudio,
      mediaTypes.timelineAudio,
      canonicalize({ plan }),
    ));
    verifyTimelineAudio(value);
    const audio = value as unknown as TimelineAudio;
    assert.equal(audio.sampleFrames, 48_000);
    const wav = await artifacts.get(audio.artifact.digest);
    assert(wav);
    const wavPath = join(root, "loop.wav");
    const rawPath = join(root, "loop.raw");
    await writeFile(wavPath, wav);
    await run("ffmpeg", ["-v", "error", "-y", "-i", wavPath, "-f", "s16le", "-acodec", "pcm_s16le", rawPath]);
    const raw = await readFile(rawPath);
    assert.equal(raw.readInt16LE(0), 51, "end alignment must begin at source phase 50");
    assert.equal(raw.readInt16LE(49 * 4), 100);
    assert.equal(raw.readInt16LE(50 * 4), 1, "the complete authored source interval must loop");
    assert.equal(raw.readInt16LE(249 * 4), 100);
    assert.equal(raw.readInt16LE(250 * 4), 0, "silence is absence after the audible target interval");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
