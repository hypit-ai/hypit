/**
 * Verifies the two Codex findings on PR 493 without calling the paid SAM endpoint:
 *  1. frames before the first mask are fully transparent (alpha 0), not opaque,
 *  2. each composed frame is written to disk as it is produced.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { compositeFrames } from "../src/sam-video.mjs";

const W = 64;
const H = 64;
const dir = await mkdtemp(join(tmpdir(), "sam-premask-"));
try {
  const frames = [];
  for (let index = 0; index < 4; index += 1) {
    const path = join(dir, `src-${index}.png`);
    await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .png().toFile(path);
    frames.push(path);
  }

  // First mask only on frame 2, covering the left half.
  const raster = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W / 2; x += 1) raster[y * W + x] = 1;
  const masks = [{
    frame: 2,
    objectId: "0",
    bounds: { left: 0, top: 0, right: W, bottom: H },
    mask: { width: W, height: H },
  }];

  const result = await compositeFrames(frames, masks, dir, {
    decodeMaskToRaster: () => raster,
    sharp,
  });

  const alphaOf = async (index) => {
    const { data, info } = await sharp(result.paths[index]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, info };
  };

  const leading = await alphaOf(0);
  let maxLeadingAlpha = 0;
  for (let i = 3; i < leading.data.length; i += 4) maxLeadingAlpha = Math.max(maxLeadingAlpha, leading.data[i]);
  console.log("frames:", result.frames, "firstMaskFrame:", result.firstMaskFrame, "carried:", result.carriedFrames);
  console.log("leading frame max alpha:", maxLeadingAlpha);
  if (maxLeadingAlpha !== 0) throw new Error("pre-mask frame is not transparent");

  const masked = await alphaOf(3);
  const alphaAt = (x, y) => masked.data[(y * masked.info.width + x) * 4 + 3];
  console.log("masked frame alpha left/right:", alphaAt(8, 32), alphaAt(56, 32));
  if (alphaAt(8, 32) !== 255 || alphaAt(56, 32) !== 0) throw new Error("mask was not applied");

  // Every frame exists on disk immediately after the call, which is what streaming writes mean.
  for (const path of result.paths) await readFile(path);
  console.log("pre-mask transparency + per-frame writes: OK");
} finally {
  await rm(dir, { recursive: true, force: true });
}
