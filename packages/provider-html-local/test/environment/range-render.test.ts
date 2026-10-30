import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { ResourceIOOptions } from "@hypit/runtime";
import { MemoryResourceStore } from "@hypit/executor";
import type { BlobRef } from "@hypit/protocol";
import sharp from "sharp";
import { rasterizeHtmlFrames, rasterizeHtmlProgram } from "../../src/index.js";
import type { HtmlRasterProgress } from "../../src/index.js";
import { htmlHdr10SourceDocument, htmlNestedRangeDocument, htmlRangeDocument, htmlRetiringSourceDocument } from "../range-scenario.js";
import { htmlProviderDelivery, htmlProviderHdr10Delivery, htmlProviderPicture } from "../provider-scenario.js";

test("a nested Composition renders its explicitly composed media sampling without an intermediate child video", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-render-nested-range-test-"));
  const browser = process.env.HYPIT_TEST_CHROME_PATH === undefined
    ? {} : { chromePath: process.env.HYPIT_TEST_CHROME_PATH };
  try {
    const colors = [[240, 20, 20], [20, 220, 20], [20, 20, 240], [220, 220, 20]];
    const raw = Buffer.concat(colors.map(color => Buffer.from(Array.from({ length: 64 * 64 }, () => color).flat())));
    const source = join(root, "source.mp4");
    const encoded = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
      "-s", "64x64", "-r", "30", "-i", "pipe:0", "-vf",
      "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
      "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p", source],
    { input: raw });
    assert.equal(encoded.status, 0, encoded.stderr.toString());
    const resources = new MemoryResourceStore();
    const document = htmlNestedRangeDocument(await resources.put(await readFile(source), "video/mp4"));
    const selectedFrames = [0, 1, 2, 3, 18, 19, 34, 35];
    const snapshots = await rasterizeHtmlFrames({ program: document, picture: htmlProviderPicture(),
      frames: selectedFrames }, { resources, workers: 2, ...browser });
    const expectedSources = [2, 2, 3, 3, 0, 0, 2, 2];
    const center = (32 * 64 + 32) * 3;
    for (const [index, sourceFrame] of expectedSources.entries()) {
      const pixels = await sharp((await resources.get(snapshots.frames[index]!.artifact.resource))!)
        .removeAlpha().raw().toBuffer();
      for (let channel = 0; channel < 3; channel++) {
        assert.ok(Math.abs(pixels[center + channel]! - colors[sourceFrame]![channel]!) < 12,
          `nested frame ${selectedFrames[index]} did not sample source frame ${sourceFrame}`);
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Electron routes exact source samples into a nested Composition document", {
  skip: process.env.HYPIT_TEST_ELECTRON_PATH === undefined,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-render-electron-nested-range-test-"));
  try {
    const colors = [[240, 20, 20], [20, 220, 20], [20, 20, 240], [220, 220, 20]];
    const raw = Buffer.concat(colors.map(color => Buffer.from(Array.from({ length: 64 * 64 }, () => color).flat())));
    const source = join(root, "source.mp4");
    const encoded = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
      "-s", "64x64", "-r", "30", "-i", "pipe:0", "-vf",
      "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
      "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p", source],
    { input: raw });
    assert.equal(encoded.status, 0, encoded.stderr.toString());
    const resources = new MemoryResourceStore();
    const document = htmlNestedRangeDocument(await resources.put(await readFile(source), "video/mp4"));
    const visual = await rasterizeHtmlProgram({ program: document, delivery: htmlProviderDelivery("high") }, {
      renderer: "electron", electronPath: process.env.HYPIT_TEST_ELECTRON_PATH!,
      ffmpegPath: "ffmpeg", resources, workers: 1,
    });
    const output = join(root, "output.mp4");
    await writeFile(output, (await resources.get(visual.artifact.resource))!);
    const decoded = spawnSync("ffmpeg", ["-v", "error", "-i", output,
      "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
    assert.equal(decoded.status, 0, decoded.stderr.toString());
    const childFrames = [2, 3, 0, 1, 2, 3, 3, 3, 0, 0, 1, 1, 3, 2, 1, 0, 3, 2];
    const expected = childFrames.flatMap(frame => [frame, frame]);
    const stride = 64 * 64 * 3;
    const center = (32 * 64 + 32) * 3;
    assert.equal(decoded.stdout.length, expected.length * stride);
    for (const [frame, sourceFrame] of expected.entries()) {
      const sample = [0, 1, 2].map(channel => decoded.stdout[frame * stride + center + channel]!);
      const distances = colors.map(color => color.reduce((sum, value, channel) =>
        sum + (sample[channel]! - value) ** 2, 0));
      const nearest = distances.indexOf(Math.min(...distances));
      assert.equal(nearest, sourceFrame,
        `Electron nested frame ${frame} sampled ${JSON.stringify(sample)}, nearest source frame ${nearest}, expected ${sourceFrame}`);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("real selected renders sample video correctly across wrap, hold, fractional and reverse rates with independent browsers", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-render-range-test-"));
  const browser = process.env.HYPIT_TEST_CHROME_PATH === undefined
    ? {} : { chromePath: process.env.HYPIT_TEST_CHROME_PATH };
  try {
    const colors = [[240, 20, 20], [20, 220, 20], [20, 20, 240], [220, 220, 20]];
    const raw = Buffer.concat(colors.map((color) => Buffer.from(Array.from({ length: 64 * 64 }, () => color).flat())));
    const path = join(root, "source.mp4");
    const encoded = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
      "-s", "64x64", "-r", "30", "-i", "pipe:0", "-vf",
      "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
      "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p", path], { input: raw });
    assert.equal(encoded.status, 0, encoded.stderr.toString());
    const resources = new MemoryResourceStore();
    const document = htmlRangeDocument(await resources.put(await readFile(path), "video/mp4"));
    const events: HtmlRasterProgress[] = [];
    const render = async (name: string, range: { startFrame: number; endFrameExclusive: number } | undefined,
      workers: number) => {
      const warnings: string[] = [];
      const visual = await rasterizeHtmlProgram({ program: document, delivery: htmlProviderDelivery("high"),
        ...(range === undefined ? {} : { range }) },
        { resources, workers, processTimeoutMs: 120000, ...browser,
          maxPendingFrameBytes: 1, maxDecodedSourceBytes: 1,
          onProgress: (e) => events.push(e),
          onDiagnostic: async (event) => { if (event.level === "warning") warnings.push(event.message); } });
      assert.deepEqual(warnings, [], "a completed render should close its resources and exit without forced cleanup");
      const file = join(root, `${name}.mp4`);
      await writeFile(file, (await resources.get(visual.artifact.resource))!);
      const decoded = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
      assert.equal(decoded.status, 0, decoded.stderr.toString());
      return decoded.stdout;
    };
    const full = await render("full", undefined, 1);
    events.length = 0;
    const selected = await render("selected", { startFrame: 3, endFrameExclusive: 11 }, 3);
    const starts = events.filter((e): e is Extract<HtmlRasterProgress, { browserPid: number | undefined }> => e.phase === "worker-start");
    assert.equal(starts.length, 3);
    assert.equal(new Set(starts.map((e) => e.browserPid)).size, 3);
    const one = await render("one", { startFrame: 7, endFrameExclusive: 8 }, 4);
    const stride = 64 * 64 * 3, center = (32 * 64 + 32) * 3;
    assert.equal(full.length, 18 * stride);
    assert.equal(selected.length, 8 * stride);
    assert.equal(one.length, stride);
    const expected = [2, 3, 0, 1, 2, 3, 3, 3, 0, 0, 1, 1, 3, 2, 1, 0, 3, 2];
    const samples = expected.map((_sourceFrame, frame) =>
      [...full.subarray(frame * stride + center, frame * stride + center + 3)]);
    for (const [frame, source] of expected.entries()) {
      for (let channel = 0; channel < 3; channel++) {
        const actual = full[frame * stride + center + channel]!;
        assert.ok(Math.abs(actual - colors[source]![channel]!) < 12,
          `frame ${frame} channel ${channel} was ${actual}, not source frame ${source} value ${colors[source]![channel]}; ${JSON.stringify(samples)}`);
      }
    }
    for (const [i, source] of [1, 2, 3, 3, 3, 0, 0, 1].entries()) {
      for (let channel = 0; channel < 3; channel++) {
        assert.ok(Math.abs(selected[i * stride + center + channel]! - colors[source]![channel]!) < 12);
        assert.ok(Math.abs(selected[i * stride + center + channel]! - full[(i + 3) * stride + center + channel]!) < 4);
      }
    }
    for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(one[center + channel]! - colors[3]![channel]!) < 12);
    const snapshots = await rasterizeHtmlFrames({ program: document, picture: htmlProviderPicture(),
      frames: [3, 7, 8, 11] },
      { resources, workers: 2, ...browser });
    for (const [index, source] of [1, 3, 0, 1].entries()) {
      const pixels = await sharp((await resources.get(snapshots.frames[index]!.artifact.resource))!).removeAlpha().raw().toBuffer();
      for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(pixels[center + channel]! - colors[source]![channel]!) < 12);
    }
    await assert.rejects(rasterizeHtmlProgram({ program: document, delivery: htmlProviderDelivery("high"), range: { startFrame: 7, endFrameExclusive: 8 } },
      { resources, workers: 2, initializationTimeoutMs: 1, processTimeoutMs: 30_000, ...browser }),
      /worker 0 initialization timed out/);
    assert.equal((await render("after-timeout", { startFrame: 7, endFrameExclusive: 8 }, 1)).length, stride);

    const controller = new AbortController();
    const stopped = rasterizeHtmlProgram({ program: document, delivery: htmlProviderDelivery("high") }, { resources, workers: 4, signal: controller.signal, ...browser,
      onProgress: (event) => { if (event.phase === "worker-start") controller.abort(new Error("stop this attempt")); } });
    const [failed, completed] = await Promise.allSettled([stopped, render("concurrent", undefined, 2)]);
    assert.equal(failed.status, "rejected");
    assert.equal(completed.status, "fulfilled");
    if (completed.status === "fulfilled") assert.equal(completed.value.length, 18 * stride);

    class StalledOutput extends MemoryResourceStore {
      active = false;
      override get(resource: BlobRef["resource"], options?: ResourceIOOptions) { return resources.get(resource, options); }
      override async put(_bytes: Uint8Array, _mediaType: string, options: ResourceIOOptions = {}): Promise<BlobRef> {
        this.active = true;
        storeController.abort(new Error("stop output storage"));
        try { await delay(60_000, undefined, { signal: options.signal }); throw new Error("unexpected completion"); }
        finally { this.active = false; }
      }
    }
    const storeController = new AbortController();
    const outputResources = new StalledOutput();
    await assert.rejects(rasterizeHtmlProgram({ program: document, delivery: htmlProviderDelivery("high"), range: { startFrame: 0, endFrameExclusive: 1 } },
      { resources: outputResources, workers: 1, signal: storeController.signal, ...browser }), /stop output storage/u);
    assert.equal(outputResources.active, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Electron decodes exact source-video samples in the browser before shared-texture export", {
  skip: process.env.HYPIT_TEST_ELECTRON_PATH === undefined,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-render-electron-source-test-"));
  try {
    const colors = [[240, 20, 20], [20, 220, 20], [20, 20, 240], [220, 220, 20]];
    const raw = Buffer.concat(colors.map(color => Buffer.from(Array.from({ length: 64 * 64 }, () => color).flat())));
    const source = join(root, "source.mp4");
    const encoded = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
      "-s", "64x64", "-r", "30", "-i", "pipe:0", "-vf",
      "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
      "-c:v", "libx264", "-crf", "0", "-color_range", "tv", "-colorspace", "bt709",
      "-color_trc", "bt709", "-color_primaries", "bt709", source], { input: raw });
    assert.equal(encoded.status, 0, encoded.stderr.toString());
    const ffmpegLog = join(root, "ffmpeg.jsonl");
    const ffmpegWrapper = join(root, "ffmpeg-wrapper.cjs");
    await writeFile(ffmpegWrapper, `#!${process.execPath}\nconst fs=require("node:fs");\nconst cp=require("node:child_process");\nfs.appendFileSync(${JSON.stringify(ffmpegLog)},JSON.stringify(process.argv.slice(2))+"\\n");\nconst result=cp.spawnSync("ffmpeg",process.argv.slice(2),{stdio:"inherit"});\nif(result.error)throw result.error;process.exit(result.status??1);\n`);
    await chmod(ffmpegWrapper, 0o755);
    const resources = new MemoryResourceStore();
    const sourceArtifact = await resources.put(await readFile(source), "video/mp4");
    const document = htmlRangeDocument(sourceArtifact);
    const render = async (name: string, range: { startFrame: number; endFrameExclusive: number } | undefined,
      workers: number, maxDecodedSourceBytes?: number, maxPendingFrameBytes?: number,
      program = document, diagnostics: string[] = []) => {
      const visual = await rasterizeHtmlProgram({ program, delivery: htmlProviderDelivery("high"),
        ...(range === undefined ? {} : { range }) }, {
        renderer: "electron",
        electronPath: process.env.HYPIT_TEST_ELECTRON_PATH!,
        resources,
        workers,
        ...(maxDecodedSourceBytes === undefined ? {} : { maxDecodedSourceBytes }),
        ...(maxPendingFrameBytes === undefined ? {} : { maxPendingFrameBytes }),
        ffmpegPath: ffmpegWrapper,
        processTimeoutMs: 120_000,
        onDiagnostic: async diagnostic => { diagnostics.push(diagnostic.message); },
      });
      const output = join(root, `${name}.mp4`);
      await writeFile(output, (await resources.get(visual.artifact.resource))!);
      const decoded = spawnSync("ffmpeg", ["-v", "error", "-i", output,
        "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
      assert.equal(decoded.status, 0, decoded.stderr.toString());
      return decoded.stdout;
    };
    const full = await render("full", undefined, 1);
    const selected = await render("selected", { startFrame: 3, endFrameExclusive: 11 }, 2, 1, 1);
    const controller = new AbortController();
    await assert.rejects(rasterizeHtmlProgram({ program: document, delivery: htmlProviderDelivery("high") }, {
      renderer: "electron", electronPath: process.env.HYPIT_TEST_ELECTRON_PATH!, resources, workers: 2,
      ffmpegPath: ffmpegWrapper, signal: controller.signal,
      onProgress: event => { if (event.phase === "worker-start") controller.abort(new Error("stop Electron attempt")); },
    }), /stop Electron attempt/u);
    const recovered = await render("recovered", { startFrame: 7, endFrameExclusive: 8 }, 1, 1, 1);
    const retirementDiagnostics: string[] = [];
    await render("retired", undefined, 1, 1, 1, htmlRetiringSourceDocument(sourceArtifact), retirementDiagnostics);
    const retiredStats = retirementDiagnostics.flatMap(message => [...message.matchAll(/video: (\{[^\n]+\})/gu)]
      .map(match => JSON.parse(match[1]!) as { resident: number; cachedSamples: number; openSources: number })).at(-1);
    assert.ok(retiredStats !== undefined);
    assert.equal(retiredStats.resident, 0);
    assert.equal(retiredStats.cachedSamples, 0);
    assert.equal(retiredStats.openSources, 0);
    const ffmpegCalls = (await readFile(ffmpegLog, "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
    assert.equal(ffmpegCalls.length, 4, "completed Electron renders use FFmpeg only for final container muxing");
    for (const call of ffmpegCalls) {
      assert.ok(call.includes("copy"));
      assert.equal(call.some(argument => /png|image2pipe/iu.test(argument)), false,
        "neither source decoding nor encoded output may cross a PNG boundary");
    }
    const stride = 64 * 64 * 3;
    const center = (32 * 64 + 32) * 3;
    assert.equal(full.length, 18 * stride);
    assert.equal(selected.length, 8 * stride);
    assert.equal(recovered.length, stride);
    const expected = [2, 3, 0, 1, 2, 3, 3, 3, 0, 0, 1, 1, 3, 2, 1, 0, 3, 2];
    const samples = expected.map((_sourceFrame, frame) =>
      [...full.subarray(frame * stride + center, frame * stride + center + 3)]);
    for (const [frame, sourceFrame] of expected.entries()) {
      for (let channel = 0; channel < 3; channel++) {
        const actual = full[frame * stride + center + channel]!;
        assert.ok(Math.abs(actual - colors[sourceFrame]![channel]!) < 16,
          `frame ${frame} channel ${channel} was ${actual}, not source frame ${sourceFrame} value ${colors[sourceFrame]![channel]}; ${JSON.stringify(samples)}`);
      }
    }
    for (const [frame, sourceFrame] of expected.slice(3, 11).entries()) {
      for (let channel = 0; channel < 3; channel++) {
        assert.ok(Math.abs(selected[frame * stride + center + channel]! - colors[sourceFrame]![channel]!) < 16);
      }
    }
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(Math.abs(recovered[center + channel]! - colors[3]![channel]!) < 16);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Electron preserves a known HDR10 source above reference white through the linear Programme", {
  skip: process.env.HYPIT_TEST_ELECTRON_PATH === undefined,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-render-hdr10-source-test-"));
  try {
    const pq = (nits: number) => {
      const m1 = 2610 / 16384, m2 = 2523 / 32, c1 = 3424 / 4096, c2 = 2413 / 128, c3 = 2392 / 128;
      const p = (Math.max(0, Math.min(10_000, nits)) / 10_000) ** m1;
      return ((c1 + c2 * p) / (1 + c3 * p)) ** m2;
    };
    const expectedCode = Math.round(64 + 876 * pq(1_000));
    const referenceWhiteCode = Math.round(64 + 876 * pq(203));
    const frame = Buffer.alloc(64 * 64 * 3);
    for (let offset = 0; offset < 64 * 64 * 2; offset += 2) frame.writeUInt16LE(expectedCode << 6, offset);
    for (let offset = 64 * 64 * 2; offset < frame.length; offset += 2) frame.writeUInt16LE(512 << 6, offset);
    const source = join(root, "source.mp4");
    const encoded = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "p010le",
      "-s", "64x64", "-r", "30", "-i", "pipe:0", "-frames:v", "1",
      "-vf", "setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc:range=tv",
      "-c:v", "libx265", "-x265-params",
      "lossless=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:range=limited:repeat-headers=1",
      "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1", source], { input: frame });
    assert.equal(encoded.status, 0, encoded.stderr.toString());
    const resources = new MemoryResourceStore();
    const document = htmlHdr10SourceDocument(await resources.put(await readFile(source), "video/mp4"));
    const visual = await rasterizeHtmlProgram({ program: document, delivery: htmlProviderHdr10Delivery("high") }, {
      renderer: "electron", electronPath: process.env.HYPIT_TEST_ELECTRON_PATH!, resources, workers: 1,
      ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", processTimeoutMs: 120_000,
    });
    const output = await resources.get(visual.artifact.resource);
    assert.ok(output !== undefined);
    const decoded = spawnSync("ffmpeg", ["-v", "error", "-i", "pipe:0", "-frames:v", "1",
      "-f", "rawvideo", "-pix_fmt", "p010le", "pipe:1"], { input: output });
    assert.equal(decoded.status, 0, decoded.stderr.toString());
    const actualCode = decoded.stdout.readUInt16LE((32 * 64 + 32) * 2) >> 6;
    assert.ok(actualCode > referenceWhiteCode + 80,
      `HDR source was narrowed near reference white: output ${actualCode}, reference ${referenceWhiteCode}`);
    assert.ok(Math.abs(actualCode - expectedCode) < 12,
      `HDR source code ${expectedCode} became ${actualCode}`);
  } finally { await rm(root, { recursive: true, force: true }); }
});
