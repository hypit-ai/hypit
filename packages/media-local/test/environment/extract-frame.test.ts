import assert from "node:assert/strict";
import test from "node:test";
import { assertBlobRef, canonicalize } from "@hypit/protocol";
import {
  MemoryResourceStore,
  ffmpegBytes,
  hasMediaBinaries,
  testMediaEnvironment,
} from "../../../../test/alpha-video-fixture.js";
import { executeExtractFrame } from "../../src/execute.js";

test("a time selection with no decoded frame has an evidence-bounded error", {
  skip: !hasMediaBinaries && "ffmpeg and ffprobe are not installed",
}, async () => {
  const resources = new MemoryResourceStore();
  const video = ffmpegBytes([
    "-f", "lavfi", "-i", "color=c=red:s=32x32:r=10:d=1",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-f", "mp4", "-movflags", "frag_keyframe+empty_moov", "pipe:1",
  ]);
  const source = await resources.put(video, "video/mp4");
  const extract = (seconds: number) => executeExtractFrame(testMediaEnvironment(resources), canonicalize({
    source,
    streamIndex: 0,
    sourceFrameCount: 10,
    at: { kind: "time", seconds },
    output: { format: "png" },
  }));
  const extracted = (await extract(0.5)).value;
  assertBlobRef(extracted, "extracted frame");
  await assert.rejects(extract(5), /no frame at 5s in the selected stream/u);
});
