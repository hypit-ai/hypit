import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { audioProgramSampleFrames } from "@hypit/audio-program";
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
  nleLinearSourceTime,
} from "@hypit/nle";

import { exportLocalNleProject, nleProjectModuleKeys } from "../src/export.js";

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
    editRate: { numerator: 30, denominator: 1 },
    canvas: { width: 100, height: 100, clearColor: "#000000" },
  });
  return applyNleTransaction(base, { revision: 0, commands: [{
    kind: "media.add",
    media: { id: "clip", name: "Clip", asset: { path: "./clip.media.json" } },
  }, {
    kind: "track.add",
    track: {
      id: "picture", name: "Picture", kind: "picture", locked: false, muted: false,
      items: [{
        id: "clip-use", kind: "media", media: "clip", enabled: true,
        start: second(0), duration: second(1), sourceTime: nleLinearSourceTime(second(1)),
        picture: {
          layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" },
          effects: [],
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
      projectFile,
      outputFile,
      frameRate: { numerator: 60, denominator: 1 },
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
    assert.equal(Buffer.from(await readFile(outputFile)).toString("utf8"), "final-mp4");
    assert(progress.includes("media") && progress.includes("lower") && progress.includes("mux"));
    await assert.rejects(exportLocalNleProject({ projectFile, outputFile }), /already exists/u);
    assert.equal(Buffer.from(await readFile(outputFile)).toString("utf8"), "final-mp4");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("module selection includes nested component and effect owners exactly once", () => {
  const symbol = (name: string) => ({ module: { name, version: "1" }, name: "operator" });
  const nested = createNleProject({ id: "nested", name: "Nested" });
  const value = applyNleTransaction(createNleProject({ id: "modules", name: "Modules" }), {
    revision: 0,
    commands: [{
      kind: "track.add",
      track: {
        id: "picture", name: "Picture", kind: "picture", locked: false, muted: false,
        items: [{
          id: "component", kind: "component", component: symbol("@example/component"), parameters: {},
          start: second(0), duration: second(1), sourceTime: nleLinearSourceTime(second(1)), enabled: true,
          picture: {
            layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "fill" },
            effects: [{ id: "effect", effect: symbol("@example/effect"), parameters: {} }],
          },
        }, {
          id: "compound", kind: "compound", project: applyNleTransaction(nested, { revision: 0, commands: [{
            kind: "track.add", track: {
              id: "inner", name: "Inner", kind: "picture", locked: false, muted: false,
              items: [{
                id: "inner-component", kind: "component", component: symbol("@example/nested"), parameters: {},
                start: second(0), duration: second(1), sourceTime: nleLinearSourceTime(second(1)), enabled: true,
                picture: { layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "fill" }, effects: [] },
              }],
            },
          }] }),
          start: second(1), duration: second(1), sourceTime: nleLinearSourceTime(second(1)), enabled: true,
          picture: { layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "fill" }, effects: [] },
        }],
      },
    }],
  });
  assert.deepEqual(nleProjectModuleKeys(value), [
    "@example/component@1",
    "@example/effect@1",
    "@example/nested@1",
  ]);
});

