import { resolve } from "node:path";
import { parseArgs } from "node:util";

import type { CliIo } from "@hypit/cli";

import { startSceneProjectWorkbench, type WorkbenchCliOptions } from "./cli-command.js";
import { recordSceneOutput } from "./scene-record.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function writeSceneRecordHelp(io: Pick<CliIo, "write">): void {
  io.write(`Usage: hypit scene record <project.scene.json> --to <output.mp4> [options]

Record one Scene Performance through its authored output camera, without Workbench UI.

Options:
  --performance <id>  Performance to record (default: first)
  --viewport <WxH>    Output viewport (default: 1920x1080)
  --fps <number>      Maximum capture rate (default: 30)
  --channel <name>    Installed Puppeteer Chrome channel (default: chrome)
  --browser <path>    Explicit compatible Chrome executable
  --ffmpeg <path>     FFmpeg executable for H.264 delivery (default: ffmpeg)
  --json              Write the machine-readable result
`);
}

function viewport(raw: string | undefined): { readonly width: number; readonly height: number } {
  const match = /^(\d+)x(\d+)$/u.exec(raw ?? "1920x1080");
  assert(match !== null && Number(match[1]) > 0 && Number(match[2]) > 0,
    "--viewport needs positive WIDTHxHEIGHT");
  return { width: Number(match[1]), height: Number(match[2]) };
}

export async function runSceneRecordCli(
  argv: readonly string[],
  io: CliIo,
  cwd: string,
  projectRoot: string,
  workbenchOptions: WorkbenchCliOptions = {},
): Promise<void> {
  if (argv[1] === undefined || argv[1] === "--help" || argv[1] === "help") {
    writeSceneRecordHelp(io);
    return;
  }
  assert(argv[1] === "record", `Unknown scene command ${argv[1]}`);
  const parsed = parseArgs({
    args: argv.slice(2),
    allowPositionals: true,
    options: {
      to: { type: "string" }, performance: { type: "string" }, viewport: { type: "string" },
      fps: { type: "string" }, channel: { type: "string" }, browser: { type: "string" },
      ffmpeg: { type: "string" }, json: { type: "boolean" }, help: { type: "boolean" },
      debug: { type: "boolean" }, verbose: { type: "boolean" },
      "no-color": { type: "boolean" }, color: { type: "string" },
    },
  });
  if (parsed.values.help) { writeSceneRecordHelp(io); return; }
  assert(parsed.positionals.length === 1, "scene record requires exactly one .scene.json file");
  assert(parsed.values.to !== undefined, "scene record requires --to <output.mp4>");
  assert(!parsed.values.browser || !parsed.values.channel, "Choose --browser or --channel");
  const projectFile = resolve(cwd, parsed.positionals[0]!);
  assert(projectFile.endsWith(".scene.json"), "scene record requires a .scene.json file");
  const destination = resolve(cwd, parsed.values.to);
  assert(destination.endsWith(".mp4"), "scene record output must use .mp4");
  const size = viewport(parsed.values.viewport);
  const fps = Number(parsed.values.fps ?? "30");
  assert(Number.isFinite(fps) && fps > 0 && fps <= 120, "--fps must lie above 0 and at most 120");
  const progress = (message: string) => {
    if (io.writeProgress) io.writeProgress(`${message}\n`);
    else if (!parsed.values.json) io.write(`${message}\n`);
  };

  const server = await startSceneProjectWorkbench(projectFile, projectRoot, 0, workbenchOptions);
  try {
    const query = new URLSearchParams({ output: "1" });
    if (parsed.values.performance !== undefined) query.set("performance", parsed.values.performance);
    const url = `${server.sceneUrl}?${query}`;
    progress(`Recording Scene output from ${url}`);
    const media = await recordSceneOutput({
      url,
      destination,
      viewport: size,
      fps,
      ...(parsed.values.browser === undefined ? {} : { browser: resolve(cwd, parsed.values.browser) }),
      ...(parsed.values.browser !== undefined ? {} : { channel: (parsed.values.channel ?? "chrome") as "chrome" }),
      ...(parsed.values.ffmpeg === undefined ? {} : { ffmpeg: parsed.values.ffmpeg }),
      progress(update) {
        if (update.phase === "encode") progress("Encoding H.264 delivery file");
      },
    });
    const result = {
      ...media,
      projectFile,
      ...(parsed.values.performance === undefined ? {} : { performance: parsed.values.performance }),
    };
    if (parsed.values.json) io.write(`${JSON.stringify(result, null, 2)}\n`);
    else io.write(`Scene recording saved: ${destination} (${media.width}×${media.height}, ${media.duration.toFixed(2)}s)\n`);
  } finally {
    await server.close();
  }
}
