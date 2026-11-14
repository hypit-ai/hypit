/** Terminal presentation for the local NLE file exporter owned by this package. */
import { resolve } from "node:path";

import type { CliIo } from "@hypit/cli/public";
import { captureLocalNleFrames, exportLocalNleProject, reviewLocalNleProject } from "./index.js";
import type { LocalNleExportProgress } from "./index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function writeNleHelp(io: Pick<CliIo, "write">): void {
  io.write("Usage:\n"
    + "  hypit nle export <project.nle.json> --to <output.mp4> [options]\n"
    + "  hypit nle frames <project.nle.json> --at-frame <n[,n,…]> --to <directory> [options]\n"
    + "  hypit nle frames <project.nle.json> --start-frame <n> --end-frame-exclusive <n> [--step-frames <n>] --to <directory> [options]\n"
    + "  hypit nle review <project.nle.json> --start-frame <n> --end-frame-exclusive <n> --at-frame <n[,n,…]> --to <directory> [options]\n\n"
    + "Deliver a complete or focused MP4, capture sparse absolute Programme frames, or derive both from one focused Programme.\n\n"
    + "Options:\n"
    + "  --to <path>             New .mp4 file or output directory (required; never overwrites)\n"
    + "  --quality <quality>     draft | standard | high (default: standard)\n"
    + "  --picture-target <name> html | gpu-composition (default: html)\n"
    + "  --frame-rate <rate>     Output fps, e.g. 60 or 30000/1001 (default: 30)\n"
    + "  --resolution <WxH>      Same-aspect output pixels, e.g. 1920x1080 (default: project extent)\n"
    + "  --start-frame <n>       First absolute output frame in a focused interval\n"
    + "  --end-frame-exclusive <n>  Exclusive last frame in a focused interval\n"
    + "  --at-frame <n[,n,…]>   Absolute Programme frames to capture\n"
    + "  --step-frames <n>      Frame capture interval for a selected range (default: 1)\n"
    + "  --package-root <path>   Resolve project component packages here (default: Project Root)\n"
    + "  --chrome-path <path>    Use this installed Chrome/Chromium executable\n"
    + "  --ffmpeg-path <path>    Use this FFmpeg executable\n"
    + "  --ffprobe-path <path>   Use this FFprobe executable\n"
    + "  --workers <count|auto>  Chromium picture-render workers\n"
    + "  --json                  Write one machine-readable result\n");
}

function progressLine(progress: LocalNleExportProgress): string | undefined {
  if (progress.phase === "media") return `media ${progress.completed}/${progress.total}`;
  if (progress.phase === "picture" && progress.detail !== undefined) {
    if (progress.detail.phase === "decoding") {
      return `picture decoding ${progress.detail.completed}/${progress.detail.total}`;
    }
    if (progress.detail.phase === "worker-progress") {
      return `picture worker ${progress.detail.worker}: ${progress.detail.completed} frames`;
    }
    if (progress.detail.phase === "complete") return `picture ${progress.detail.frames} frames complete`;
    return undefined;
  }
  if (progress.phase === "complete") return undefined;
  return progress.state === "start" ? `${progress.phase}…` : `${progress.phase} complete`;
}

function workers(raw: string | undefined): number | "auto" | undefined {
  if (raw === undefined) return undefined;
  if (raw === "auto") return raw;
  const value = Number(raw);
  assert(Number.isSafeInteger(value) && value > 0, "--workers must be auto or a positive integer");
  return value;
}

function frameRate(raw: string | undefined): { readonly numerator: number; readonly denominator: number } | undefined {
  if (raw === undefined) return undefined;
  const match = /^(\d+)(?:\/(\d+))?$/u.exec(raw);
  assert(match !== null, "--frame-rate must be a positive integer or rational such as 30000/1001");
  const numerator = Number(match[1]);
  const denominator = Number(match[2] ?? "1");
  assert(Number.isSafeInteger(numerator) && numerator > 0
    && Number.isSafeInteger(denominator) && denominator > 0,
  "--frame-rate must contain positive safe integers");
  return { numerator, denominator };
}

function resolution(raw: string | undefined): { readonly width: number; readonly height: number } | undefined {
  if (raw === undefined) return undefined;
  const match = /^(\d+)[x×](\d+)$/iu.exec(raw);
  assert(match !== null, "--resolution must use WIDTHxHEIGHT, such as 1920x1080");
  const width = Number(match[1]);
  const height = Number(match[2]);
  assert(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0,
    "--resolution dimensions must be positive safe integers");
  return { width, height };
}

export async function runNleCli(
  argv: readonly string[],
  io: CliIo,
  cwd: string,
  projectRoot: string,
  distributionPackageRoot?: string,
): Promise<void> {
  if (argv[1] === "--help" || argv[1] === "help" || argv.length < 2) {
    writeNleHelp(io);
    return;
  }
  const command = argv[1];
  assert(command === "export" || command === "frames" || command === "review",
    `Unknown nle command ${command ?? "<missing>"}`);
  const positionals: string[] = [];
  const options = new Map<string, string>();
  let json = false;
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (item === "--json") { json = true; continue; }
    if (["--debug", "--verbose", "--no-color"].includes(item)) continue;
    if (item === "--color") { index += 1; continue; }
    if (!item.startsWith("--")) { positionals.push(item); continue; }
    assert(["--to", "--quality", "--picture-target", "--frame-rate", "--resolution", "--start-frame",
      "--end-frame-exclusive", "--at-frame", "--step-frames", "--package-root", "--chrome-path",
      "--ffmpeg-path", "--ffprobe-path", "--workers"].includes(item), `Unknown option ${item}`);
    assert(!options.has(item), `${item} cannot be repeated`);
    const value = argv[index + 1];
    assert(value !== undefined && !value.startsWith("--"), `${item} requires a value`);
    options.set(item, value);
    index += 1;
  }
  assert(positionals.length === 1, `nle ${command} requires exactly one .nle.json project file`);
  const to = options.get("--to");
  assert(to !== undefined, "--to is required");
  const quality = options.get("--quality") ?? "standard";
  assert(["draft", "standard", "high"].includes(quality), "--quality must be draft, standard or high");
  const pictureTarget = options.get("--picture-target") ?? "html";
  assert(pictureTarget === "html" || pictureTarget === "gpu-composition",
    "--picture-target must be html or gpu-composition");

  const projectFile = resolve(cwd, positionals[0]!);
  const destination = resolve(cwd, to);
  const packageRoot = resolve(cwd, options.get("--package-root") ?? projectRoot);
  const renderWorkers = workers(options.get("--workers"));
  const outputFrameRate = frameRate(options.get("--frame-rate"));
  const outputResolution = resolution(options.get("--resolution"));
  const startFrame = options.get("--start-frame");
  const endFrameExclusive = options.get("--end-frame-exclusive");
  assert((startFrame === undefined) === (endFrameExclusive === undefined),
    "--start-frame and --end-frame-exclusive must be supplied together");
  const range = startFrame === undefined ? undefined : {
    startFrame: Number(startFrame),
    endFrameExclusive: Number(endFrameExclusive),
  };
  if (range !== undefined) {
    assert(/^\d+$/u.test(startFrame!) && /^\d+$/u.test(endFrameExclusive!)
      && Number.isSafeInteger(range.startFrame) && Number.isSafeInteger(range.endFrameExclusive)
      && range.endFrameExclusive > range.startFrame,
    "frame range must satisfy 0 <= start-frame < end-frame-exclusive");
  }
  const explicitFrames = options.get("--at-frame");
  assert(command !== "export" || (explicitFrames === undefined && options.get("--step-frames") === undefined),
    "--at-frame and --step-frames do not belong to nle export");
  assert(command !== "review" || options.get("--step-frames") === undefined,
    "nle review requires explicit --at-frame evidence; --step-frames belongs to nle frames");
  let frames: number[] | undefined;
  if (command === "frames" || command === "review") {
    if (command === "review") {
      assert(explicitFrames !== undefined && range !== undefined,
        "nle review requires --start-frame, --end-frame-exclusive and --at-frame");
    }
    if (command === "frames") {
      assert((explicitFrames === undefined) !== (range === undefined),
        "nle frames requires either --at-frame or a start/end frame range");
    }
    if (explicitFrames !== undefined) {
      assert(options.get("--step-frames") === undefined,
        "--step-frames cannot be combined with --at-frame");
      frames = explicitFrames.split(",").map(value => Number(value));
      assert(frames.length > 0 && frames.every((value, index) => /^\d+$/u.test(explicitFrames.split(",")[index]!)
        && Number.isSafeInteger(value) && value >= 0 && (index === 0 || value > frames![index - 1]!)),
      "--at-frame must contain strictly increasing non-negative integers");
    } else {
      const step = Number(options.get("--step-frames") ?? "1");
      assert(/^\d+$/u.test(options.get("--step-frames") ?? "1") && Number.isSafeInteger(step) && step > 0,
        "--step-frames must be a positive integer");
      frames = Array.from({ length: Math.ceil((range!.endFrameExclusive - range!.startFrame) / step) },
        (_, index) => range!.startFrame + index * step);
    }
  }
  const controller = new AbortController();
  const abort = (): void => controller.abort(new Error("NLE export was interrupted."));
  process.once("SIGINT", abort);
  try {
    const common = {
      projectRoot,
      projectFile,
      packageRoot,
      ...(distributionPackageRoot === undefined ? {} : { distributionPackageRoot }),
      quality: quality as "draft" | "standard" | "high",
      pictureTarget,
      ...(outputFrameRate === undefined ? {} : { frameRate: outputFrameRate }),
      ...(outputResolution === undefined ? {} : { resolution: outputResolution }),
      signal: controller.signal,
      html: {
        ...(renderWorkers === undefined ? {} : { workers: renderWorkers }),
        ...(options.get("--chrome-path") === undefined ? {} : {
          chromePath: resolve(cwd, options.get("--chrome-path")!),
        }),
      },
      media: {
        ...(options.get("--ffmpeg-path") === undefined ? {} : {
          ffmpegPath: resolve(cwd, options.get("--ffmpeg-path")!),
        }),
        ...(options.get("--ffprobe-path") === undefined ? {} : {
          ffprobePath: resolve(cwd, options.get("--ffprobe-path")!),
        }),
      },
      onProgress(progress: LocalNleExportProgress) {
        if (json) return;
        const line = progressLine(progress);
        if (line !== undefined) io.writeProgress?.(`${line}\n`);
      },
    } as const;
    if (command === "frames") {
      const result = await captureLocalNleFrames({ ...common, frames: frames!, toDirectory: destination });
      if (json) io.write(`${JSON.stringify({ format: "hypit.nle-frames@1", ok: true, ...result })}\n`);
      else io.write(`Captured ${result.frames.length} PNGs to ${destination}\n`);
      return;
    }
    if (command === "review") {
      const result = await reviewLocalNleProject({
        ...common,
        range: range!,
        frames: frames!,
        toDirectory: destination,
      });
      if (json) io.write(`${JSON.stringify({ format: "hypit.nle-review@1", ok: true, ...result })}\n`);
      else io.write(`Prepared ${result.reviewFrameCount} review frames and ${result.frames.length} PNGs in ${destination}\n`);
      return;
    }
    const result = await exportLocalNleProject({
      ...common,
      outputFile: destination,
      ...(range === undefined ? {} : { range }),
    });
    if (json) {
      io.write(`${JSON.stringify({ format: "hypit.nle-export@1", ok: true, ...result })}\n`);
    } else {
      io.write(`Exported ${result.frameCount} frames to ${result.outputFile}\n`);
    }
  } finally {
    process.removeListener("SIGINT", abort);
  }
}
