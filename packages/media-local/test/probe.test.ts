import assert from "node:assert/strict";
import test from "node:test";
import { parseMediaContainerIndex, parseMediaInspection } from "../src/probe.js";

test("container-index inspection publishes only declared integer timing without decoded counts", () => {
  const inspection = parseMediaContainerIndex({
    streams: [{
      index: 0, codec_type: "video", codec_name: "h264", width: 160, height: 96,
      time_base: "1/1000", start_pts: 250, duration_ts: 10_000,
      avg_frame_rate: "25/1", disposition: { default: 1, attached_pic: 0 },
    }, {
      index: 1, codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2,
      time_base: "1/48000", start_pts: 12_000, duration_ts: 480_000,
      disposition: { default: 1, attached_pic: 0 },
    }],
  });

  const video = inspection.streams[0];
  const audio = inspection.streams[1];
  assert.equal(video?.startPts?.ticks, "250");
  assert.equal(video?.endPts?.ticks, "10250");
  assert.equal(video?.kind === "video" && video.decodedUnitCount, 0,
    "container frame count must not masquerade as decoded evidence");
  assert.equal(audio?.startPts?.ticks, "12000");
  assert.equal(audio?.endPts?.ticks, "492000");
  assert.equal(audio?.kind === "audio" && audio.decodedSampleFrames, 0,
    "container duration must not masquerade as decoded samples");
});

test("container-index inspection neither guesses missing timing nor decodes a declared constant picture", () => {
  const stream = {
    index: 0, codec_type: "video", codec_name: "png", width: 8, height: 6,
    time_base: "1/25", avg_frame_rate: "25/1",
    disposition: { default: 1, attached_pic: 0 },
  };
  const unknown = parseMediaContainerIndex({ streams: [stream] });
  assert.equal(unknown.streams[0]?.startPts, undefined);
  assert.equal(unknown.streams[0]?.kind === "video" && unknown.streams[0].decodedUnitCount, 0);

  const picture = parseMediaContainerIndex({ streams: [stream] }, { constantPicture: true });
  assert.equal(picture.streams[0]?.startPts, undefined);
  assert.equal(picture.streams[0]?.kind === "video" && picture.streams[0].decodedUnitCount, 1);
});

test("probe does not publish a cadence estimate as presentation timing", () => {
  const inspection = parseMediaInspection({
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
  });

  const video = inspection.streams.find((stream) => stream.kind === "video");
  const audio = inspection.streams.find((stream) => stream.kind === "audio");
  assert.equal(video?.startPts, undefined);
  assert.equal(video?.endPts, undefined);
  assert.notEqual(audio?.startPts, undefined);
  assert.equal(audio?.endPts?.ticks, "510", "480 samples at 48kHz equal 10 ticks in a 1/1000 time base");
});

test("probe publishes observed timing only when every decoded unit has an explicit duration", () => {
  const inspection = parseMediaInspection({
    format: { format_name: "mov,mp4" },
    streams: [{
      index: 0, codec_type: "video", codec_name: "h264", width: 160, height: 96,
      time_base: "1/1000", disposition: { default: 1, attached_pic: 0 },
    }],
    frames: [
      { media_type: "video", stream_index: 0, pts: 0, duration: 40 },
      { media_type: "video", stream_index: 0, pts: 40, duration: 40 },
      { media_type: "video", stream_index: 0, pts: 80, duration: 20 },
    ],
  });

  assert.notEqual(inspection.streams[0]?.startPts, undefined);
  assert.equal(inspection.streams[0]?.endPts?.ticks, "100");
});

test("probe leaves a single decoded unit without duration as missing timing", () => {
  const inspection = parseMediaInspection({
    format: { format_name: "mov,mp4" },
    streams: [{
      index: 0, codec_type: "video", codec_name: "h264", width: 160, height: 96,
      time_base: "1/1000", disposition: { default: 1, attached_pic: 0 },
    }],
    frames: [{ media_type: "video", stream_index: 0, pts: 0 }],
  });

  assert.equal(inspection.streams[0]?.startPts, undefined);
  assert.equal(inspection.streams[0]?.endPts, undefined);
});

test("probe preserves square-pixel and quarter-turn facts needed before Spatial", () => {
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
  const inspection = parseMediaInspection(value);
  const video = inspection.streams[0];
  assert.equal(video?.kind, "video");
  if (video?.kind !== "video") return;
  assert.deepEqual(video.sampleAspectRatio, { numerator: 2, denominator: 1 });
  assert.equal(video.rotationDegrees, 270);
  assert.throws(() => parseMediaInspection({
    ...value,
    streams: [{ ...value.streams[0], side_data_list: [{ side_data_type: "Display Matrix", rotation: 45 }] }],
  }), /unsupported non-quarter display rotation/u);
});
