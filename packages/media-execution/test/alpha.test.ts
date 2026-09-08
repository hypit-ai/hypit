import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryResourceStore, alphaSize, ffmpegBytes, hasMediaBinaries, normalizeTestVideo, testMediaEnvironment, transparentVideoFixture, writeTestArtifact } from "../../../test/alpha-video-fixture.js";
import { executeExtractFrame } from "../src/index.js";
import { canonicalize } from "@hypit/protocol";

for (const format of ["webm", "webm-vp8", "mov"] as const) {
  test(`Normalize preserves transparent and translucent pixels, motion and audio from ${format}`, {
    skip: !hasMediaBinaries && "ffmpeg and ffprobe are not installed",
  }, async () => {
    const directory = await mkdtemp(join(tmpdir(), "hypit-alpha-normalize-"));
    try {
      const resources = new MemoryResourceStore();
      const fixture = await transparentVideoFixture(directory, format);
      const source = await resources.put(fixture.bytes, fixture.mediaType);
      const media = await normalizeTestVideo(resources, source, true);
      assert.equal(media.visual!.artifact.mediaType, "video/webm");
      assert.equal(media.timeline.frameCount, 12);
      const visual = await writeTestArtifact(resources, media.visual!.artifact, join(directory, "normalized.webm"));
      const pixels = ffmpegBytes(["-c:v", "libvpx-vp9", "-i", visual, "-an", "-pix_fmt", "rgba", "-f", "rawvideo", "pipe:1"]);
      const stride = alphaSize.width * alphaSize.height * 4;
      assert.equal(pixels.length, stride * 12);
      const alpha = (f: number, x: number, y: number) => pixels[f * stride + (y * alphaSize.width + x) * 4 + 3]!;
      for (let f = 0; f < 12; f++) {
        assert.equal(alpha(f, 4, 4), 0);
        assert.equal(alpha(f, 32, 32), 255);
        assert.ok(Math.abs(alpha(f, 60, 32) - 128) <= 1);
      }
      assert.equal(alpha(0, 18, 32), 255);
      assert.equal(alpha(11, 18, 32), 0);
      const extracted = await executeExtractFrame(testMediaEnvironment(resources), canonicalize({
        source: media.visual!.artifact, streamIndex: 0, sourceFrameCount: 12,
        at: { kind: "first" }, output: { format: "png" },
      }));
      assert.equal(extracted.value.kind, "blob");
      const still = await writeTestArtifact(resources, extracted.value, join(directory, "extracted.png"));
      const stillPixels = ffmpegBytes(["-i", still, "-pix_fmt", "rgba", "-f", "rawvideo", "pipe:1"]);
      assert.equal(stillPixels[(4 * alphaSize.width + 4) * 4 + 3], 0);
      assert.equal(stillPixels[(32 * alphaSize.width + 32) * 4 + 3], 255);
      const audio = await writeTestArtifact(resources, media.audio!.artifact, join(directory, "normalized.wav"));
      const samples = ffmpegBytes(["-i", audio, "-f", "s16le", "pipe:1"]);
      assert.equal(samples.length, 48_000 * 2 * 2);
      assert.ok(samples.some((value) => value !== 0));
      const broll = await normalizeTestVideo(resources, source, false);
      assert.equal(broll.audio, undefined);
      assert.equal(broll.visual!.artifact.mediaType, "video/webm");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}
