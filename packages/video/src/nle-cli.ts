import { dirname, resolve } from "node:path";

import type { CliIo } from "@hypit/hypit/cli";
import { exportLocalNleProject } from "./nle-export-local.js";
import type { LocalNleExportProgress } from "./nle-export-local.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function writeNleHelp(io: Pick<CliIo, "write">): void {
  io.write("Usage: hypit nle export <project.nle.json> --to <output.mp4> [options]\n\n"
    + "Export one complete NLE project through AVIR, HTML/Audio programmes and local MP4 delivery.\n\n"
    + "Options:\n"
    + "  --to <file>             New .mp4 file to create (required; never overwrites)\n"
    + "  --quality <quality>     draft | standard | high (default: standard)\n"
    + "  --package-root <path>   Resolve project component packages here (default: NLE directory)\n"
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

export async function runNleCli(
  argv: readonly string[],
  io: CliIo,
  cwd: string,
  distributionPackageRoot?: string,
): Promise<void> {
  if (argv[1] === "--help" || argv[1] === "help" || argv.length < 2) {
    writeNleHelp(io);
    return;
  }
  assert(argv[1] === "export", `Unknown nle command ${argv[1] ?? "<missing>"}`);
  const positionals: string[] = [];
  const options = new Map<string, string>();
  let json = false;
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (item === "--json") { json = true; continue; }
    if (["--debug", "--verbose", "--no-color"].includes(item)) continue;
    if (item === "--color") { index += 1; continue; }
    if (!item.startsWith("--")) { positionals.push(item); continue; }
    assert(["--to", "--quality", "--package-root", "--workers"].includes(item), `Unknown option ${item}`);
    assert(!options.has(item), `${item} cannot be repeated`);
    const value = argv[index + 1];
    assert(value !== undefined && !value.startsWith("--"), `${item} requires a value`);
    options.set(item, value);
    index += 1;
  }
  assert(positionals.length === 1, "nle export requires exactly one .nle.json project file");
  const to = options.get("--to");
  assert(to !== undefined, "--to is required: name the new .mp4 output file");
  const quality = options.get("--quality") ?? "standard";
  assert(["draft", "standard", "high"].includes(quality), "--quality must be draft, standard or high");

  const projectFile = resolve(cwd, positionals[0]!);
  const outputFile = resolve(cwd, to);
  const packageRoot = resolve(cwd, options.get("--package-root") ?? dirname(projectFile));
  const renderWorkers = workers(options.get("--workers"));
  const controller = new AbortController();
  const abort = (): void => controller.abort(new Error("NLE export was interrupted."));
  process.once("SIGINT", abort);
  try {
    const result = await exportLocalNleProject({
      projectFile,
      outputFile,
      packageRoot,
      ...(distributionPackageRoot === undefined ? {} : { distributionPackageRoot }),
      quality: quality as "draft" | "standard" | "high",
      signal: controller.signal,
      html: {
        ...(renderWorkers === undefined ? {} : { workers: renderWorkers }),
      },
      onProgress(progress) {
        if (json) return;
        const line = progressLine(progress);
        if (line !== undefined) io.writeProgress?.(`${line}\n`);
      },
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
