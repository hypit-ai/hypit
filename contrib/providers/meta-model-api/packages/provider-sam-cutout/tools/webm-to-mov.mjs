#!/usr/bin/env node
/**
 * 3b — WebM alpha → MOV (ProRes 4444) converter for readers that cannot decode WebM alpha.
 *
 *   node tools/webm-to-mov.mjs <in.webm> <out.mov>
 *
 * Why a tool and not a Provider: Hypit's only media transform capability
 * (`@hypit/media-operations@1#transform-media`) is an ordered trim/retime program over already
 * normalized SynchronizedMedia, not a container/codec conversion. Implementing it as a transcoder
 * would claim a contract it does not honour, so the conversion stays an explicit local step.
 *
 * The tool verifies the result: it decodes the alpha plane of the same frame from both files with
 * the correct decoder each (`libvpx-vp9` for WebM, native for ProRes) and fails if coverage moves
 * by more than one percentage point.
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { measureEncodedAlpha } from "../src/sam-video.mjs";

const run = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH ?? "ffprobe";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node tools/webm-to-mov.mjs <in.webm> <out.mov>");
  process.exit(2);
}

const probe = JSON.parse((await run(ffprobe, [
  "-v", "error", "-select_streams", "v:0",
  "-show_entries", "stream=codec_name,width,height,nb_frames,avg_frame_rate",
  "-show_entries", "stream_tags=alpha_mode",
  "-of", "json", input,
])).stdout);
const stream = probe.streams?.[0] ?? {};
if (stream.tags?.alpha_mode !== "1" && stream.tags?.ALPHA_MODE !== "1") {
  throw new Error(`${input} carries no WebM alpha (alpha_mode tag missing) — nothing to preserve`);
}

await run(ffmpeg, [
  "-v", "error", "-y", "-c:v", "libvpx-vp9", "-i", input,
  "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le",
  output,
], { maxBuffer: 64 * 1024 * 1024 });

const outProbe = JSON.parse((await run(ffprobe, [
  "-v", "error", "-select_streams", "v:0",
  "-show_entries", "stream=codec_name,pix_fmt,width,height",
  "-of", "json", output,
])).stdout).streams?.[0] ?? {};

// WebM rarely carries nb_frames; fall back to duration x fps so the sample is not always frame 0.
const duration = Number(JSON.parse((await run(ffprobe, ["-v", "error", "-show_entries", "format=duration",
  "-of", "json", input])).stdout).format?.duration ?? 0);
const [rateNum, rateDen] = String(stream.avg_frame_rate ?? "25/1").split("/").map(Number);
const frames = Number(stream.nb_frames ?? 0) || Math.round(duration * (rateDen ? rateNum / rateDen : 25));
const sample = frames > 2 ? Math.floor(frames / 2) : 0;
const [fromWebm, fromMov] = await Promise.all([
  measureEncodedAlpha(input, "WEBM", sample),
  measureEncodedAlpha(output, "MOV", sample),
]);

const report = {
  input, output, sampleFrame: sample,
  in: { codec: stream.codec_name, width: stream.width, height: stream.height, frames: stream.nb_frames ?? null },
  out: { codec: outProbe.codec_name, pixFmt: outProbe.pix_fmt, width: outProbe.width, height: outProbe.height },
  alpha: {
    webmPlane: fromWebm.alphaPlane, movPlane: fromMov.alphaPlane,
    webmCoverage: fromWebm.coverage === null ? null : Number(fromWebm.coverage.toFixed(4)),
    movCoverage: fromMov.coverage === null ? null : Number(fromMov.coverage.toFixed(4)),
  },
  bytes: (await readFile(output)).byteLength,
};

if (!fromWebm.alphaPlane || !fromMov.alphaPlane) {
  throw new Error(`alpha plane missing after conversion: ${JSON.stringify(report.alpha)}`);
}
if (Math.abs(fromWebm.coverage - fromMov.coverage) > 0.01) {
  throw new Error(`alpha coverage moved more than 1 point: ${JSON.stringify(report.alpha)}`);
}
await writeFile(`${output}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
