import { execFile } from "node:child_process";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Writable } from "node:stream";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import type { Browser, LaunchOptions, Page, RecordOptions, ScreenshotOptions } from "puppeteer-core";
import sharp from "sharp";
import { captureBrowserExecutablePath } from "./browser.js";
export { captureBrowserExecutablePath, installCaptureBrowser } from "./browser.js";

export type CaptureOptions = {
  /** Ordinary Puppeteer launch options, including channel, executablePath and defaultViewport. */
  readonly launch?: LaunchOptions;
  /** Page operation and navigation timeout; Puppeteer's default applies when omitted. */
  readonly timeoutMs?: number;
  /** Used to read the actual dimensions and duration after a recording finishes. */
  readonly ffprobePath?: string;
};

export type CaptureOutput = {
  readonly kind: "image" | "video";
  readonly path: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly duration?: number;
  readonly frameRate?: number;
  readonly hasAudio?: boolean;
};

export type ScreenshotCaptureOptions = Omit<ScreenshotOptions, "path" | "encoding"> & {
  readonly path: string;
  readonly selector?: string;
};

export type RecordingCaptureOptions = Omit<RecordOptions, "path" | "overwrite"> & {
  readonly path: string;
};

export type CaptureRecording = { stop(): Promise<CaptureOutput> };

export type CaptureSession = {
  readonly browser: Browser;
  readonly page: Page;
  /** Capture the default page, or a page created by the script in this browser. */
  screenshot(options: ScreenshotCaptureOptions, page?: Page): Promise<CaptureOutput>;
  /** Record page changes through Chrome's native recorder; audio is opt-in. */
  record(options: RecordingCaptureOptions, page?: Page): Promise<CaptureRecording>;
};

export type CaptureScriptContext = CaptureSession & {
  readonly args: readonly string[];
  log(message: string): void;
};

export type CaptureScript = (context: CaptureScriptContext) => Promise<void>;

async function reserve(path: string) {
  await mkdir(dirname(path), { recursive: true });
  try { return await open(path, "wx"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Destination ${path} already exists`, { cause: error });
    }
    throw error;
  }
}

const exec = promisify(execFile);
async function recordingInfo(path: string, ffprobe: string): Promise<Omit<CaptureOutput, "kind" | "path" | "url">> {
  const { stdout } = await exec(ffprobe, ["-v", "error", "-show_entries",
    "format=format_name,duration:stream=codec_type,width,height,avg_frame_rate", "-of", "json", path]);
  const data = JSON.parse(stdout) as {
    format?: { format_name?: string; duration?: string };
    streams?: { codec_type?: string; width?: number; height?: number; avg_frame_rate?: string }[];
  };
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const [num, den = "1"] = (video?.avg_frame_rate ?? "0").split("/");
  const rate = Number(num) / Number(den);
  const duration = Number(data.format?.duration);
  if (!video?.width || !video.height || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Recording ${path} has no readable video duration or dimensions`);
  }
  return { width: video.width, height: video.height, duration,
    format: data.format?.format_name ?? "unknown", hasAudio: data.streams?.some((s) => s.codec_type === "audio") ?? false,
    ...(Number.isFinite(rate) && rate > 0 ? { frameRate: rate } : {}) };
}

/**
 * One browser for an authored capture task. The callback uses ordinary Puppeteer objects;
 * no website interpretation, Runtime, Build, or Source graph participates here.
 */
export async function withCapture(
  options: CaptureOptions,
  task: (session: CaptureSession) => Promise<void>,
  onOutput?: (output: CaptureOutput) => void,
): Promise<readonly CaptureOutput[]> {
  const launch = { ...options.launch };
  if (!launch.channel && !launch.executablePath) {
    launch.executablePath = await captureBrowserExecutablePath();
    if (!existsSync(launch.executablePath)) throw new Error(
      `Capture browser is not installed at ${launch.executablePath}. Run hypit capture install-browser, or select an installed compatible browser.`);
  }
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    ...launch,
  });
  const outputs: CaptureOutput[] = [];
  const recordings = new Set<CaptureRecording>();
  const publish = (output: CaptureOutput): CaptureOutput => {
    outputs.push(output);
    onOutput?.(output);
    return output;
  };
  try {
    const page = await browser.newPage();
    if (options.timeoutMs !== undefined) {
      page.setDefaultTimeout(options.timeoutMs);
      page.setDefaultNavigationTimeout(options.timeoutMs);
    }
    await task({
      browser, page,
      async screenshot(input, target = page) {
        const { path: destination, selector, ...screenshotOptions } = input;
        if (selector !== undefined && (input.fullPage || input.clip !== undefined)) {
          throw new Error("Choose a selector, a clip, or the full page for a screenshot");
        }
        const path = resolve(destination);
        const handle = await reserve(path);
        await handle.close();
        try {
          if (selector === undefined) {
            await target.screenshot({ ...screenshotOptions, path });
          } else {
            const element = await target.waitForSelector(selector, { visible: true });
            if (element === null) throw new Error(`No visible element matches ${selector}`);
            try { await element.screenshot({ ...screenshotOptions, path }); }
            finally { await element.dispose(); }
          }
          const info = await sharp(path).metadata();
          return publish({ kind: "image", path, url: target.url(), width: info.width, height: info.height,
            format: info.format });
        } catch (error) {
          await rm(path, { force: true });
          throw error;
        }
      },
      async record(input, target = page) {
        const { path: destination, ...recordOptions } = input;
        const path = resolve(destination);
        await exec(options.ffprobePath ?? "ffprobe", ["-version"]);
        const pixels = await target.evaluate(() => ({
          maxWidth: Math.round(window.innerWidth * window.devicePixelRatio),
          maxHeight: Math.round(window.innerHeight * window.devicePixelRatio),
        }));
        const file = await reserve(path);
        let native: Awaited<ReturnType<Page["record"]>>;
        try { native = await target.record({ ...pixels, ...recordOptions }); }
        catch (error) {
          await file.close(); await rm(path, { force: true });
          throw new Error(`Could not start native recording in ${await browser.version()}. `
            + `Page recording requires Chrome 153 or later: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
        const url = target.url();
        // Own the output stream so stop() also waits for the file to finish writing.
        const written = native.pipeTo(Writable.toWeb(file.createWriteStream()));
        void written.catch(() => {});
        let stopped: Promise<CaptureOutput> | undefined;
        const recording: CaptureRecording = {
          stop() {
            stopped ??= (async () => {
              try {
                await native.stop();
                await written;
                return publish({ kind: "video", path, url,
                  ...await recordingInfo(path, options.ffprobePath ?? "ffprobe") });
              } catch (error) {
                await rm(path, { force: true });
                throw error;
              } finally { recordings.delete(recording); }
            })();
            return stopped;
          },
        };
        recordings.add(recording);
        return recording;
      },
    });
    await Promise.all([...recordings].map((recording) => recording.stop()));
    return outputs;
  } finally {
    try { await Promise.allSettled([...recordings].map((recording) => recording.stop())); }
    finally { await browser.close(); }
  }
}
