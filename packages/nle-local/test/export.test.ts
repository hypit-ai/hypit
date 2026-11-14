import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { audioProgramSampleFrames } from "@hypit/audio-program";
import { frameSpanSamples } from "@hypit/temporal";
import {
  sealMuxedMedia,
  sealRenderedAudio,
  sealRenderedVisual,
  prepareMedia,
} from "@hypit/media";
import { serializeMediaAssetDocument } from "@hypit/media-asset";
import type { MediaAssetDocument } from "@hypit/media-asset";
import {
  applyNleTransaction,
  createNleProject,
  nleLinearTimeMapping,
  nleProjectComposition,
} from "@hypit/nle";

import {
  captureLocalNleFrames,
  exportLocalNleProject,
  nleProjectModuleKeys,
  reviewLocalNleProject,
} from "../src/export.js";

const timestamp = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } });
const second = (value: number) => timestamp(String(value));

function mediaAsset(): MediaAssetDocument {
  const prepared = prepareMedia({
    id: "clip-source",
    source: { kind: "blob", resource: "res_test_source", size: 4, mediaType: "video/mp4" },
    inspection: { streams: [{
      kind: "video", index: 0, codecName: "h264",
      disposition: { default: true, attachedPicture: false },
      startPts: timestamp("0"), endPts: timestamp("1"), decodedUnitCount: 30,
      width: 100, height: 100, sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0,
      picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
        colorRange: "limited", bitDepth: 8, alphaMode: "opaque" },
    }] },
    selection: { videoStreamIndex: 0, spanAuthority: "video", picture: {
      colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
      colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
    } },
  });
  const { source: _source, ...interpretation } = prepared;
  return {
    format: "hypit.media-asset@1",
    id: "clip",
    media: {
      file: { path: "./clip.mp4", mediaType: "video/mp4" },
      interpretation,
    },
    representations: [],
  };
}

function project() {
  const base = createNleProject({
    id: "export-project",
    name: "Export project",
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  return applyNleTransaction(base, { revision: 0, commands: [{
    kind: "track.add",
    track: {
      id: "picture", name: "Picture", kind: "picture", muted: false,
      items: [{
        id: "clip-use", kind: "present", source: "media", asset: { path: "./clip.media.json" }, enabled: true,
        start: second(0), duration: second(1), sourceTime: nleLinearTimeMapping(second(1)),
        picture: {
          layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" },
        },
      }],
    },
  }] });
}

test("whole-project export stages files, closes the delivery plan and atomically publishes MP4", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-nle-export-"));
  try {
    const projectFile = join(directory, "edit.nle.json");
    const outputFile = join(directory, "output.mp4");
    await writeFile(join(directory, "clip.mp4"), "clip");
    await writeFile(join(directory, "clip.media.json"), serializeMediaAssetDocument(mediaAsset()));
    await writeFile(projectFile, `${JSON.stringify(project(), null, 2)}\n`);
    const progress: string[] = [];

    const result = await exportLocalNleProject({
      projectRoot: directory,
      projectFile,
      outputFile,
      frameRate: { numerator: 60, denominator: 1 },
      resolution: { width: 200, height: 200 },
      onProgress: event => progress.push(event.phase),
    }, {
      createExecutor(resources) {
        return {
          async renderVisual(request) {
            return sealRenderedVisual({
              frameRate: request.program.frameRate,
              frameCount: request.program.frameCount,
              canvas: request.program.canvas,
              delivery: request.delivery,
              artifact: await resources.put(new TextEncoder().encode("visual"), "video/mp4"),
            });
          },
          async renderAudio(request) {
            return sealRenderedAudio({
              sampleFrames: audioProgramSampleFrames(request.program),
              artifact: await resources.put(new TextEncoder().encode("audio"), "audio/wav"),
            });
          },
          async mux(request) {
            return sealMuxedMedia({
              frameRate: request.visual.frameRate,
              frameCount: request.visual.frameCount,
              canvas: request.visual.canvas,
              delivery: request.delivery,
              artifact: await resources.put(new TextEncoder().encode("final-mp4"), "video/mp4"),
            });
          },
        };
      },
    });

    assert.deepEqual(result.frameRate, { numerator: 60, denominator: 1 });
    assert.equal(result.frameCount, 60);
    assert.deepEqual(result.canvas, { width: 200, height: 200 });
    assert.equal(Buffer.from(await readFile(outputFile)).toString("utf8"), "final-mp4");
    assert(progress.includes("media") && progress.includes("lower") && progress.includes("mux"));
    await assert.rejects(exportLocalNleProject({ projectRoot: directory, projectFile, outputFile }), /already exists/u);
    await assert.rejects(exportLocalNleProject({
      projectRoot: directory,
      projectFile,
      outputFile: join(directory, "wrong-aspect.mp4"),
      resolution: { width: 200, height: 100 },
    }), /changes Programme aspect/u);
    assert.equal(Buffer.from(await readFile(outputFile)).toString("utf8"), "final-mp4");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("one export invocation can select the GPU Composition root without changing the NLE Project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-nle-gpu-export-"));
  try {
    const projectFile = join(directory, "edit.nle.json");
    const outputFile = join(directory, "gpu.mp4");
    await writeFile(join(directory, "clip.mp4"), "clip");
    await writeFile(join(directory, "clip.media.json"), serializeMediaAssetDocument(mediaAsset()));
    const sourceDocument = `${JSON.stringify(project(), null, 2)}\n`;
    await writeFile(projectFile, sourceDocument);
    let selectedWebGpu = false;

    await exportLocalNleProject({
      projectRoot: directory,
      projectFile,
      outputFile,
      pictureTarget: "gpu-composition",
    }, {
      createExecutor(resources) {
        return {
          async renderVisual(request) {
            selectedWebGpu = /navigator\.gpu/u.test(request.program.html)
              && request.program.videoSources.length === 1;
            return sealRenderedVisual({
              frameRate: request.program.frameRate,
              frameCount: request.program.frameCount,
              canvas: request.program.canvas,
              delivery: request.delivery,
              artifact: await resources.put(new TextEncoder().encode("gpu-visual"), "video/mp4"),
            });
          },
          async renderAudio(request) {
            return sealRenderedAudio({
              sampleFrames: audioProgramSampleFrames(request.program),
              artifact: await resources.put(new TextEncoder().encode("audio"), "audio/wav"),
            });
          },
          async mux(request) {
            return sealMuxedMedia({
              frameRate: request.visual.frameRate,
              frameCount: request.visual.frameCount,
              canvas: request.visual.canvas,
              delivery: request.delivery,
              artifact: await resources.put(new TextEncoder().encode("gpu-final"), "video/mp4"),
            });
          },
        };
      },
    });

    assert.equal(selectedWebGpu, true);
    assert.equal(await readFile(projectFile, "utf8"), sourceDocument);
    assert.equal(Buffer.from(await readFile(outputFile)).toString("utf8"), "gpu-final");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("focused export renders one absolute Programme interval without changing the Project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-nle-focused-export-"));
  try {
    const projectFile = join(directory, "edit.nle.json");
    const outputFile = join(directory, "focused.mp4");
    await writeFile(join(directory, "clip.mp4"), "clip");
    await writeFile(join(directory, "clip.media.json"), serializeMediaAssetDocument(mediaAsset()));
    const sourceDocument = `${JSON.stringify(project(), null, 2)}\n`;
    await writeFile(projectFile, sourceDocument);
    const selected = { startFrame: 12, endFrameExclusive: 36 };

    const result = await exportLocalNleProject({
      projectRoot: directory,
      projectFile,
      outputFile,
      frameRate: { numerator: 60, denominator: 1 },
      range: selected,
    }, {
      createExecutor(resources) {
        return {
          async renderVisual(request) {
            assert.equal(request.range, undefined);
            assert.equal(request.program.frameCount, 24);
            return sealRenderedVisual({
              frameRate: request.program.frameRate,
              frameCount: selected.endFrameExclusive - selected.startFrame,
              canvas: request.program.canvas,
              delivery: request.delivery,
              artifact: await resources.put(new TextEncoder().encode("visual"), "video/mp4"),
            });
          },
          async renderAudio(request) {
            assert(request.range !== undefined);
            return sealRenderedAudio({
              sampleFrames: frameSpanSamples(selected, { frameRate: { numerator: 60, denominator: 1 } }, 48_000)
                .sampleFrames,
              artifact: await resources.put(new TextEncoder().encode("audio"), "audio/wav"),
            });
          },
          async mux(request) {
            return sealMuxedMedia({
              frameRate: request.visual.frameRate,
              frameCount: request.visual.frameCount,
              canvas: request.visual.canvas,
              delivery: request.delivery,
              artifact: await resources.put(new TextEncoder().encode("focused"), "video/mp4"),
            });
          },
        };
      },
    });

    assert.equal(result.frameCount, 24);
    assert.equal(await readFile(projectFile, "utf8"), sourceDocument);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("sparse frame capture writes only requested absolute Programme frames", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-nle-frame-capture-"));
  try {
    const projectFile = join(directory, "edit.nle.json");
    const toDirectory = join(directory, "frames");
    await writeFile(join(directory, "clip.mp4"), "clip");
    await writeFile(join(directory, "clip.media.json"), serializeMediaAssetDocument(mediaAsset()));
    await writeFile(projectFile, `${JSON.stringify(project(), null, 2)}\n`);

    const result = await captureLocalNleFrames({
      projectRoot: directory,
      projectFile,
      toDirectory,
      frames: [6, 12, 29],
    }, {
      async rasterizeFrames(request, options) {
        assert.deepEqual(request.frames, [0, 6, 23]);
        assert.equal(request.program.frameCount, 24);
        const frames = [];
        for (const frame of request.frames) {
          frames.push({
            frame,
            artifact: await options.resources.put(new TextEncoder().encode(`png-${frame}`), "image/png"),
          });
        }
        return { picture: structuredClone(request.picture), frames };
      },
    });

    assert.deepEqual(result.frames.map(value => value.frame), [6, 12, 29]);
    assert.equal(result.frameCount, 30);
    assert.equal(Buffer.from(await readFile(join(toDirectory, "frame-000000012.png"))).toString("utf8"), "png-6");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("one review invocation shares one focused Programme between frame evidence and clip delivery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-nle-review-"));
  try {
    const projectFile = join(directory, "edit.nle.json");
    const toDirectory = join(directory, "review");
    await writeFile(join(directory, "clip.mp4"), "clip");
    await writeFile(join(directory, "clip.media.json"), serializeMediaAssetDocument(mediaAsset()));
    await writeFile(projectFile, `${JSON.stringify(project(), null, 2)}\n`);
    const range = { startFrame: 6, endFrameExclusive: 24 };
    let evidenceProgram: object | undefined;

    const result = await reviewLocalNleProject({
      projectRoot: directory,
      projectFile,
      toDirectory,
      range,
      frames: [6, 12, 23],
    }, {
      async rasterizeFrames(request, options) {
        evidenceProgram = request.program;
        assert.equal(request.program.frameCount, 18);
        assert.deepEqual(request.frames, [0, 6, 17]);
        return {
          picture: structuredClone(request.picture),
          frames: await Promise.all(request.frames.map(async frame => ({
            frame,
            artifact: await options.resources.put(new TextEncoder().encode(`png-${frame}`), "image/png"),
          }))),
        };
      },
      createExecutor(resources) {
        return {
          async renderVisual(request) {
            assert.deepEqual(request.program, evidenceProgram);
            assert.equal(request.range, undefined);
            return sealRenderedVisual({
              frameRate: request.program.frameRate,
              frameCount: request.program.frameCount,
              canvas: request.program.canvas,
              delivery: request.delivery,
              artifact: await resources.put(new TextEncoder().encode("review-visual"), "video/mp4"),
            });
          },
          async renderAudio(request) {
            assert(request.range !== undefined);
            return sealRenderedAudio({
              sampleFrames: frameSpanSamples(range, { frameRate: { numerator: 30, denominator: 1 } }, 48_000)
                .sampleFrames,
              artifact: await resources.put(new TextEncoder().encode("review-audio"), "audio/wav"),
            });
          },
          async mux(request) {
            return sealMuxedMedia({
              frameRate: request.visual.frameRate,
              frameCount: request.visual.frameCount,
              canvas: request.visual.canvas,
              delivery: request.delivery,
              artifact: await resources.put(new TextEncoder().encode("review-final"), "video/mp4"),
            });
          },
        };
      },
    });

    assert.equal(result.programmeFrameCount, 30);
    assert.equal(result.reviewFrameCount, 18);
    assert.deepEqual(result.frames.map(value => value.frame), [6, 12, 23]);
    assert.equal(Buffer.from(await readFile(join(toDirectory, "review.mp4"))).toString("utf8"), "review-final");
    assert.equal(Buffer.from(await readFile(join(toDirectory, "frames", "frame-000000012.png"))).toString("utf8"),
      "png-6");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("module selection includes nested Present and Operator Application owners exactly once", () => {
  const symbol = (name: string) => ({ module: { name }, name: "operator" });
  const nested = createNleProject({ id: "nested", name: "Nested" });
  const value = applyNleTransaction(createNleProject({ id: "modules", name: "Modules" }), {
    revision: 0,
    commands: [{
      kind: "track.add",
      track: {
        id: "picture", name: "Picture", kind: "picture", muted: false,
        items: [{
          id: "component", kind: "present", source: "component", component: symbol("@example/component"), parameters: {},
          start: second(0), duration: second(1), sourceTime: nleLinearTimeMapping(second(1)), enabled: true,
          picture: {
            layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "fill" },
            operators: [{
              id: "frame",
              operator: symbol("@example/frame"),
              parameters: {},
              controlTime: nleLinearTimeMapping(second(1)),
            }],
          },
        }, {
          id: "effect", kind: "adjustment", operator: symbol("@example/effect"), parameters: {},
          start: second(0), duration: second(1), controlTime: nleLinearTimeMapping(second(1)), enabled: true,
        }, {
          id: "compound", kind: "present", source: "composition", composition: nleProjectComposition(applyNleTransaction(nested, { revision: 0, commands: [{
            kind: "track.add", track: {
              id: "inner", name: "Inner", kind: "picture", muted: false,
              items: [{
                id: "inner-component", kind: "present", source: "component", component: symbol("@example/nested"), parameters: {},
                start: second(0), duration: second(1), sourceTime: nleLinearTimeMapping(second(1)), enabled: true,
                picture: { layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "fill" } },
              }],
            },
          }] })),
          start: second(1), duration: second(1), sourceTime: nleLinearTimeMapping(second(1)), enabled: true,
          picture: { layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "fill" } },
        }],
      },
    }],
  });
  assert.deepEqual(nleProjectModuleKeys(value), [
    "@example/component",
    "@example/effect",
    "@example/frame",
    "@example/nested",
  ]);
});

