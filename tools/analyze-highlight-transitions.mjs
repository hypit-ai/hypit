#!/usr/bin/env node
import { spawn } from "node:child_process";

const [videoFile] = process.argv.slice(2);
if (!videoFile) {
  throw new Error("usage: analyze-highlight-transitions.mjs <video.mp4>");
}

const width = 730;
const height = 130;
const bytesPerFrame = width * height * 3;
const ffmpeg = spawn("ffmpeg", [
  "-hide_banner",
  "-loglevel", "error",
  "-i", videoFile,
  "-vf", "crop=730:130:350:1010",
  "-f", "rawvideo",
  "-pix_fmt", "rgb24",
  "-",
], { stdio: ["ignore", "pipe", "inherit"] });

let pending = Buffer.alloc(0);
let frame = 0;
let previous;

function highlightMask(buffer) {
  const mask = new Uint8Array(width * height);
  let count = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const offset = pixel * 3;
    const red = buffer[offset];
    const green = buffer[offset + 1];
    const blue = buffer[offset + 2];
    const distance = (
      (255 - red) ** 2
      + (211 - green) ** 2
      + (77 - blue) ** 2
    );
    if (distance > 1_800) continue;
    mask[pixel] = 1;
    count += 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return {
    mask,
    count,
    box: count ? [minX, minY, maxX, maxY] : undefined,
  };
}

function similarity(left, right) {
  if (!left || !right) return 0;
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < left.mask.length; index += 1) {
    const l = left.mask[index];
    const r = right.mask[index];
    if (l && r) intersection += 1;
    if (l || r) union += 1;
  }
  return union ? intersection / union : 1;
}

ffmpeg.stdout.on("data", (chunk) => {
  pending = Buffer.concat([pending, chunk]);
  while (pending.length >= bytesPerFrame) {
    const pixels = pending.subarray(0, bytesPerFrame);
    pending = pending.subarray(bytesPerFrame);
    const current = highlightMask(pixels);
    const score = similarity(previous, current);
    const appeared = current.count >= 40 && (!previous || previous.count < 40);
    const disappeared = current.count < 40 && previous && previous.count >= 40;
    if (appeared || disappeared || (current.count >= 40 && previous?.count >= 40 && score < 0.42)) {
      process.stdout.write(
        `${String(frame).padStart(4)} ${(frame / 30).toFixed(3)}s `
        + `pixels=${String(current.count).padStart(4)} similarity=${score.toFixed(3)} `
        + `box=${current.box?.join(",") ?? "-"}\n`,
      );
    }
    previous = current;
    frame += 1;
  }
});

await new Promise((resolve, reject) => {
  ffmpeg.on("error", reject);
  ffmpeg.on("close", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`ffmpeg exited ${code}`));
  });
});
