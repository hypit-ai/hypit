import assert from "node:assert/strict";
import test from "node:test";
import { canonicalize } from "@hypit/protocol";
import { MemoryResourceStore, ffmpegBytes, hasMediaBinaries, testMediaEnvironment } from "../../../test/alpha-video-fixture.js";
import { executeExtractFrame } from "../src/execute.js";

test("a frame time past the end of the stream is reported as such", {
  skip: !hasMediaBinaries && "ffmpeg and ffprobe are not installed",
}, async () => {
  const resources = new MemoryResourceStore();
  const video = ffmpegBytes(["-f", "lavfi", "-i", "color=c=red:s=32x32:r=10:d=1",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-f", "mp4", "-movflags", "frag_keyframe+empty_moov", "pipe:1"]);
  const source = await resources.put(video, "video/mp4");
  const extract = (seconds: number) => executeExtractFrame(testMediaEnvironment(resources), canonicalize({
    source, streamIndex: 0, sourceFrameCount: 10, at: { kind: "time", seconds }, output: { format: "png" },
  }));
  assert.equal((await extract(0.5)).value.kind, "blob");
  await assert.rejects(extract(5), /no frame at 5s; the time is past the end of the selected stream/u);
});
