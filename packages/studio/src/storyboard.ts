import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { renderWaveform } from "@hypit/media-local/files";

import type { ServedFile } from "./compile.js";

export type StudioStoryboard = {
  readonly bytes: Uint8Array;
  readonly count: number;
  readonly columns: number;
  readonly rows: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly sampleFps: number;
};

type VideoFacts = {
  readonly duration: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
};

function run(
  executable: string,
  args: readonly string[],
  maxOutputBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    let outputBytes = 0;
    let stderr = "";
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (error === undefined) resolve(Buffer.concat(stdout));
      else reject(error);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maxOutputBytes) {
        child.kill("SIGKILL");
        finish(new Error(`${executable} storyboard output is too large.`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-64 * 1024);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(`${executable} exited ${String(code)}: ${stderr.trim()}`));
    });
    child.stdin.on("error", () => { /* a failed child reports through close */ });
    child.stdin.end();
  });
}

function rational(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const [numerator, denominator] = value.split("/").map(Number);
  if (numerator === undefined || denominator === undefined || denominator === 0) return undefined;
  const result = numerator / denominator;
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

async function videoFacts(path: string): Promise<VideoFacts> {
  const output = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=avg_frame_rate,duration,width,height:format=duration",
    "-of", "json",
    path,
  ], 1024 * 1024);
  const value = JSON.parse(output.toString("utf8")) as {
    readonly streams?: readonly {
      readonly avg_frame_rate?: string;
      readonly duration?: string;
      readonly width?: number;
      readonly height?: number;
    }[];
    readonly format?: { readonly duration?: string };
  };
  const stream = value.streams?.[0];
  const duration = Number(stream?.duration ?? value.format?.duration);
  const fps = rational(stream?.avg_frame_rate);
  const width = stream?.width;
  const height = stream?.height;
  if (!(Number.isFinite(duration) && duration > 0 && fps !== undefined
    && width !== undefined && width > 0 && height !== undefined && height > 0)) {
    throw new Error("Video duration, frame rate or extent is unavailable for its Studio storyboard.");
  }
  return { duration, fps, width, height };
}

/** Build one immutable filmstrip atlas for an already selected video Artifact. */
export async function createStudioStoryboard(file: ServedFile): Promise<StudioStoryboard> {
  if (!file.mediaType.startsWith("video/")) throw new Error("Studio storyboards require a video Artifact.");
  return withMediaFile(file, storyboardFromFile);
}

/** Decode the low-resolution waveform outside the playback browser. */
export async function createStudioWaveform(file: ServedFile): Promise<Uint8Array> {
  return withMediaFile(file, (path) => renderWaveform(path, { width: 2048, height: 56 }));
}

async function withMediaFile<T>(file: ServedFile, use: (path: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "hypit-storyboard-"));
  try {
    const path = join(directory, "source");
    await pipeline(Readable.from(await file.open()), createWriteStream(path));
    return await use(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function storyboardFromFile(path: string): Promise<StudioStoryboard> {
  const facts = await videoFacts(path);
  // Timeline content is roughly 40 CSS px high. An 80 px atlas tile remains
  // crisp on a 2x display while still being a small presentation derivative.
  const tileHeight = 80;
  const tileWidth = Math.max(1, Math.round(tileHeight * facts.width / facts.height));
  // Short-form material gets a tile for every source frame. Longer material
  // gradually reduces sampling density to keep the presentation atlas bounded.
  const sampleFps = Math.min(facts.fps, 360 / facts.duration);
  const count = Math.max(1, Math.floor(facts.duration * sampleFps));
  const columns = Math.min(32, count);
  const rows = Math.ceil(count / columns);
  const filter = [
    `fps=${sampleFps.toFixed(6)}`,
    `scale=${tileWidth}:${tileHeight}:force_original_aspect_ratio=decrease`,
    `pad=${tileWidth}:${tileHeight}:(ow-iw)/2:(oh-ih)/2:black`,
    `tile=layout=${columns}x${rows}:nb_frames=${count}:padding=0:margin=0`,
  ].join(",");
  const bytes = await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-i", path,
    "-vf", filter,
    "-frames:v", "1",
    "-f", "image2pipe",
    "-vcodec", "png",
    "pipe:1",
  ], 64 * 1024 * 1024);
  return { bytes, count, columns, rows, tileWidth, tileHeight, sampleFps };
}
