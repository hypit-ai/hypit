import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import type { AudiovisualHtmlTerminal } from "@hypit/audiovisual-html";
import { rasterizeHtmlFrames } from "@hypit/html-chromium-local";
import type { ChromiumHtmlRasterOptions } from "@hypit/html-chromium-local";
import type { HtmlFrameImages } from "@hypit/html-program";
import {
  verifyPreparedPictureSampling,
  type PreparedPictureSampling,
} from "@hypit/media";
import type { BlobRef } from "@hypit/protocol";
import { isStreamingResourceStore, type ResourceStore } from "@hypit/resource-store";
import {
  compareExactTemporalValues,
  exactTemporalValueFromFrames,
  exactTemporalZero,
  sealLocalTemporalDomain,
  sealTemporalMap,
  subtractExactTemporalValues,
} from "@hypit/temporal";

type PictureProductPublisher = NonNullable<AudiovisualHtmlTerminal["publishPictureProduct"]>;
type PictureProductRequest = Parameters<PictureProductPublisher>[0];

export type LocalHtmlPictureProductOptions = {
  /** Invocation-owned byte domain shared with the final compositor. */
  readonly resources: ResourceStore;
  readonly html?: Omit<ChromiumHtmlRasterOptions, "resources" | "signal">;
  readonly ffmpegPath?: string;
  readonly ffprobePath?: string;
  readonly sharedLibraryPath?: string;
  readonly processTimeoutMs?: number;
  readonly maxProcessOutputBytes?: number;
  readonly signal?: AbortSignal;
};

type ProcessOptions = {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly sharedLibraryPath?: string;
  readonly signal?: AbortSignal;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer.`);
  return value;
}

function processEnvironment(sharedLibraryPath?: string): NodeJS.ProcessEnv | undefined {
  if (sharedLibraryPath === undefined) return undefined;
  const key = process.platform === "darwin" ? "DYLD_LIBRARY_PATH"
    : process.platform === "win32" ? "PATH" : "LD_LIBRARY_PATH";
  const current = process.env[key];
  return { ...process.env, [key]: current === undefined ? sharedLibraryPath : `${sharedLibraryPath}${delimiter}${current}` };
}

function run(options: ProcessOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(options.executable, [...options.argv], {
      cwd: options.cwd,
      encoding: "utf8",
      maxBuffer: options.maxOutputBytes,
      timeout: options.timeoutMs,
      signal: options.signal,
      windowsHide: true,
      ...(options.sharedLibraryPath === undefined ? {} : { env: processEnvironment(options.sharedLibraryPath) }),
    }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(new Error(`${options.executable} failed: ${(stderr || stdout || error.message).trim().slice(-4000)}`));
      } else resolve(stdout);
    });
  });
}

function rationalEquals(
  value: string | undefined,
  expected: { readonly numerator: number; readonly denominator: number },
): boolean {
  const match = /^(\d+)\/(\d+)$/u.exec(value ?? "");
  return match !== null && BigInt(match[1]!) * BigInt(expected.denominator)
    === BigInt(expected.numerator) * BigInt(match[2]!);
}

async function putFile(resources: ResourceStore, path: string, signal?: AbortSignal): Promise<BlobRef> {
  const io = signal === undefined ? {} : { signal };
  return isStreamingResourceStore(resources)
    ? await resources.putStream(createReadStream(path, io), "video/webm", io)
    : await resources.put(await readFile(path, io), "video/webm", io);
}

async function stageFrames(
  result: HtmlFrameImages,
  resources: ResourceStore,
  directory: string,
  signal?: AbortSignal,
): Promise<void> {
  const frames = join(directory, "frames");
  await mkdir(frames);
  for (const [index, frame] of result.frames.entries()) {
    signal?.throwIfAborted();
    const bytes = await resources.get(frame.artifact.resource, signal === undefined ? {} : { signal });
    assert(bytes !== undefined, `HTML Product frame ${frame.frame} is unavailable.`);
    await writeFile(join(frames, `${String(index).padStart(9, "0")}.png`), bytes,
      signal === undefined ? {} : { signal });
  }
}

async function encodeTransparentWebm(
  request: PictureProductRequest,
  images: HtmlFrameImages,
  options: Required<Pick<LocalHtmlPictureProductOptions,
  "ffmpegPath" | "ffprobePath" | "processTimeoutMs" | "maxProcessOutputBytes">>
    & Pick<LocalHtmlPictureProductOptions, "resources" | "sharedLibraryPath" | "signal">,
): Promise<BlobRef> {
  const work = await mkdtemp(join(tmpdir(), "hypit-html-product-"));
  try {
    await stageFrames(images, options.resources, work, options.signal);
    const output = join(work, "product.webm");
    const rate = request.program.frameRate;
    await run({
      executable: options.ffmpegPath,
      argv: [
        "-y", "-framerate", `${rate.numerator}/${rate.denominator}`,
        "-start_number", "0", "-i", join(work, "frames", "%09d.png"),
        "-an", "-c:v", "libvpx-vp9", "-lossless", "1", "-pix_fmt", "yuva420p",
        "-auto-alt-ref", "0", "-row-mt", "1", "-deadline", "realtime", "-cpu-used", "8",
        output,
      ],
      cwd: work,
      timeoutMs: options.processTimeoutMs,
      maxOutputBytes: options.maxProcessOutputBytes,
      ...(options.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: options.sharedLibraryPath }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const probe = JSON.parse(await run({
      executable: options.ffprobePath,
      argv: [
        "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
        "stream=codec_name,width,height,start_pts,avg_frame_rate,nb_read_frames:stream_tags=alpha_mode", "-of", "json", output,
      ],
      cwd: work,
      timeoutMs: options.processTimeoutMs,
      maxOutputBytes: options.maxProcessOutputBytes,
      ...(options.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: options.sharedLibraryPath }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })) as { readonly streams?: readonly {
      readonly codec_name?: unknown; readonly width?: unknown; readonly height?: unknown;
      readonly start_pts?: unknown; readonly avg_frame_rate?: unknown; readonly nb_read_frames?: unknown;
      readonly tags?: Readonly<Record<string, unknown>>;
    }[] };
    const stream = probe.streams?.[0];
    assert(stream?.codec_name === "vp9", "HTML Picture Product is not VP9.");
    assert(stream.width === request.program.canvas.width && stream.height === request.program.canvas.height,
      "HTML Picture Product extent differs from its Program.");
    assert(stream.start_pts === 0 || stream.start_pts === "0",
      "HTML Picture Product does not begin at stream time zero.");
    assert(stream.nb_read_frames === String(request.program.frameCount),
      "HTML Picture Product frame count differs from its Program.");
    assert(typeof stream.avg_frame_rate === "string" && rationalEquals(stream.avg_frame_rate, rate),
      "HTML Picture Product frame rate differs from its Program.");
    assert(stream.tags?.alpha_mode === "1", "HTML Picture Product does not declare an alpha channel.");
    return await putFile(options.resources, output, options.signal);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function closeProduct(
  request: PictureProductRequest,
  artifact: BlobRef,
): PreparedPictureSampling {
  assert(request.requirement.temporal.kind === "signal",
    `HTML Picture Product ${request.requirement.id} has no temporal signal.`);
  const first = request.requirement.temporal.regions.regions[0];
  const last = request.requirement.temporal.regions.regions.at(-1);
  assert(first !== undefined && last !== undefined,
    `HTML Picture Product ${request.requirement.id} has no demanded range.`);
  const start = structuredClone(first.start.position);
  const end = structuredClone(last.end.position);
  const duration = exactTemporalValueFromFrames(request.program.frameCount, {
    frameRate: request.program.frameRate,
  });
  assert(compareExactTemporalValues(duration, subtractExactTemporalValues(end, start)) === 0,
    `HTML Picture Product ${request.requirement.id} Program duration differs from its demand.`);
  const sourceDomain = sealLocalTemporalDomain({
    id: `${request.domain.id}:html-product`,
    duration: structuredClone(duration),
  });
  const value: PreparedPictureSampling = {
    source: {
      source: artifact,
      kind: "signal",
      streamIndex: 0,
      presentationStart: exactTemporalZero(),
      sourceDomain,
      interpretation: {
        codedWidth: request.program.canvas.width,
        codedHeight: request.program.canvas.height,
        sampleAspectRatio: { numerator: 1, denominator: 1 },
        rotationDegrees: 0,
        picture: {
          colorPrimaries: "bt709",
          colorTransfer: "bt709",
          colorMatrix: "bt709",
          colorRange: "limited",
          bitDepth: 8,
          alphaMode: "straight",
        },
      },
    },
    sampling: sealTemporalMap({ stages: [{
      target: structuredClone(request.domain),
      source: structuredClone(sourceDomain),
      pieces: [{
        target: { start, end },
        sourceAtStart: exactTemporalZero(),
        rate: { numerator: 1, denominator: 1 },
      }],
    }] }),
  };
  verifyPreparedPictureSampling(value);
  return value;
}

/**
 * Materialize one HTML Operator island as an alpha-preserving transient Product.
 * PNG frames and WebM are execution Products only; no Media Asset is created.
 */
export function createLocalHtmlPictureProductPublisher(
  options: LocalHtmlPictureProductOptions,
): PictureProductPublisher {
  const processTimeoutMs = positiveInteger(options.processTimeoutMs ?? 30 * 60_000, "processTimeoutMs");
  const maxProcessOutputBytes = positiveInteger(options.maxProcessOutputBytes ?? 4 * 1024 * 1024,
    "maxProcessOutputBytes");
  return async request => {
    options.signal?.throwIfAborted();
    const frames = Array.from({ length: request.program.frameCount }, (_, frame) => frame);
    const images = await rasterizeHtmlFrames({
      program: request.program,
      picture: {
        colorPrimaries: "bt709",
        colorTransfer: "srgb",
        colorMatrix: "rgb",
        colorRange: "full",
        bitDepth: 8,
        alpha: { mode: "straight" },
      },
      frames,
    }, {
      ...options.html,
      resources: options.resources,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const artifact = await encodeTransparentWebm(request, images, {
      resources: options.resources,
      ffmpegPath: options.ffmpegPath ?? "ffmpeg",
      ffprobePath: options.ffprobePath ?? "ffprobe",
      processTimeoutMs,
      maxProcessOutputBytes,
      ...(options.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: options.sharedLibraryPath }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    return closeProduct(request, artifact);
  };
}
