import { constants } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { probeMedia } from "@hypit/media-file-local";

const exec = promisify(execFile);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export type SceneRecordProgress =
  | { readonly phase: "open" }
  | { readonly phase: "record"; readonly duration: number }
  | { readonly phase: "encode" }
  | { readonly phase: "complete" };

export type SceneRecordResult = {
  readonly format: "hypit.scene-record@1";
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly frameRate: number;
  readonly codec: "h264";
  readonly hasAudio: false;
};

/** Record an already-open Scene Workbench output page. CLI and Workbench export share this path. */
export async function recordSceneOutput(options: {
  readonly url: string;
  readonly destination: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly fps: number;
  readonly channel?: "chrome";
  readonly browser?: string;
  readonly ffmpeg?: string;
  readonly signal?: AbortSignal;
  readonly progress?: (progress: SceneRecordProgress) => void;
}): Promise<SceneRecordResult> {
  assert(Number.isSafeInteger(options.viewport.width) && options.viewport.width > 0,
    "Scene recording width must be a positive integer");
  assert(Number.isSafeInteger(options.viewport.height) && options.viewport.height > 0,
    "Scene recording height must be a positive integer");
  assert(Number.isFinite(options.fps) && options.fps > 0 && options.fps <= 120,
    "Scene recording fps must lie above 0 and at most 120");
  assert(options.browser === undefined || options.channel === undefined, "Choose a browser path or channel");
  options.signal?.throwIfAborted();

  const temporary = await mkdtemp(join(tmpdir(), "hypit-scene-record-"));
  const raw = join(temporary, "native.mp4");
  const encoded = join(temporary, "delivery.mp4");
  try {
    options.progress?.({ phase: "open" });
    const { withCapture } = await import("@hypit/browser-capture");
    const outputs = await withCapture({
      launch: {
        headless: true,
        defaultViewport: { ...options.viewport, deviceScaleFactor: 1 },
        ...(options.browser !== undefined
          ? { executablePath: options.browser }
          : { channel: options.channel ?? "chrome" }),
      },
      timeoutMs: 30_000,
    }, async ({ page, record }) => {
      await page.goto(options.url, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.body.dataset.sceneReady === "true", {
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      await page.evaluate(async () => {
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      const range = await page.evaluate(() => ({
        start: Number(document.body.dataset.sceneCaptureStart ?? "0"),
        end: Number(document.body.dataset.sceneCaptureEnd ?? document.body.dataset.sceneDuration),
      }));
      assert(Number.isFinite(range.start) && range.start >= 0, "Selected Scene export start is invalid");
      assert(Number.isFinite(range.end) && range.end > range.start, "Selected Scene export range is empty");
      options.progress?.({ phase: "record", duration: range.end - range.start });
      options.signal?.throwIfAborted();
      const recording = await record({ path: raw, fps: options.fps });
      await page.evaluate(() => (document.querySelector("[data-preview-play]") as HTMLButtonElement | null)?.click());
      await page.waitForFunction((end) => Number(document.body.dataset.sceneTime) >= end,
        {
          timeout: Math.ceil((range.end - range.start + 5) * 1_000),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        },
        Math.max(range.start, range.end - 1 / 24));
      await page.evaluate(() => (document.querySelector("[data-preview-play]") as HTMLButtonElement | null)?.click());
      await recording.stop();
    });
    assert(outputs.length === 1 && outputs[0]?.kind === "video", "Scene recording did not produce one video");
    options.signal?.throwIfAborted();
    options.progress?.({ phase: "encode" });
    await exec(options.ffmpeg ?? "ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", raw,
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-r", String(options.fps), "-movflags", "+faststart", "-an", encoded,
    ], { signal: options.signal });
    const media = await probeMedia(encoded);
    assert(media.hasVideo, "Encoded Scene recording has no video stream");
    options.signal?.throwIfAborted();
    await mkdir(dirname(options.destination), { recursive: true });
    await copyFile(encoded, options.destination, constants.COPYFILE_EXCL);
    options.progress?.({ phase: "complete" });
    return {
      format: "hypit.scene-record@1",
      path: options.destination,
      width: media.width,
      height: media.height,
      duration: media.duration,
      frameRate: media.frameRate,
      codec: "h264",
      hasAudio: false,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
