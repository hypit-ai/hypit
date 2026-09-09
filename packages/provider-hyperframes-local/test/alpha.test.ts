import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sealComposition } from "@hypit/composition";
import { compileHyperframesDocument } from "@hypit/hyperframes";
import type { Narrative } from "@hypit/narrative";
import { parseScript, narrativeValue } from "@hypit/script";
import { materializeSemanticTake } from "@hypit/speech";
import { appendSpeechTrackTake, assembleSpeechTrack, createSpeechTrackSet,
  sealSpeechTrackHeader } from "@hypit/speech-track";
import { projectSemanticProgramSpace } from "@hypit/semantic-track";
import { appendMediaPerformance, appendMediaItem, appendTimedMediaLayer, createMediaLayerSet, createMediaSoundSet, createMediaTrackSet,
  finalizeMediaTrack, projectMediaVisualTrack, sealMediaItemSpec, sealMediaSampleLayerSpec, sealMediaTrackHeader } from "@hypit/media-track";
import { projectProgramWindow } from "../../../test/temporal-fixture.js";
import { MemoryResourceStore, ffmpegBytes, normalizeTestVideo, transparentVideoFixture, writeTestArtifact } from "../../../test/alpha-video-fixture.js";
import { renderHyperframesVisual } from "../src/index.js";

test("transparent normalized media composites through both SemanticTake/Speech Track and Media Track in Chrome", {
  skip: process.env.HYPIT_BROWSER_TESTS !== "1",
}, async () => {
  const directory = process.env.HYPIT_ALPHA_PROOF_DIR ?? await mkdtemp(join(tmpdir(), "hypit-alpha-render-"));
  await mkdir(directory, { recursive: true });
  try {
    const resources = new MemoryResourceStore();
    const fixture = await transparentVideoFixture(directory, "webm");
    const source = await resources.put(fixture.bytes, fixture.mediaType);
    const media = await normalizeTestVideo(resources, source, true);
    const broll = await normalizeTestVideo(resources, source, false);
    const narrative = narrativeValue(parseScript("alpha.svml", "<opening>Hello</opening>"), "story") as unknown as Narrative;
    const segment = narrative.segments[0]!;
    const token = narrative.tokens[0]!;
    // Known token timing isolates media preservation from remote speech recognition.
    const take = materializeSemanticTake(narrative,
      { narrativeId: narrative.id, kind: "segment", id: segment.id, tokenStart: 0, tokenEndExclusive: 1 }, media, {
        tokens: [{ tokenId: token.id, segmentId: segment.id, startFrame: 2, endFrameExclusive: 10 }],
        anchors: [
          { identity: segment.startAnchorId, frame: 0 }, { identity: segment.endAnchorId, frame: 12 },
          { identity: token.startAnchorId, frame: 2 }, { identity: token.endAnchorId, frame: 10 },
        ],
      });
    assert.deepEqual(take.media, media);
    const fit = { sizing: "contain" as const, framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.5, y: 0.5 },
      offsetPx: { x: 0, y: 0 }, constraint: "bounded" as const };
    const frame = { xPx: 0, yPx: 0, widthPx: 96, heightPx: 64 };
    const set = appendSpeechTrackTake(createSpeechTrackSet(), take);
    const semantic = assembleSpeechTrack(sealSpeechTrackHeader({ id: "speech" }), set);
    const space = projectSemanticProgramSpace(semantic);
    const header = sealMediaTrackHeader({ id: "broll" });
    const layers = appendTimedMediaLayer(createMediaLayerSet(), broll, fit, sealMediaSampleLayerSpec({ id: "cutout",
      occupancy: { mode: "once", align: "start" },
      appearance: { opacity: 1, filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 } },
    }));
    const spec = sealMediaItemSpec({ id: "broll-cutout", stackingOrder: 2, motion: { sustain: [] },
      presentation: { clip: { kind: "none" }, padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 },
        border: { widthPx: 0, style: "solid", color: "#000000" }, shadows: [] } });
    const items = appendMediaItem(createMediaTrackSet(), header, space,
      { widthPx: 192, heightPx: 64, origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square" },
      layers, { ...frame, xPx: 96 }, spec, createMediaSoundSet(), projectProgramWindow({
        itemId: spec.id, semantic, projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
      }));
    const performanceHeader = sealMediaTrackHeader({ id: "performance" });
    const performanceSpec = { ...spec, id: "performance", stackingOrder: 1 };
    const performance = appendMediaPerformance({ set: createMediaTrackSet(), header: performanceHeader, space,
      canvas: { widthPx: 192, heightPx: 64, origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square" },
      layers: createMediaLayerSet(), frame, spec: performanceSpec, sounds: createMediaSoundSet(),
      window: projectProgramWindow({ itemId: performanceSpec.id, semantic, projection: { start: { ref: "program.start" }, end: { ref: "program.end" } } }),
    }, semantic, fit, sealMediaSampleLayerSpec({ id: "content", occupancy: { mode: "once", align: "start" },
      appearance: { opacity: 1, filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 } } }));
    const speechVisual = projectMediaVisualTrack(space, finalizeMediaTrack(performance, performanceHeader, space));
    const brollVisual = projectMediaVisualTrack(space, finalizeMediaTrack(items, header, space));
    const document = compileHyperframesDocument(sealComposition({ id: "alpha-proof",
      canvas: { width: 192, height: 64, clearColor: "#143cdc" }, tracks: [speechVisual, brollVisual] }), space);
    const rendered = await renderHyperframesVisual({ document }, { resources, workers: 2, quality: "high", processTimeoutMs: 120_000 });
    const video = await writeTestArtifact(resources, rendered.artifact, join(directory, "speech-and-broll.mp4"));
    const pixels = ffmpegBytes(["-i", video, "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]);
    assert.equal(pixels.length, 192 * 64 * 3 * 12);
    const pixel = (f: number, x: number, y: number) => [...pixels.subarray(((f * 64 + y) * 192 + x) * 3, ((f * 64 + y) * 192 + x) * 3 + 3)];
    const close = (actual: number[], expected: number[]) => {
      assert.ok(actual.every((value, i) => Math.abs(value - expected[i]!) < 14), `${actual} differs from ${expected}`);
    };
    for (let f = 0; f < 12; f++) for (const left of [0, 96]) {
      close(pixel(f, left + 4, 4), [20, 60, 220]);
      close(pixel(f, left + 32, 32), [240, 20, 20]);
      close(pixel(f, left + 60, 32), [130, 40, 120]);
    }
    close(pixel(0, 18, 32), [240, 20, 20]);
    close(pixel(11, 18, 32), [20, 60, 220]);
  } finally {
    if (process.env.HYPIT_ALPHA_PROOF_DIR === undefined) await rm(directory, { recursive: true, force: true });
  }
});
