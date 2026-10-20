import assert from "node:assert/strict";
import test from "node:test";
import { sealTimelineVisual, sealTimelineAudio } from "@hypit/media";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { mediaOperationsComponent } from "../src/component.js";
import { mediaOperationsProducers } from "../src/manifest.js";

const mux = mediaOperationsComponent.producers.find((item) => item.producer.name === mediaOperationsProducers.mux.name)!;

const cases = [
  { frameRate: { numerator: 30, denominator: 1 }, frameCount: 149, sampleFrames: 238400 },
  { frameRate: { numerator: 24000, denominator: 1001 }, frameCount: 149, sampleFrames: 298298 },
  { frameRate: { numerator: 30000, denominator: 1001 }, frameCount: 149, sampleFrames: 238638 },
  { frameRate: { numerator: 30000, denominator: 1001 }, frameCount: 1, sampleFrames: 1602 },
  { frameRate: { numerator: 60000, denominator: 1001 }, frameCount: 1, sampleFrames: 801 },
];

for (const { frameRate, frameCount, sampleFrames } of cases) {
  test(`mux accepts the nearest PCM sample boundary for ${frameCount} frames at ${frameRate.numerator}/${frameRate.denominator}`, async () => {
    const visual = sealTimelineVisual({ frameRate, frameCount, canvas: { width: 540, height: 960 },
      artifact: { kind: "blob", resource: fixtureResource("mux:visual"), size: 1, mediaType: "video/mp4" } });
    const run = (samples: number) => {
      const audio = sealTimelineAudio({ sampleFrames: samples,
        artifact: { kind: "blob", resource: fixtureResource("mux:audio"), size: 1, mediaType: "audio/wav" } });
      return mux.handler({ inputs: {
        visual: { value: (visual) },
        audio: { value: (audio) },
      } } as never);
    };
    const result = await run(sampleFrames);
    assert.equal(result.kind, "need");
    for (const incorrect of [sampleFrames - 1, sampleFrames + 1]) {
      await assert.rejects(async () => run(incorrect), /different presentation durations/u);
    }
  });
}
