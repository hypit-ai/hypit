import assert from "node:assert/strict";
import test from "node:test";
import { sealMediaDeliverySpec, sealTimelineVisual, sealTimelineAudio } from "@hypit/media";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { mediaOperationsComponent } from "../src/component.js";
import { mediaOperationsProducers } from "../src/manifest.js";

const mux = mediaOperationsComponent.producers.find((item) => item.producer.name === mediaOperationsProducers.mux.name)!;
const delivery = sealMediaDeliverySpec({
  visual: { picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
    colorRange: "limited", bitDepth: 8, alpha: { mode: "opaque", matte: "#000000" } },
  encoding: { codec: "h264", pixelFormat: "yuv420p", quality: "standard" } },
  audio: { codec: "aac", sampleRate: 48_000, channelLayout: "stereo" }, container: "mp4",
});

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
      delivery: delivery.visual,
      artifact: { kind: "blob", resource: fixtureResource("mux:visual"), size: 1, mediaType: "video/mp4" } });
    const run = (samples: number) => {
      const audio = sealTimelineAudio({ sampleFrames: samples,
        sampleRate: 48_000, channelLayout: "stereo",
        artifact: { kind: "blob", resource: fixtureResource("mux:audio"), size: 1, mediaType: "audio/wav" } });
      return mux.handler({ inputs: {
        visual: { value: (visual) },
        audio: { value: (audio) },
        delivery: { value: (delivery) },
      } } as never);
    };
    const result = await run(sampleFrames);
    assert.equal(result.kind, "need");
    for (const incorrect of [sampleFrames - 1, sampleFrames + 1]) {
      await assert.rejects(async () => run(incorrect), /different presentation durations/u);
    }
  });
}

test("mux rejects visual bytes rendered for a different delivery requirement", async () => {
  const visual = sealTimelineVisual({
    frameRate: { numerator: 30, denominator: 1 },
    frameCount: 30,
    canvas: { width: 540, height: 960 },
    delivery: { ...delivery.visual, encoding: { ...delivery.visual.encoding, quality: "draft" } },
    artifact: { kind: "blob", resource: fixtureResource("mux:draft-visual"), size: 1, mediaType: "video/mp4" },
  });
  const audio = sealTimelineAudio({
    sampleFrames: 48_000,
    sampleRate: 48_000,
    channelLayout: "stereo",
    artifact: { kind: "blob", resource: fixtureResource("mux:draft-audio"), size: 1, mediaType: "audio/wav" },
  });

  await assert.rejects(async () => mux.handler({ inputs: {
    visual: { value: visual },
    audio: { value: audio },
    delivery: { value: delivery },
  } } as never), /visual implements a different delivery requirement/u);
});
