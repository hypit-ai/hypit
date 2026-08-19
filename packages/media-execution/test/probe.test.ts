import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";


import { parseMediaInspection } from "@hypit/media-execution";

test("probe derives the last decoded-unit duration instead of adding whole-stream duration_ts", () => {
  const inspection = parseMediaInspection({
    source: {
      kind: "blob",
      digest: fixtureDigest("probe-duration-fixture"),
      size: 1,
      mediaType: "video/mp4",
    },
    ffprobeVersion: "ffprobe fixture",
    value: {
      format: { format_name: "mov,mp4" },
      streams: [
        {
          index: 0,
          codec_type: "video",
          codec_name: "h264",
          width: 160,
          height: 96,
          time_base: "1/1000",
          avg_frame_rate: "25/1",
          r_frame_rate: "25/1",
          duration_ts: 10_000,
          disposition: { default: 1, attached_pic: 0 },
        },
        {
          index: 1,
          codec_type: "audio",
          codec_name: "aac",
          sample_rate: "48000",
          channels: 2,
          channel_layout: "stereo",
          time_base: "1/1000",
          duration_ts: 10_000,
          disposition: { default: 1, attached_pic: 0 },
        },
      ],
      frames: [
        { media_type: "video", stream_index: 0, pts: 0 },
        { media_type: "video", stream_index: 0, pts: 40 },
        { media_type: "video", stream_index: 0, pts: 80 },
        { media_type: "audio", stream_index: 1, pts: 500, nb_samples: 480 },
      ],
    },
  });

  const video = inspection.streams.find((stream) => stream.kind === "video");
  const audio = inspection.streams.find((stream) => stream.kind === "audio");
  assert.equal(video?.endPts?.ticks, "120", "last video frame should inherit the preceding 40-tick cadence");
  assert.equal(audio?.endPts?.ticks, "510", "480 samples at 48kHz equal 10 ticks in a 1/1000 time base");
});

test("probe preserves square-pixel and quarter-turn facts needed before Spatial", () => {
  const source = {
    kind: "blob" as const,
    digest: fixtureDigest("probe-display-geometry-fixture"),
    size: 1,
    mediaType: "video/mp4",
  };
  const value = {
    format: { format_name: "mov,mp4" },
    streams: [{
      index: 0, codec_type: "video", codec_name: "h264", width: 160, height: 96,
      sample_aspect_ratio: "8:4", time_base: "1/1000", avg_frame_rate: "25/1", r_frame_rate: "25/1",
      disposition: { default: 1, attached_pic: 0 },
      side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }],
    }],
    frames: [
      { media_type: "video", stream_index: 0, pts: 0 },
      { media_type: "video", stream_index: 0, pts: 40 },
    ],
  };
  const inspection = parseMediaInspection({ source, ffprobeVersion: "ffprobe fixture", value });
  const video = inspection.streams[0];
  assert.equal(video?.kind, "video");
  if (video?.kind !== "video") return;
  assert.deepEqual(video.sampleAspectRatio, { numerator: 2, denominator: 1 });
  assert.equal(video.rotationDegrees, 270);
  assert.throws(() => parseMediaInspection({
    source, ffprobeVersion: "ffprobe fixture",
    value: {
      ...value,
      streams: [{ ...value.streams[0], side_data_list: [{ side_data_type: "Display Matrix", rotation: 45 }] }],
    },
  }), /unsupported non-quarter display rotation/u);
});
