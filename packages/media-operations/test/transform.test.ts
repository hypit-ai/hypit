import assert from "node:assert/strict";
import test from "node:test";

import { prepareMedia } from "@hypit/media";
import { evaluateTemporalMap } from "@hypit/temporal";
import { fixtureResource } from "../../../test/fixture-resource.js";

import { transformPreparedMedia } from "../src/index.js";

const timestamp = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1_000 } });
const VIDEO_PICTURE = { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
  colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const;

function tenSecondMedia() {
  return prepareMedia({
    id: "source",
    source: {
      kind: "blob",
      resource: fixtureResource("transform-source"),
      size: 1_024,
      mediaType: "video/mp4",
    },
    inspection: {
      container: { formatNames: ["mp4"] },
      streams: [{
        kind: "video",
        index: 0,
        codecType: "video",
        codecName: "h264",
        disposition: { default: true, attachedPicture: false },
        timingStatus: "admissible",
        timeBase: { numerator: 1, denominator: 1_000 },
        startPts: timestamp("0"),
        endPts: timestamp("10000"),
        decodedUnitCount: 241,
        role: "moving",
        width: 1_920,
        height: 1_080,
        sampleAspectRatio: { numerator: 1, denominator: 1 },
        rotationDegrees: 0, picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709", colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const,
      }],
    },
    selection: { videoStreamIndex: 0, spanAuthority: "video", picture: VIDEO_PICTURE },
  });
}

test("PreparedMedia transforms derive a concrete target domain from the connected source domain", () => {
  const transformed = transformPreparedMedia(tenSecondMedia(), {
    operations: [{ kind: "retime", rate: { numerator: 2, denominator: 1 } }],
  }, "fast");

  assert.deepEqual(transformed.domain, {
    id: "fast",
    duration: { ticks: "5", timeBase: { numerator: 1, denominator: 1 } },
  });
  assert.deepEqual(evaluateTemporalMap(
    transformed.visual!.map,
    { ticks: "5", timeBase: { numerator: 1, denominator: 2 } },
    "after",
  ), { position: { ticks: "5", timeBase: { numerator: 1, denominator: 1 } }, sourceSide: "after" });
  assert.equal("decodedUnitCount" in transformed, false);
});

test("source-relative trim resolves before a following retime without author-supplied total duration", () => {
  const transformed = transformPreparedMedia(tenSecondMedia(), {
    operations: [
      { kind: "trim", start: { ticks: "1", timeBase: { numerator: 1, denominator: 1 } },
        tail: { ticks: "3", timeBase: { numerator: 1, denominator: 1 } } },
      { kind: "retime", rate: { numerator: 2, denominator: 1 } },
    ],
  }, "excerpt-fast");

  assert.deepEqual(transformed.domain.duration,
    { ticks: "3", timeBase: { numerator: 1, denominator: 1 } });
  assert.deepEqual(evaluateTemporalMap(
    transformed.visual!.map,
    { ticks: "2", timeBase: { numerator: 1, denominator: 1 } },
    "after",
  ), { position: { ticks: "5", timeBase: { numerator: 1, denominator: 1 } }, sourceSide: "after" });
});

test("a complete reverse retime derives its target domain without native source-frame facts", () => {
  const transformed = transformPreparedMedia(tenSecondMedia(), {
    operations: [{ kind: "retime", rate: { numerator: -2, denominator: 1 } }],
  }, "reverse-fast");

  assert.deepEqual(transformed.domain.duration,
    { ticks: "5", timeBase: { numerator: 1, denominator: 1 } });
  assert.deepEqual(evaluateTemporalMap(
    transformed.visual!.map,
    { ticks: "1", timeBase: { numerator: 1, denominator: 1 } },
    "after",
  ), { position: { ticks: "8", timeBase: { numerator: 1, denominator: 1 } }, sourceSide: "before" });
});

test("a complete rate profile waits for the PreparedMedia extent and integrates an exact target domain", () => {
  const transformed = transformPreparedMedia(tenSecondMedia(), {
    operations: [{
      kind: "retime-profile",
      knots: [
        { at: { edge: "start", offset: timestamp("0") }, rate: { numerator: 1, denominator: 1 } },
        { at: { edge: "start", offset: timestamp("5000") }, rate: { numerator: 1, denominator: 2 } },
        { at: { edge: "end", offset: timestamp("0") }, rate: { numerator: 1, denominator: 1 } },
      ],
    }],
  }, "bullet");

  assert.deepEqual(transformed.domain.duration,
    { ticks: "40", timeBase: { numerator: 1, denominator: 3 } });
  assert.deepEqual(evaluateTemporalMap(
    transformed.visual!.map,
    { ticks: "20", timeBase: { numerator: 1, denominator: 3 } },
    "after",
  ), { position: { ticks: "5", timeBase: { numerator: 1, denominator: 1 } }, sourceSide: "after" });
});

test("Retime profiles do not reinterpret source overlap as an ordinary speed ramp", () => {
  assert.throws(() => transformPreparedMedia(tenSecondMedia(), {
    operations: [{
      kind: "retime-profile",
      knots: [
        { at: { edge: "start", offset: timestamp("0") }, rate: { numerator: 1, denominator: 1 } },
        { at: { edge: "start", offset: timestamp("8000") }, rate: { numerator: 1, denominator: 1 } },
        { at: { edge: "start", offset: timestamp("6000") }, rate: { numerator: 1, denominator: 1 } },
        { at: { edge: "end", offset: timestamp("0") }, rate: { numerator: 1, denominator: 1 } },
      ],
    }],
  }, "overlap"), /source knots must remain increasing/u);
});
