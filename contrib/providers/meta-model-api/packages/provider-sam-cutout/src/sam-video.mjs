/**
 * SAM 3.1 (Meta Model API) transport for portrait-style cutout video.
 *
 * Deliberately free of `@hypit/*` imports so it can be run directly with node
 * against a live key:
 *
 *   node src/sam-video.mjs <source.mp4> <out.webm> [concept]
 *
 * Flow: upload the clip to /v1/files -> POST /v1/responses with muxed
 * text+video input -> decode the streamed special-token segmentation grammar
 * with @meta-sam/parser -> composite each frame's mask as alpha -> encode
 * VP9/YUVA (WEBM) or ProRes 4444 (MOV).
 */
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const DEFAULT_BASE_URL = "https://api.meta.ai/v1";
export const DEFAULT_MODEL = "sam-3.1";
export const DEFAULT_CONCEPT = "person";

function ffmpegBinary() {
  return process.env.FFMPEG_PATH ?? "ffmpeg";
}

function ffprobeBinary() {
  return process.env.FFPROBE_PATH ?? "ffprobe";
}

/** @returns {Promise<{width:number,height:number,fps:number,frames:number,codec:string}>} */
export async function probeVideo(bytes, workDir) {
  const path = join(workDir, "probe.src");
  await writeFile(path, bytes);
  const { stdout } = await run(ffprobeBinary(), [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,avg_frame_rate,nb_frames,codec_name",
    "-show_entries", "format=duration",
    "-of", "json", path,
  ]);
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0] ?? {};
  const [num, den] = String(stream.avg_frame_rate ?? "25/1").split("/").map(Number);
  const fps = den ? num / den : 25;
  const frames = Number(stream.nb_frames ?? 0)
    || Math.round(Number(parsed.format?.duration ?? 0) * fps);
  if (!stream.width || !stream.height) throw new Error("SAM cutout: source has no readable video stream");
  return {
    width: stream.width,
    height: stream.height,
    fps,
    frames,
    codec: stream.codec_name ?? "unknown",
  };
}

async function uploadClip(bytes, { baseUrl, apiKey, fetchImpl, mimeType }) {
  const form = new FormData();
  form.set("purpose", "user_data");
  form.set("file", new Blob([bytes], { type: mimeType }), "source.mp4");
  const response = await fetchImpl(`${baseUrl}/files`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.id !== "string") {
    throw new Error(`SAM cutout: file upload failed (${response.status}) ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body.id;
}

async function* sseEvents(stream) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      for (const line of raw.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          yield JSON.parse(payload);
        } catch {
          // SSE heartbeat or a partial frame; drop it.
        }
      }
    }
  }
}

/** Streams one concept over the uploaded clip and returns per-frame mask records. */
async function requestMasks(fileId, concept, { baseUrl, apiKey, fetchImpl, model, timeoutMs }) {
  const { parseVideoStream, recordsOfKind, frameIndexOf } = await import("@meta-sam/parser");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        stream: true,
        input: [{
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: concept },
            { type: "input_video", file_id: fileId },
          ],
        }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`SAM cutout: /responses failed (${response.status}) ${(await response.text()).slice(0, 400)}`);
    }

    const parsed = parseVideoStream(sseEvents(response.body));
    for await (const _snapshot of parsed) { /* live progress is not forwarded yet */ }
    const result = await parsed.finalResult;
    if (result.outcome.status !== "completed") {
      throw new Error(`SAM cutout: segmentation ended ${result.outcome.status}`
        + (result.outcome.detail ? ` (${result.outcome.detail})` : ""));
    }
    const masks = recordsOfKind(result.records, "mask");
    if (masks.length === 0) {
      throw new Error(`SAM cutout: no object matched "${concept}" in this clip`);
    }
    return {
      masks: masks.map((m) => ({
        frame: frameIndexOf(m) ?? 0,
        objectId: m.objectId,
        bounds: m.bounds,
        mask: m.mask,
        confidence: m.confidence ?? null,
      })),
      diagnostics: result.diagnostics.map((d) => ({ code: d.code, severity: d.severity, message: d.message })),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Extracts frames as PNG at full source resolution. */
async function extractFrames(sourcePath, dir) {
  const target = join(dir, "src-%05d.png");
  await run(ffmpegBinary(), [
    "-v", "error", "-y", "-i", sourcePath, "-fps_mode", "passthrough", "-start_number", "1", target,
  ], { maxBuffer: 64 * 1024 * 1024 });
  const names = (await readdir(dir)).filter((n) => n.startsWith("src-") && n.endsWith(".png")).sort();
  return names.map((n) => join(dir, n));
}

/** Writes one alpha-composited PNG per frame using the mask that covers it. */
export async function compositeFrames(framePaths, masks, dir, { decodeMaskToRaster, sharp }) {
  const byFrame = new Map();
  for (const m of masks) {
    if (!byFrame.has(m.frame)) byFrame.set(m.frame, []);
    byFrame.get(m.frame).push(m);
  }
  const ordered = [...byFrame.keys()].sort((a, b) => a - b);
  const outDir = join(dir, "alpha");
  await run("mkdir", ["-p", outDir]);
  const paths = [];
  let carried = 0;
  let lastMasks = [];

  for (let index = 0; index < framePaths.length; index += 1) {
    const current = byFrame.get(index);
    if (current) lastMasks = current;
    else if (lastMasks.length > 0) carried += 1;

    const frameMeta = await sharp(framePaths[index]).metadata();
    const path = join(outDir, `alpha-${String(index + 1).padStart(5, "0")}.png`);

    if (lastMasks.length === 0 && !current) {
      // No mask yet at the head of the clip: write a genuinely transparent frame. sharp's
      // ensureAlpha() only *adds* an alpha channel, defaulting to opaque, so passing the source
      // frame through here exposed the original background on every leading frame.
      await writeFile(path, await sharp({
        create: {
          width: frameMeta.width,
          height: frameMeta.height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      }).png().toBuffer());
      paths.push(path);
      continue;
    }

    const plates = [];
    for (const m of current ?? lastMasks) {
      const raster = decodeMaskToRaster(m.mask);
      const raw = Buffer.alloc(m.mask.width * m.mask.height * 4);
      for (let i = 0; i < raster.length; i += 1) {
        const on = raster[i] === 1 ? 255 : 0;
        raw[i * 4] = 255; raw[i * 4 + 1] = 255; raw[i * 4 + 2] = 255; raw[i * 4 + 3] = on;
      }
      const plate = await sharp(raw, { raw: { width: m.mask.width, height: m.mask.height, channels: 4 } })
        .resize(
          Math.max(1, Math.round(m.bounds.right - m.bounds.left)),
          Math.max(1, Math.round(m.bounds.bottom - m.bounds.top)),
          { fit: "fill" },
        )
        .png()
        .toBuffer();
      plates.push({ input: plate, left: Math.round(m.bounds.left), top: Math.round(m.bounds.top) });
    }

    const canvas = await sharp({
      create: { width: frameMeta.width, height: frameMeta.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite(plates).png().toBuffer();

    // Write each frame as it is composed: holding every PNG in memory made peak usage grow with
    // the whole clip, which a multi-minute 1080p source turns into gigabytes.
    await writeFile(path, await sharp(framePaths[index])
      .ensureAlpha()
      .composite([{ input: canvas, blend: "dest-in" }])
      .png()
      .toBuffer());
    paths.push(path);
  }

  return { paths, frames: paths.length, carriedFrames: carried, firstMaskFrame: ordered[0] ?? null };
}

async function encodeAlphaVideo(paths, dir, { fps, format }) {
  const pattern = join(dir, "alpha", "alpha-%05d.png");
  const output = join(dir, format === "MOV" ? "out.mov" : "out.webm");
  const args = ["-v", "error", "-y", "-framerate", String(fps), "-i", pattern];
  if (format === "MOV") {
    args.push("-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le");
  } else {
    // VP9 keeps alpha out of band (the stream stays yuv420p and the container carries
    // alpha_mode=1), so `-auto-alt-ref 0` is mandatory and the result only shows its alpha
    // plane when decoded with the libvpx-vp9 decoder.
    args.push("-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "30");
  }
  args.push(output);
  await run(ffmpegBinary(), args, { maxBuffer: 64 * 1024 * 1024 });
  return { path: output, bytes: await readFile(output) };
}

/** True when the source carries at least one audio stream worth keeping. */
async function probeAudio(sourcePath) {
  const { stdout } = await run(ffprobeBinary(), [
    "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_name,channels,sample_rate",
    "-of", "json", sourcePath,
  ]);
  const streams = JSON.parse(stdout).streams ?? [];
  return streams.length === 0 ? null : streams[0];
}

/**
 * Muxes the source's audio onto the alpha video without touching the alpha.
 *
 * `-c:v copy` keeps the encoded video (and, for WebM, its out-of-band alpha) untouched; only the
 * audio is encoded, because WebM cannot carry AAC and ProRes MOV is happier with PCM.
 */
async function muxSourceAudio(alphaPath, sourcePath, dir, { format, audio }) {
  const output = join(dir, format === "MOV" ? "muxed.mov" : "muxed.webm");
  await run(ffmpegBinary(), [
    "-v", "error", "-y",
    "-i", alphaPath, "-i", sourcePath,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy",
    ...(format === "MOV" ? ["-c:a", "pcm_s16le"] : ["-c:a", "libopus", "-b:a", "128k"]),
    "-shortest", output,
  ], { maxBuffer: 64 * 1024 * 1024 });
  return { path: output, bytes: await readFile(output), audio };
}

/**
 * Reads the encoded file back and measures the alpha plane of one frame.
 *
 * This is the check that separates a real cutout from an opaque clip: a WebM without alpha
 * decodes to no alpha plane at all, and an all-zero alpha plane fails alphaextract coverage.
 */
export async function measureEncodedAlpha(path, format, frameIndex) {
  const decoderArgs = format === "MOV" ? [] : ["-c:v", "libvpx-vp9"];
  let buffer;
  try {
    const { stdout } = await run(ffmpegBinary(), [
      "-v", "error", ...decoderArgs, "-i", path,
      "-vf", `select=eq(n\\,${frameIndex}),alphaextract`,
      "-frames:v", "1", "-pix_fmt", "gray", "-f", "rawvideo", "-",
    ], { maxBuffer: 64 * 1024 * 1024, encoding: "buffer" });
    buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  } catch (error) {
    // ffmpeg fails the filter graph with "Requested planes not available" when the file has no
    // alpha plane at all — that is the negative result this probe exists to report, not a crash.
    const stderr = String(error?.stderr ?? "");
    if (stderr.includes("planes not available")) {
      return { alphaPlane: false, coverage: null, pixels: 0 };
    }
    throw error;
  }
  if (buffer.length === 0) return { alphaPlane: false, coverage: null, pixels: 0 };
  let opaque = 0;
  for (const value of buffer) if (value > 128) opaque += 1;
  return { alphaPlane: true, coverage: opaque / buffer.length, pixels: buffer.length };
}

/**
 * Full cutout pipeline. `sourceBytes` is the video Artifact's bytes.
 * Returns the encoded alpha video plus a report worth logging or asserting on.
 */
export async function cutoutVideo(options) {
  const {
    sourceBytes, sourceMediaType = "video/mp4", concept = DEFAULT_CONCEPT,
    format = "WEBM", baseUrl = DEFAULT_BASE_URL, apiKey, model = DEFAULT_MODEL,
    fetchImpl = globalThis.fetch, timeoutMs = 900_000,
  } = options;
  if (!apiKey) throw new Error("SAM cutout: an API key is required");

  const sharpModule = await import("sharp");
  const sharp = sharpModule.default ?? sharpModule.sharp;
  const { decodeMaskToRaster } = await import("@meta-sam/parser");
  const dir = await mkdtemp(join(tmpdir(), "sam-cutout-"));
  try {
    const sourcePath = join(dir, "source.mp4");
    await writeFile(sourcePath, sourceBytes);
    const probe = await probeVideo(sourceBytes, dir);
    const fileId = await uploadClip(sourceBytes, { baseUrl, apiKey, fetchImpl, mimeType: sourceMediaType });
    const { masks, diagnostics } = await requestMasks(fileId, concept, { baseUrl, apiKey, fetchImpl, model, timeoutMs });

    const framePaths = await extractFrames(sourcePath, dir);
    const composed = await compositeFrames(framePaths, masks, dir, { decodeMaskToRaster, sharp });
    // Deliver the requested format, plus an optional MOV compatibility copy encoded from the same
    // frames (no second API call). Each delivered file is re-decoded and alpha-checked on its own.
    const wanted = [format, ...(options.compatibilityCopy && format === "WEBM" ? ["MOV"] : [])];
    const sourceAudio = await probeAudio(sourcePath);
    const outputs = [];
    for (const each of wanted) {
      const encoded = await encodeAlphaVideo(composed.paths, dir, { fps: probe.fps, format: each });
      const delivered = sourceAudio === null
        ? encoded
        : await muxSourceAudio(encoded.path, sourcePath, dir, { format: each, audio: sourceAudio });
      const checkIndex = Math.floor(composed.paths.length / 2);
      const measured = await measureEncodedAlpha(delivered.path, each, checkIndex);
      if (!measured.alphaPlane) {
        throw new Error(`SAM cutout: the encoded ${each} has no alpha plane; refusing to return an opaque clip`);
      }
      const composedStats = await sharp(composed.paths[checkIndex]).stats();
      const alphaChannel = composedStats.channels[3];
      const expectedCoverage = alphaChannel === undefined ? null : (alphaChannel.mean / 255);
      if (expectedCoverage !== null && Math.abs(measured.coverage - expectedCoverage) > 0.02) {
        throw new Error(`SAM cutout: encoded ${each} alpha coverage ${measured.coverage.toFixed(4)} disagrees with the composed frame ${expectedCoverage.toFixed(4)}`);
      }
      outputs.push({
        format: each,
        bytes: new Uint8Array(delivered.bytes),
        mediaType: each === "MOV" ? "video/quicktime" : "video/webm",
        bytesOut: delivered.bytes.byteLength,
        alphaCheck: {
          frame: checkIndex,
          alphaPlane: measured.alphaPlane,
          measuredCoverage: Number(measured.coverage.toFixed(4)),
          expectedCoverage: expectedCoverage === null ? null : Number(expectedCoverage.toFixed(4)),
        },
      });
    }

    const primary = outputs[0];
    return {
      bytes: primary.bytes,
      mediaType: primary.mediaType,
      extras: outputs.slice(1),
      report: {
        concept, model, format, probe,
        uploadedFileId: fileId,
        maskRecords: masks.length,
        objectIds: [...new Set(masks.map((m) => m.objectId))].sort(),
        composedFrames: composed.frames,
        carriedFrames: composed.carriedFrames,
        firstMaskFrame: composed.firstMaskFrame,
        diagnostics,
        bytesOut: primary.bytesOut,
        audio: sourceAudio === null ? null : {
          codec: sourceAudio.codec_name ?? null,
          channels: sourceAudio.channels ?? null,
          sampleRate: sourceAudio.sample_rate ?? null,
          outCodec: format === "MOV" ? "pcm_s16le" : "libopus",
        },
        alphaCheck: primary.alphaCheck,
        delivered: outputs.map((o) => ({ format: o.format, bytes: o.bytesOut, mediaType: o.mediaType, alphaCheck: o.alphaCheck })),
      },
    };
  } finally {
    if (process.env.SAM_KEEP_TMP) console.error(`[sam] kept work dir: ${dir}`);
    else await rm(dir, { recursive: true, force: true });
  }
}

// Direct run: node src/sam-video.mjs <source> <out> [concept] [WEBM|MOV]
if (process.argv[1] && process.argv[1].endsWith("sam-video.mjs")) {
  const [source, out, concept = DEFAULT_CONCEPT, format = "MOV"] = process.argv.slice(2);
  if (!source || !out) {
    console.error("usage: node src/sam-video.mjs <source.mp4> <out.webm|out.mov> [concept] [WEBM|MOV]");
    process.exit(2);
  }
  const key = (await readFile(join(process.env.HOME ?? "", ".hermes", "sam_key"), "utf8")).trim();
  const started = Date.now();
  const result = await cutoutVideo({
    sourceBytes: new Uint8Array(await readFile(source)),
    concept, format, apiKey: key,
  });
  await writeFile(out, result.bytes);
  console.log(JSON.stringify({ wrote: out, elapsedMs: Date.now() - started, ...result.report }, null, 2));
}
