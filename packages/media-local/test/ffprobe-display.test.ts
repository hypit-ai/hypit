import assert from "node:assert/strict";
import test from "node:test";
import { ffprobeDisplayExtent, ffprobeDisplayRotation } from "../src/ffprobe-display.js";

test("display metadata is interpreted once in the same orientation FFmpeg emits", () => {
  assert.equal(ffprobeDisplayRotation({
    tags: { rotate: "180" },
    side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }],
  }), 270, "display matrix is the authoritative ffprobe representation");
  assert.deepEqual(ffprobeDisplayExtent({
    width: 1920,
    height: 1080,
    side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }],
  }), { width: 1080, height: 1920 });
  assert.deepEqual(ffprobeDisplayExtent({ width: "1920", height: "1080", tags: { rotate: "180" } }),
    { width: 1920, height: 1080 });
});

test("unsupported display transforms fail at the media adapter boundary", () => {
  assert.throws(() => ffprobeDisplayExtent({ width: 1920, height: 1080, tags: { rotate: "45" } }),
    /non-quarter display rotation 45/u);
});
