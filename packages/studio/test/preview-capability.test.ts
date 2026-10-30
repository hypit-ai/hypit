import assert from "node:assert/strict";
import test from "node:test";

import {
  audioGraphFromClips,
  sealAudioTrack,
  sealComposition,
  sealPresentVisualTrack,
  sealVisualProcessEffect,
  sealVisualScope,
} from "@hypit/composition";
import { htmlVisual, htmlVisualElement } from "@hypit/html-program";
import { sealTimeline } from "@hypit/timeline";
import { exactTemporalZero, identityTemporalMap } from "@hypit/temporal";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { frameRangeFixture, frameSamplingMapFixture } from "../../../test/temporal-fixture.js";

import { renderStudioHtmlProgram } from "../src/preview/render.js";

test("Studio rejects Visual Process previews instead of displaying empty input rasters", () => {
  const timeline = sealTimeline({ id: "preview-process", frameCount: 1,
    frameRate: { numerator: 30, denominator: 1 } });
  const member = (id: string) => {
    const track = sealPresentVisualTrack({ id, timelineId: timeline.id, presents: [{
      id, span: { startFrame: 0, endFrameExclusive: 1 },
      root: htmlVisualElement({ id, kind: "box", style: [], children: [] }),
    }] });
    return { kind: "track" as const, id, track };
  };
  const content = member("content");
  const matte = member("matte");
  const composition = sealComposition({ id: "preview-process", visual: {
    canvas: { width: 64, height: 64, clearColor: "#000000" },
    root: sealVisualScope({ members: [{
      kind: "process", id: "mask",
      inputs: [{ name: "content", scope: { members: [content] } },
        { name: "matte", scope: { members: [matte] } }],
      effect: sealVisualProcessEffect({ inputs: ["content", "matte"],
        program: htmlVisual({ html: "{{content}}{{matte}}" }) }),
    }] }),
  }, audio: { contributions: [] } }, timeline);

  assert.throws(() => renderStudioHtmlProgram({ composition }),
    /Studio preview is disabled for Visual Process/u);
});

test("Studio rejects a selected non-default audio stream instead of playing the container default", () => {
  const timeline = sealTimeline({ id: "preview-audio-stream", frameCount: 30,
    frameRate: { numerator: 30, denominator: 1 } });
  const sampleClock = { frameRate: { numerator: 48_000, denominator: 1 } } as const;
  const sampling = frameSamplingMapFixture({
    targetFrameRate: sampleClock.frameRate,
    targetFrames: 48_000,
    sourceFrameRate: sampleClock.frameRate,
    sourceFrames: 48_000,
    pieces: [{ target: { startFrame: 0, endFrameExclusive: 48_000 },
      sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 } }],
  });
  const domain = sampling.stages[0]!.source;
  const audio = sealAudioTrack({ id: "voice", timelineId: timeline.id, graph: audioGraphFromClips([{
    id: "voice",
    source: {
      source: { kind: "blob", resource: fixtureResource("studio:audio-stream-one"),
        size: 1, mediaType: "video/mp4" },
      streamIndex: 1,
      presentationStart: exactTemporalZero(),
      sourceDomain: domain,
      interpretation: { sampleRate: 48_000, channels: 2 },
    },
    preparation: identityTemporalMap(domain),
    target: frameRangeFixture(0, 48_000, sampleClock.frameRate),
    sampling,
    gain: 1,
    fadeIn: exactTemporalZero(),
    fadeOut: exactTemporalZero(),
  }]) });
  const composition = sealComposition({ id: "preview-audio-stream", visual: {
    canvas: { width: 64, height: 64, clearColor: "#000000" },
    root: { members: [] },
  }, audio: { contributions: [audio] } }, timeline);

  assert.throws(() => renderStudioHtmlProgram({ composition }),
    /Browser playback cannot select audio stream 1/u);
});
