import { spawn } from "node:child_process";

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
  input: Uint8Array,
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
    child.stdin.end(Buffer.from(input));
  });
}

function rational(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const [numerator, denominator] = value.split("/").map(Number);
  if (numerator === undefined || denominator === undefined || denominator === 0) return undefined;
  const result = numerator / denominator;
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

async function videoFacts(file: ServedFile): Promise<VideoFacts> {
  const output = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=avg_frame_rate,duration,width,height:format=duration",
    "-of", "json",
    "pipe:0",
  ], file.bytes, 1024 * 1024);
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
  const facts = await videoFacts(file);
  // Timeline content is roughly 40 CSS px high. An 80 px atlas tile remains
  // crisp on a 2x display while still being a small presentation derivative.
  const tileHeight = 80;
  const tileWidth = Math.max(1, Math.round(tileHeight * facts.width / facts.height));
  // Short-form material gets a tile for every source frame. Longer material
  // gradually reduces sampling density to keep the presentation atlas bounded.
  const sampleFps = Math.max(1, Math.min(facts.fps, 360 / facts.duration));
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
    "-i", "pipe:0",
    "-vf", filter,
    "-frames:v", "1",
    "-f", "image2pipe",
    "-vcodec", "png",
    "pipe:1",
  ], file.bytes, 64 * 1024 * 1024);
  return { bytes, count, columns, rows, tileWidth, tileHeight, sampleFps };
}
