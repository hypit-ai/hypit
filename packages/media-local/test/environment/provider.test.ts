import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { blobTypes } from "@hypit/blob";
import { mediaTypes, preparedAudioSource, prepareMedia, sealMediaDeliverySpec, sealTimelineVisual, sealTimelineAudio, verifyMediaInspection, verifyMuxedMedia, verifyTimelineAudio } from "@hypit/media";
import type { MediaAudioStream, MediaInspection, MuxedMedia, TimelineAudio, TimelineVisual } from "@hypit/media";
import { assertSpeechEvidenceAudioIdentity, speechEvidenceCapabilities, speechEvidenceTypes } from "@hypit/speech-evidence";
import type { SpeechEvidenceAudio } from "@hypit/speech-evidence";
import assert from "node:assert/strict";
import {
  MemoryResourceStore,
  EndpointRegistry,
} from "@hypit/executor";
import type { EndpointRegistration } from "@hypit/executor";
import type { ImmediateEndpointHandler } from "@hypit/endpoint";
import { installEndpoint } from "@hypit/endpoint";
import {
  mediaOperationsCapabilities,
  sealMediaSelectionRequest,
  selectMediaStreams,
  transformPreparedMedia,
} from "@hypit/media-operations";
import { audioProgramCapabilities, audioProgramGraphFromClips, sealAudioProgram } from "@hypit/audio-program";
import { preservePitch } from "@hypit/audio-stretch";
import { mediaDeliveryCapabilities } from "@hypit/media-delivery";
import { assertBlobRef, canonicalize } from "@hypit/protocol";
import type { CapabilityRef, CanonicalValue, Need, TypeRef } from "@hypit/protocol";
import { sealTemporalMap } from "@hypit/temporal";
import type { TemporalMapPiece } from "@hypit/temporal";
import { frameRangeFixture, frameSamplingMapFixture } from "../../../../test/temporal-fixture.js";

import { createLocalMediaProvider } from "../../src/index.js";

const hasMediaBinaries = spawnSync("ffmpeg", ["-version"], { stdio: "ignore", windowsHide: true }).status === 0
  && spawnSync("ffprobe", ["-version"], { stdio: "ignore", windowsHide: true }).status === 0;
const delivery = sealMediaDeliverySpec({
  visual: { picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
    colorRange: "limited", bitDepth: 8, alpha: { mode: "opaque", matte: "#000000" } },
  encoding: { codec: "h264", pixelFormat: "yuv420p", quality: "standard" } },
  audio: { codec: "aac", sampleRate: 48_000, channelLayout: "stereo" }, container: "mp4",
});

function preparedAudioProgramSource(id: string, source: import("@hypit/protocol").BlobRef, sampleFrames: number) {
  const media = prepareMedia({
    id,
    source,
    inspection: { container: { formatNames: ["wav"] }, streams: [{
      kind: "audio", index: 0, codecType: "audio", codecName: "pcm_s16le",
      disposition: { default: true, attachedPicture: false }, timingStatus: "admissible",
      timeBase: { numerator: 1, denominator: 48_000 },
      startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 48_000 } },
      endPts: { ticks: String(sampleFrames), timeBase: { numerator: 1, denominator: 48_000 } },
      decodedUnitCount: sampleFrames, sampleRate: 48_000, channels: 2, decodedSampleFrames: sampleFrames,
    }] },
    selection: { audioStreamIndex: 0, spanAuthority: "audio" },
  });
  return { source: preparedAudioSource(media), preparation: media.audio!.map };
}

function audioSampling(
  id: string,
  targetFrames: number,
  sourceFrames: number,
  piece: {
    readonly sourceAtStart?: { readonly numerator: number; readonly denominator: number };
    readonly rate?: { readonly numerator: number; readonly denominator: number };
    readonly wrap?: { readonly startFrame: number; readonly endFrameExclusive: number };
  } = {},
) {
  return frameSamplingMapFixture({
    targetId: `${id}:occurrence`, sourceId: id,
    targetFrameRate: { numerator: 48_000, denominator: 1 }, targetFrames,
    sourceFrameRate: { numerator: 48_000, denominator: 1 }, sourceFrames,
    pieces: [{ target: { startFrame: 0, endFrameExclusive: targetFrames },
      sourceAtStart: piece.sourceAtStart ?? { numerator: 0, denominator: 1 },
      rate: piece.rate ?? { numerator: 1, denominator: 1 },
      ...(piece.wrap === undefined ? {} : { wrap: piece.wrap }) }],
  });
}

const audioTarget = (startSample: number, endSampleExclusive: number) =>
  frameRangeFixture(startSample, endSampleExclusive, { numerator: 48_000, denominator: 1 });

async function run(executable: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...args], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${executable} ${String(code)}: ${stderr}`)));
  });
}

function runBytes(executable: string, args: readonly string[], input?: Uint8Array): Buffer {
  const result = spawnSync(executable, [...args], {
    ...(input === undefined ? {} : { input }),
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  assert.equal(result.status, 0, Buffer.from(result.stderr ?? []).toString());
  return Buffer.from(result.stdout ?? []);
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

async function fulfillInline(resources: MemoryResourceStore, request: Need): Promise<CanonicalValue> {
  const provider = await handlerFor(request);
  const result = await provider.handler({

    request: request,
    resources,
    credentials: {},
  });
  return result;
}

async function handlerFor(request: Need): Promise<{ handler: ImmediateEndpointHandler; registration: EndpointRegistration }> {
  const registry = new EndpointRegistry();
  await installEndpoint(createLocalMediaProvider({ processTimeoutMs: 30_000 }), registry);
  const resolution = registry.select(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  return { handler: resolution.registration.handler, registration: resolution.registration };
}

async function inspectArtifact(resources: MemoryResourceStore, source: Awaited<ReturnType<MemoryResourceStore["put"]>>) {
  const constraints = canonicalize({ source });
  const request = need("need:media-inspect", mediaOperationsCapabilities.inspect,
    mediaTypes.inspection, constraints);
  const provider = await handlerFor(request);
  const result = await provider.handler({

    request: request,
    resources,
    credentials: {},
  });
  const value = result;
  verifyMediaInspection(value);
  return value as unknown as MediaInspection;
}

test("local media Provider inspects moving picture, audio and attached picture without replacing the source", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-media-local-"));
  try {
    const sourcePath = await fixture(root);
    const resources = new MemoryResourceStore();
    const source = await resources.put(await readFile(sourcePath), "video/mp4");
    const inspection = await inspectArtifact(resources, source);
    assert.deepEqual(inspection.streams.map((stream) => [stream.index, stream.kind,
      stream.kind === "video" ? stream.role : stream.codecName]), [
      [0, "video", "moving"],
      [1, "audio", "aac"],
      [2, "video", "attached-picture"],
    ]);
    const selection = selectMediaStreams(inspection, sealMediaSelectionRequest({
      video: { mode: "primary-moving" },
      audio: { mode: "default" },
      spanAuthority: "video",
      picture: { mode: "explicit", interpretation: {
        colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709", colorRange: "limited",
        bitDepth: 8, alphaMode: "opaque",
      } },
    }));
    const prepared = prepareMedia({ id: "fixture", source, inspection, selection });
    assert.equal(prepared.source.resource, source.resource);
    assert.equal(prepared.visual?.streamIndex, 0);
    assert.equal(prepared.audio?.streamIndex, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("local media Provider derives exact 16 kHz evidence from retimed Prepared Media", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-provider-media-evidence-"));
  try {
    const sourcePath = join(root, "speech-master.wav");
    await run("ffmpeg", [
      "-v", "error", "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
      "-af", "atrim=start_sample=0:end_sample=48001,asetpts=N/SR/TB,aformat=sample_rates=48000:channel_layouts=stereo",
      "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", sourcePath,
    ]);
    const resources = new MemoryResourceStore();
    const source = await resources.put(await readFile(sourcePath), "audio/wav");
    const inspection = await inspectArtifact(resources, source);
    const prepared = prepareMedia({
      id: "speech",
      source,
      inspection,
      selection: selectMediaStreams(inspection, {
        video: { mode: "none" }, audio: { mode: "default" }, spanAuthority: "audio", picture: { mode: "none" },
      }),
    });
    const media = transformPreparedMedia(prepared, { operations: [{
      kind: "retime", rate: { numerator: 2, denominator: 1 },
    }] }, "speech-fast");
    const constraints = canonicalize({
      source: preparedAudioSource(media),
      preparation: media.audio!.map,
    });
    const request = need(
      "need:speech-evidence-audio",
      speechEvidenceCapabilities.projectAudio,
      speechEvidenceTypes.audio,
      constraints,
    );
    const value = await fulfillInline(resources, request);
    assertSpeechEvidenceAudioIdentity(value as unknown as SpeechEvidenceAudio);
    const evidence = value as unknown as SpeechEvidenceAudio;
    assert.equal(evidence.sampleFrames, 8_000);
    const inspected = await inspectArtifact(resources, evidence.artifact);
    const audio = inspected.streams.find((stream) => stream.kind === "audio");
    assert.equal(audio?.kind, "audio");
    assert.equal(audio?.kind === "audio" && audio.codecName, "pcm_s16le");
    assert.equal(audio?.kind === "audio" && audio.sampleRate, 16_000);
    assert.equal(audio?.kind === "audio" && audio.channels, 1);
    assert.equal(audio?.kind === "audio" && audio.decodedSampleFrames, 8_000);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

test("local media Provider extracts ordinary audio and frame Artifacts and renders still video", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-provider-media-ordinary-ops-"));
  try {
    const sourcePath = await fixture(root);
    const resources = new MemoryResourceStore();
    const source = await resources.put(await readFile(sourcePath), "video/mp4");
    const inspection = await inspectArtifact(resources, source);
    const executeArtifact = async (request: Need) => {
      const provider = await handlerFor(request);
      const result = await provider.handler({

        request: request,
        resources,
        credentials: {},
      });
      assertBlobRef(result);
      return result;
    };

    const audioIndex = inspection.streams.find((item) => item.kind === "audio")!.index;
    const extractedAudio = await executeArtifact(need(
      "need:extract-audio",
      mediaOperationsCapabilities.extractAudio,
      blobTypes.blob,
      canonicalize({
        source,
        streamIndex: audioIndex,
        output: { container: "wav", codec: "pcm_s16le", sampleRate: 48_000, channels: 2 },
      }),
    ));
    assert.equal(extractedAudio.mediaType, "audio/wav");
    const audioInspection = await inspectArtifact(resources, extractedAudio);
    const audio = audioInspection.streams.find((item) => item.kind === "audio");
    assert.ok(audio?.kind === "audio" && audio.sampleRate === 48_000 && audio.channels === 2);

    const video = inspection.streams.find((item) => item.kind === "video" && item.role === "moving")!;
    const extractedFrame = await executeArtifact(need(
      "need:extract-frame",
      mediaOperationsCapabilities.extractFrame,
      blobTypes.blob,
      canonicalize({
        source,
        streamIndex: video.index,
        sourceFrameCount: video.decodedUnitCount,
        at: { kind: "last" },
        output: { format: "png" },
      }),
    ));
    assert.equal(extractedFrame.mediaType, "image/png");
    const frameInspection = await inspectArtifact(resources, extractedFrame);
    assert.equal(frameInspection.streams.find((item) => item.kind === "video")?.decodedUnitCount, 1);

    const stillVideo = await executeArtifact(need(
      "need:render-still-video",
      mediaOperationsCapabilities.renderStill,
      blobTypes.blob,
      canonicalize({
        request: {
          frameRate: { numerator: 30, denominator: 1 },
          frameCount: 15,
          output: { container: "mp4", codec: "h264", pixelFormat: "yuv420p" },
          segments: [{ startFrame: 0, endFrameExclusive: 15, source: extractedFrame }],
        },
      }),
    ));
    assert.equal(stillVideo.mediaType, "video/mp4");
    const stillInspection = await inspectArtifact(resources, stillVideo);
    assert.equal(stillInspection.streams.length, 1);
    assert.equal(stillInspection.streams[0]?.kind, "video");
    assert.equal(stillInspection.streams[0]?.decodedUnitCount, 15);

    const spread = await executeArtifact(need(
      "need:render-still-spread",
      mediaOperationsCapabilities.renderStill,
      blobTypes.blob,
      canonicalize({
        request: {
          frameRate: { numerator: 30, denominator: 1 },
          frameCount: 15,
          output: { container: "mp4", codec: "h264", pixelFormat: "yuv420p" },
          segments: [
            { startFrame: 0, endFrameExclusive: 10, source: extractedFrame },
            { startFrame: 10, endFrameExclusive: 15, source: extractedFrame },
          ],
        },
      }),
    ));
    const spreadInspection = await inspectArtifact(resources, spread);
    assert.equal(spreadInspection.streams.length, 1);
    assert.equal(spreadInspection.streams[0]?.decodedUnitCount, 15, "two pictures spread over the same frame count");
    const twentyFourSpread = await executeArtifact(need(
      "need:render-still-24fps-spread",
      mediaOperationsCapabilities.renderStill,
      blobTypes.blob,
      canonicalize({
        request: {
          frameRate: { numerator: 24, denominator: 1 },
          frameCount: 144,
          output: { container: "mp4", codec: "h264", pixelFormat: "yuv420p" },
          segments: [
            { startFrame: 0, endFrameExclusive: 24, source: extractedFrame },
            { startFrame: 24, endFrameExclusive: 96, source: extractedFrame },
            { startFrame: 96, endFrameExclusive: 144, source: extractedFrame },
          ],
        },
      }),
    ));
    const twentyFourInspection = await inspectArtifact(resources, twentyFourSpread);
    assert.equal(twentyFourInspection.streams[0]?.decodedUnitCount, 144,
      "three Still segments at 24 fps must preserve the complete frame domain");
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

test("StillVideo converts authored RGB pictures to tagged BT.709 in both render paths", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-provider-media-bt709-"));
  try {
    const width = 1280;
    const height = 720;
    const expected = [0x20, 0xc0, 0x40] as const;
    const rgb = Buffer.alloc(width * height * 3);
    for (let offset = 0; offset < rgb.length; offset += 3) {
      rgb[offset] = expected[0];
      rgb[offset + 1] = expected[1];
      rgb[offset + 2] = expected[2];
    }
    const png = runBytes("ffmpeg", [
      "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${width}x${height}`,
      "-i", "pipe:0", "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1",
    ], rgb);
    const resources = new MemoryResourceStore();
    const source = await resources.put(png, "image/png");
    const render = async (id: string, segments: readonly {
      readonly startFrame: number;
      readonly endFrameExclusive: number;
      readonly source: typeof source;
    }[]) => {
      const request = need(
        `need:${id}`,
        mediaOperationsCapabilities.renderStill,
        blobTypes.blob,
        canonicalize({
          request: {
            frameRate: { numerator: 30, denominator: 1 },
            frameCount: 4,
            output: { container: "mp4", codec: "h264", pixelFormat: "yuv420p" },
            segments,
          },
        }),
      );
      const provider = await handlerFor(request);
      const result = await provider.handler({

        request: request,
        resources,
        credentials: {},
      });
      assertBlobRef(result);
      assert.equal(result.mediaType, "video/mp4");
      const artifact = result;
      const bytes = await resources.get(artifact.resource);
      assert(bytes !== undefined);
      const path = join(root, `${id}.mp4`);
      await writeFile(path, bytes);
      return path;
    };
    const paths = await Promise.all([
      render("single", [{ startFrame: 0, endFrameExclusive: 4, source }]),
      render("spread", [
        { startFrame: 0, endFrameExclusive: 2, source },
        { startFrame: 2, endFrameExclusive: 4, source },
      ]),
    ]);
    for (const path of paths) {
      const probe = spawnSync("ffprobe", [
        "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=color_range,color_space,color_transfer,color_primaries",
        "-of", "json", path,
      ], { encoding: "utf8", windowsHide: true });
      assert.equal(probe.status, 0, probe.stderr);
      const stream = (JSON.parse(probe.stdout) as { streams: Record<string, string>[] }).streams[0]!;
      assert.equal(stream.color_range, "tv");
      assert.equal(stream.color_space, "bt709");
      assert.equal(stream.color_transfer, "bt709");
      assert.equal(stream.color_primaries, "bt709");

      const decoded = runBytes("ffmpeg", [
        "-v", "error", "-i", path, "-frames:v", "1",
        "-vf", "scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24",
        "-f", "rawvideo", "pipe:1",
      ]);
      const center = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 3;
      expected.forEach((channel, index) => {
        assert.ok(Math.abs(decoded[center + index]! - channel) <= 3,
          `${path} channel ${index} decoded as ${decoded[center + index]}, expected ${channel}`);
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

test("local media Provider renders one frame-domain audio program and muxes exactly one video-only visual with it", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-provider-media-program-"));
  try {
    const firstPath = join(root, "first.wav");
    const secondPath = join(root, "second.wav");
    const visualPath = join(root, "visual.mp4");
    const oneFrameVisualPath = join(root, "one-frame.mp4");
    const oneFrameAudioPath = join(root, "one-frame.wav");
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
        "-frames:v", "30", "-vf", "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", visualPath,
      ]),
      run("ffmpeg", [
        "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=160x96:r=30",
        "-frames:v", "1", "-vf", "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", oneFrameVisualPath,
      ]),
      run("ffmpeg", [
        "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
        "-af", "atrim=end_sample=1600", "-c:a", "pcm_s16le", oneFrameAudioPath,
      ]),
    ]);

    const resources = new MemoryResourceStore();
    const [first, second, visualArtifact] = await Promise.all([
      resources.put(await readFile(firstPath), "audio/wav"),
      resources.put(await readFile(secondPath), "audio/wav"),
      resources.put(await readFile(visualPath), "video/mp4"),
    ]);
    const program = sealAudioProgram({
      frameRate: { numerator: 30, denominator: 1 },
      frameCount: 30,
      sampleRate: 48_000,
      sampleFrames: 48_000,
      graph: audioProgramGraphFromClips([
        {
          id: "speech:first",
          ...preparedAudioProgramSource("speech:first", first, 24_000),
          sampling: audioSampling("speech:first", 24_000, 24_000),
          target: audioTarget(0, 24_000),
          targetStartSample: 0,
          targetEndSampleExclusive: 24_000,
          mixStartSample: 0,
          mixEndSampleExclusive: 24_000,
          gain: 1,
          fadeInSamples: 0,
          fadeOutSamples: 0,
        },
        {
          id: "speech:second",
          ...preparedAudioProgramSource("speech:second", second, 24_000),
          sampling: audioSampling("speech:second", 24_000, 24_000),
          target: audioTarget(24_000, 48_000),
          targetStartSample: 24_000,
          targetEndSampleExclusive: 48_000,
          mixStartSample: 24_000,
          mixEndSampleExclusive: 48_000,
          gain: 1,
          fadeInSamples: 0,
          fadeOutSamples: 0,
        },
      ]),
    });
    const audioRequest = need(
      "need:render-program-audio",
      audioProgramCapabilities.render,
      mediaTypes.timelineAudio,
      canonicalize({ program }),
    );
    const audioValue = await fulfillInline(resources, audioRequest);
    verifyTimelineAudio(audioValue);
    const audio = audioValue as unknown as TimelineAudio;
    assert.equal(audio.sampleFrames, 48_000);
    assert.equal(await resources.has(audio.artifact.resource), true);

    const partialResources = new MemoryResourceStore();
    const partialFirst = await partialResources.put(await readFile(firstPath), "audio/wav");
    const partialProgram = sealAudioProgram({
      ...program,
      graph: {
        ...program.graph,
        nodes: program.graph.nodes.map((node) => node.kind === "source" && node.clip.id === "speech:first"
          ? { ...node, clip: { ...node.clip, source: { ...node.clip.source, source: partialFirst } } }
          : node),
      },
    });
    const partialValue = await fulfillInline(partialResources, need(
      "need:render-first-half-audio",
      audioProgramCapabilities.render,
      mediaTypes.timelineAudio,
      canonicalize({ program: partialProgram, range: { startFrame: 0, endFrameExclusive: 15 } }),
    ));
    verifyTimelineAudio(partialValue);
    assert.equal((partialValue as unknown as TimelineAudio).sampleFrames, 24_000,
      "partial rendering must not prepare the absent second-half source");

    const visual = sealTimelineVisual({
      frameRate: { numerator: 30, denominator: 1 },
      frameCount: 30,
      canvas: { width: 160, height: 96 },
      delivery: delivery.visual,
      artifact: visualArtifact,
    });
    const muxRequest = need(
      "need:mux-program-media",
      mediaDeliveryCapabilities.mux,
      mediaTypes.muxed,
      canonicalize({ visual, audio, delivery }),
    );
    const muxValue = await fulfillInline(resources, muxRequest);
    verifyMuxedMedia(muxValue);
    const muxed = muxValue as unknown as MuxedMedia;
    assert.equal(muxed.presentationSampleFrames, 48_000);
    assert.equal(await resources.has(muxed.artifact.resource), true);

    const mislabeledDelivery = {
      ...delivery,
      visual: { ...delivery.visual, encoding: { ...delivery.visual.encoding, codec: "hevc" } },
    } as unknown as typeof delivery;
    const mislabeledVisual = { ...visual, delivery: mislabeledDelivery.visual } as unknown as TimelineVisual;
    await assert.rejects(fulfillInline(resources, need(
      "need:mux-mislabeled-program-media",
      mediaDeliveryCapabilities.mux,
      mediaTypes.muxed,
      canonicalize({ visual: mislabeledVisual, audio, delivery: mislabeledDelivery }),
    )), /VisualDeliverySpec\.encoding\.codec must be h264/u,
    "mux must reject a delivery outside the one supported visual family before probing bytes");

    const inspection = await inspectArtifact(resources, muxed.artifact);
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

    const [oneFrameVisualArtifact, oneFrameAudioArtifact] = await Promise.all([
      resources.put(await readFile(oneFrameVisualPath), "video/mp4"),
      resources.put(await readFile(oneFrameAudioPath), "audio/wav"),
    ]);
    const oneFrameVisual = sealTimelineVisual({
      frameRate: { numerator: 30, denominator: 1 }, frameCount: 1,
      canvas: { width: 160, height: 96 }, delivery: delivery.visual,
      artifact: oneFrameVisualArtifact,
    });
    const oneFrameAudio = sealTimelineAudio({
      artifact: oneFrameAudioArtifact, sampleRate: 48_000, channelLayout: "stereo", sampleFrames: 1_600,
    });
    const oneFrameValue = await fulfillInline(resources, need(
      "need:mux-one-frame-program-media",
      mediaDeliveryCapabilities.mux,
      mediaTypes.muxed,
      canonicalize({ visual: oneFrameVisual, audio: oneFrameAudio, delivery }),
    ));
    verifyMuxedMedia(oneFrameValue);
    const oneFrameInspection = await inspectArtifact(resources, (oneFrameValue as unknown as MuxedMedia).artifact);
    assert.equal(oneFrameInspection.streams.find((stream) => stream.kind === "video")?.decodedUnitCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local media Provider preserves the audio tail for a 30000/1001 frame domain", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-provider-media-ntsc-mux-"));
  try {
    const visualPath = join(root, "visual.mp4");
    const audioPath = join(root, "audio.wav");
    const frameRate = { numerator: 30_000, denominator: 1_001 };
    const frameCount = 913;
    const sampleFrames = 1_462_261;
    await run("ffmpeg", [
      "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x96:r=30000/1001",
      "-frames:v", String(frameCount), "-vf", "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", visualPath,
    ]);
    await run("ffmpeg", [
      "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
      "-af", `atrim=end_sample=${sampleFrames}`, "-ac", "2", "-c:a", "pcm_s16le", audioPath,
    ]);

    const resources = new MemoryResourceStore();
    const [audioArtifact, visualArtifact] = await Promise.all([
      resources.put(await readFile(audioPath), "audio/wav"),
      resources.put(await readFile(visualPath), "video/mp4"),
    ]);
    const audio = sealTimelineAudio({ artifact: audioArtifact, sampleRate: 48_000, channelLayout: "stereo", sampleFrames });
    const visual = sealTimelineVisual({
      frameRate,
      frameCount,
      canvas: { width: 160, height: 96 },
      delivery: delivery.visual,
      artifact: visualArtifact,
    });
    const muxValue = await fulfillInline(resources, need(
      "need:mux-ntsc-program-media",
      mediaDeliveryCapabilities.mux,
      mediaTypes.muxed,
      canonicalize({ visual, audio, delivery }),
    ));
    verifyMuxedMedia(muxValue);
    const muxed = muxValue as unknown as MuxedMedia;
    const inspection = await inspectArtifact(resources, muxed.artifact);
    const audioStream = inspection.streams.find((stream): stream is MediaAudioStream => stream.kind === "audio");
    assert.ok(audioStream);
    const presentedSamples = presentationSampleFrames(audioStream);
    assert.ok(Math.abs(presentedSamples - sampleFrames) < 64,
      `AAC presentation span must retain the complete NTSC timeline audio (delta ${presentedSamples - sampleFrames})`);
    assert.ok(audioStream.decodedSampleFrames >= sampleFrames,
      "AAC coding frames must cover the complete NTSC timeline audio");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local media Provider executes an end-aligned loop from the exact authored sample phase", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-provider-media-loop-"));
  try {
    const resources = new MemoryResourceStore();
    const source = await resources.put(rampWav(100), "audio/wav");
    const program = sealAudioProgram({
      frameRate: { numerator: 30, denominator: 1 },
      frameCount: 30,
      sampleRate: 48_000,
      sampleFrames: 48_000,
      graph: audioProgramGraphFromClips([{
        id: "loop:end",
        ...preparedAudioProgramSource("loop:end", source, 100),
        sampling: audioSampling("loop:end", 250, 100, {
          sourceAtStart: { numerator: 50, denominator: 1 },
          wrap: { startFrame: 0, endFrameExclusive: 100 },
        }),
        target: audioTarget(0, 250),
        targetStartSample: 0,
        targetEndSampleExclusive: 250,
        mixStartSample: 0,
        mixEndSampleExclusive: 250,
        gain: 1,
        fadeInSamples: 0,
        fadeOutSamples: 0,
      }]),
    });
    const value = await fulfillInline(resources, need(
      "need:render-loop-audio",
      audioProgramCapabilities.render,
      mediaTypes.timelineAudio,
      canonicalize({ program }),
    ));
    verifyTimelineAudio(value);
    const audio = value as unknown as TimelineAudio;
    assert.equal(audio.sampleFrames, 48_000);
    const wav = await resources.get(audio.artifact.resource);
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

test("audio signal evaluation treats reverse, hold, cubic motion and gaps as peer TemporalMap relations", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-provider-media-signal-map-"));
  try {
    const resources = new MemoryResourceStore();
    const source = await resources.put(rampWav(16), "audio/wav");
    const at = (sample: number) => ({ ticks: String(sample), timeBase: { numerator: 1, denominator: 48_000 } }) as const;
    const sampling = (id: string, piece: TemporalMapPiece) => sealTemporalMap({ stages: [{
      target: { id: `${id}:occurrence`, duration: at(4) },
      source: { id, duration: at(16) },
      pieces: [piece],
    }] });
    const base = (id: string, start: number, map: ReturnType<typeof sampling>) => ({
      id,
      ...preparedAudioProgramSource(id, source, 16),
      sampling: map,
      target: audioTarget(start, start + 4),
      targetStartSample: start,
      targetEndSampleExclusive: start + 4,
      mixStartSample: start,
      mixEndSampleExclusive: start + 4,
      gain: 1,
      fadeInSamples: 0,
      fadeOutSamples: 0,
    });
    const chained = preparedAudioProgramSource("prepared-chain", source, 16);
    const preparedDomain = { id: "prepared-chain:prepared", duration: at(4) } as const;
    const intermediateDomain = { id: "prepared-chain:intermediate", duration: at(8) } as const;
    const preparation = sealTemporalMap({ stages: [{
      target: preparedDomain,
      source: intermediateDomain,
      pieces: [{ target: { start: at(0), end: at(4) }, sourceAtStart: at(0),
        rate: { numerator: 2, denominator: 1 } }],
    }, {
      target: intermediateDomain,
      source: chained.source.sourceDomain,
      pieces: [{ target: { start: at(0), end: at(8) }, sourceAtStart: at(0),
        rate: { numerator: 2, denominator: 1 } }],
    }] });
    const preparedSampling = sealTemporalMap({ stages: [{
      target: { id: "prepared-chain:occurrence", duration: at(4) },
      source: preparedDomain,
      pieces: [{ target: { start: at(0), end: at(4) }, sourceAtStart: at(0),
        rate: { numerator: 1, denominator: 1 } }],
    }] });
    const program = sealAudioProgram({
      frameRate: { numerator: 30, denominator: 1 }, frameCount: 30,
      sampleRate: 48_000, sampleFrames: 48_000,
      graph: audioProgramGraphFromClips([
        base("reverse", 0, sampling("reverse", {
          target: { start: at(0), end: at(4) }, sourceAtStart: at(4), rate: { numerator: -1, denominator: 1 },
        })),
        base("hold", 4, sampling("hold", {
          target: { start: at(0), end: at(4) }, sourceAtStart: at(2), rate: { numerator: 0, denominator: 1 },
        })),
        base("curve", 8, sampling("curve", {
          target: { start: at(0), end: at(4) }, sourceAtStart: at(0),
          sourceControl1: at(0), sourceControl2: at(0), sourceAtEnd: at(4),
        })),
        base("gap", 12, sampling("gap", {
          target: { start: at(0), end: at(2) }, sourceAtStart: at(0), rate: { numerator: 1, denominator: 1 },
        })),
        {
          id: "prepared-chain", source: chained.source, preparation, sampling: preparedSampling,
          target: audioTarget(16, 20), targetStartSample: 16, targetEndSampleExclusive: 20,
          mixStartSample: 16, mixEndSampleExclusive: 20, gain: 1, fadeInSamples: 0, fadeOutSamples: 0,
        },
      ]),
    });
    const value = await fulfillInline(resources, need(
      "need:render-signal-map-audio", audioProgramCapabilities.render,
      mediaTypes.timelineAudio, canonicalize({ program }),
    ));
    verifyTimelineAudio(value);
    const wavPath = join(root, "signal-map.wav");
    const rawPath = join(root, "signal-map.raw");
    await writeFile(wavPath, (await resources.get((value as unknown as TimelineAudio).artifact.resource))!);
    await run("ffmpeg", ["-v", "error", "-y", "-i", wavPath, "-f", "s16le", rawPath]);
    const raw = await readFile(rawPath);
    const values = (start: number, count: number) => Array.from({ length: count }, (_, index) =>
      raw.readInt16LE((start + index) * 4));
    assert.deepEqual(values(0, 4), [4, 3, 2, 1]);
    assert.deepEqual(values(4, 4), [3, 3, 3, 3]);
    assert.deepEqual(values(8, 4), [1, 1, 2, 3]);
    assert.deepEqual(values(12, 4), [1, 2, 0, 0],
      "content sampling treats the final Map endpoint as the start of the following gap");
    assert.deepEqual(values(16, 4), [1, 5, 9, 13],
      "occurrence and multi-stage preparation maps compose without a playback-mode rewrite");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audio range preserves loop phase, tempo and intersected fades from the full programme", { skip: !hasMediaBinaries }, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-audio-range-"));
  try {
    const resources = new MemoryResourceStore();
    const source = await resources.put(rampWav(4800), "audio/wav");
    const program = sealAudioProgram({
      frameRate: { numerator: 30, denominator: 1 }, frameCount: 60,
      sampleRate: 48000, sampleFrames: 96000,
      graph: audioProgramGraphFromClips([{ id: "loop", ...preparedAudioProgramSource("loop", source, 4800),
        sampling: audioSampling("loop", 96000, 4800, { sourceAtStart: { numerator: 1700, denominator: 1 },
          rate: { numerator: 5, denominator: 4 }, wrap: { startFrame: 0, endFrameExclusive: 4800 } }),
        target: audioTarget(0, 96000),
        targetStartSample: 0, targetEndSampleExclusive: 96000,
        mixStartSample: 0, mixEndSampleExclusive: 96000, gain: 0.8,
        fadeInSamples: 48000, fadeOutSamples: 30000 }]),
    });
    const pcm = async (name: string, range?: { startFrame: number; endFrameExclusive: number }) => {
      const value = await fulfillInline(resources, need(`need:${name}`, audioProgramCapabilities.render,
        mediaTypes.timelineAudio, canonicalize({ program, ...(range === undefined ? {} : { range }) })));
      verifyTimelineAudio(value);
      const audio = value as unknown as TimelineAudio;
      const path = join(root, `${name}.wav`), raw = join(root, `${name}.raw`);
      await writeFile(path, (await resources.get(audio.artifact.resource))!);
      await run("ffmpeg", ["-v", "error", "-y", "-i", path, "-f", "s16le", raw]);
      return { bytes: await readFile(raw), samples: audio.sampleFrames };
    };
    const full = await pcm("full");
    const range = await pcm("range", { startFrame: 15, endFrameExclusive: 45 });
    assert.equal(range.samples, 48000);
    const expected = full.bytes.subarray(24000 * 4, 72000 * 4);
    assert.equal(range.bytes.length, expected.length);
    let maximumError = 0;
    for (let offset = 0; offset < expected.length; offset += 2) {
      maximumError = Math.max(maximumError, Math.abs(range.bytes.readInt16LE(offset) - expected.readInt16LE(offset)));
    }
    // Different final filter block boundaries can round float PCM to the adjacent s16 value.
    assert.ok(maximumError <= 1, `Selected audio differs by ${maximumError} PCM units`);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("pitch-preserving reconstruction follows the same explicit rate without changing pitch", {
  skip: !hasMediaBinaries,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-audio-preserve-pitch-"));
  try {
    const sourcePath = join(root, "tone.wav");
    await run("ffmpeg", [
      "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
      "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", sourcePath,
    ]);
    const resources = new MemoryResourceStore();
    const source = await resources.put(await readFile(sourcePath), "audio/wav");
    const makeProgram = (id: string, reconstruction?: ReturnType<typeof preservePitch>) => sealAudioProgram({
      frameRate: { numerator: 30, denominator: 1 }, frameCount: 15,
      sampleRate: 48_000, sampleFrames: 24_000,
      graph: audioProgramGraphFromClips([{
        id,
        ...preparedAudioProgramSource(id, source, 48_000),
        sampling: audioSampling(id, 24_000, 48_000, { rate: { numerator: 2, denominator: 1 } }),
        ...(reconstruction === undefined ? {} : { reconstruction }),
        target: audioTarget(0, 24_000),
        targetStartSample: 0, targetEndSampleExclusive: 24_000,
        mixStartSample: 0, mixEndSampleExclusive: 24_000,
        gain: 1, fadeInSamples: 0, fadeOutSamples: 0,
      }]),
    });
    const crossings = async (name: string, program: ReturnType<typeof makeProgram>) => {
      const value = await fulfillInline(resources, need(`need:${name}`, audioProgramCapabilities.render,
        mediaTypes.timelineAudio, canonicalize({ program })));
      verifyTimelineAudio(value);
      const wav = join(root, `${name}.wav`), raw = join(root, `${name}.raw`);
      await writeFile(wav, (await resources.get((value as unknown as TimelineAudio).artifact.resource))!);
      await run("ffmpeg", ["-v", "error", "-y", "-i", wav, "-f", "s16le", raw]);
      const pcm = await readFile(raw);
      let count = 0;
      for (let sample = 1; sample < 24_000; sample += 1) {
        if (pcm.readInt16LE((sample - 1) * 4) <= 0 && pcm.readInt16LE(sample * 4) > 0) count += 1;
      }
      return count;
    };
    const ordinary = await crossings("ordinary", makeProgram("ordinary"));
    const preserved = await crossings("preserved", makeProgram("preserved", preservePitch()));
    assert.ok(ordinary >= 420 && ordinary <= 460, `Ordinary 2x sampling produced ${ordinary} cycles`);
    assert.ok(preserved >= 200 && preserved <= 240, `Pitch-preserving 2x stretch produced ${preserved} cycles`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audio envelopes and audible regions preserve sample phase through gaps and range renders", { skip: !hasMediaBinaries }, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-audio-presentation-"));
  try {
    const resources = new MemoryResourceStore();
    const source = await resources.put(rampWav(4800), "audio/wav");
    const program = sealAudioProgram({
      frameRate: { numerator: 30, denominator: 1 }, frameCount: 12, sampleRate: 48000, sampleFrames: 19200,
      graph: audioProgramGraphFromClips([{ id: "voice", ...preparedAudioProgramSource("voice", source, 4800),
        sampling: audioSampling("voice", 16000, 4800, { wrap: { startFrame: 0, endFrameExclusive: 4800 } }),
        target: audioTarget(1600, 17600),
        targetStartSample: 1600, targetEndSampleExclusive: 17600,
        mixStartSample: 1600, mixEndSampleExclusive: 17600, gain: 1,
        fadeInSamples: 0, fadeOutSamples: 0,
        gainEnvelope: [{ sample: 1600, gain: 0 }, { sample: 17600, gain: 1 }],
        audibility: [{ startSample: 1600, endSampleExclusive: 4800 }, { startSample: 8000, endSampleExclusive: 17600 }],
      }]),
    });
    const pcm = async (name: string, range?: { startFrame: number; endFrameExclusive: number }) => {
      const value = await fulfillInline(resources, need(`need:${name}`, audioProgramCapabilities.render,
        mediaTypes.timelineAudio, canonicalize({ program, ...(range === undefined ? {} : { range }) })));
      verifyTimelineAudio(value);
      const path = join(root, `${name}.wav`), raw = join(root, `${name}.raw`);
      await writeFile(path, (await resources.get((value as unknown as TimelineAudio).artifact.resource))!);
      await run("ffmpeg", ["-v", "error", "-y", "-i", path, "-f", "s16le", raw]);
      return readFile(raw);
    };
    const full = await pcm("full");
    for (const sample of [0, 1599, 4800, 6400, 7999, 17600, 18000]) assert.equal(full.readInt16LE(sample * 4), 0);
    for (const sample of [1600, 2401, 4799, 8000, 8001, 12000, 17599]) {
      const local = sample - 1600;
      const expected = (local % 4800 + 1) * local / 16000;
      assert.ok(Math.abs(full.readInt16LE(sample * 4) - expected) <= 1, `Wrong envelope or source phase at ${sample}`);
    }
    const selected = await pcm("selected", { startFrame: 4, endFrameExclusive: 10 });
    const expected = full.subarray(6400 * 4, 16000 * 4);
    assert.equal(selected.length, expected.length);
    for (let index = 0; index < selected.length; index += 2) {
      assert.ok(Math.abs(selected.readInt16LE(index) - expected.readInt16LE(index)) <= 1);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
