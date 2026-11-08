import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { CliCommandModule, CliIo } from "@hypit/cli";
import { probeMedia } from "@hypit/media-file-local";

import { downloadVideo, isVideoUrl } from "./download.js";
import { prepareVideoDownload } from "./environment.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Parsed = {
  readonly positionals: readonly string[];
  readonly to?: string;
  readonly json: boolean;
};

function parse(argv: readonly string[]): Parsed {
  const positionals: string[] = [];
  let to: string | undefined;
  let json = false;
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (item === "--json") { json = true; continue; }
    if (["--debug", "--verbose", "--no-color"].includes(item)) continue;
    if (item === "--color") { index += 1; continue; }
    if (item === "--to") {
      assert(to === undefined, "--to cannot be repeated");
      const value = argv[++index];
      assert(value !== undefined && !value.startsWith("--"), "--to requires a destination file");
      to = value;
      continue;
    }
    assert(!item.startsWith("--"), `unknown download option ${item}`);
    positionals.push(item);
  }
  return { positionals, ...(to === undefined ? {} : { to }), json };
}

export function writeDownloadHelp(io: CliIo): void {
  io.write("hypit download\nAcquire one network video through the pinned yt-dlp environment.\n\n"
    + "  hypit download <http-or-https-url> --to <video.mp4>\n"
    + "  hypit download prepare\n\n"
    + "Preparation installs the package's locked environment explicitly. Download never prepares, updates,\n"
    + "overwrites an existing destination or creates Runtime/Build state. Add --json for the machine view.\n");
}

export async function runDownloadCli(argv: readonly string[], io: CliIo, cwd = process.cwd()): Promise<void> {
  if (argv[1] === undefined || argv.includes("--help")) { writeDownloadHelp(io); return; }
  const parsed = parse(argv);
  if (parsed.positionals[0] === "prepare") {
    assert(parsed.positionals.length === 1 && parsed.to === undefined, "download prepare takes no URL or --to");
    io.writeProgress?.("Preparing the selected yt-dlp environment…\n");
    const executable = prepareVideoDownload();
    io.write(parsed.json ? `${JSON.stringify({ executable })}\n` : `yt-dlp ready: ${executable}\n`);
    return;
  }

  const [url] = parsed.positionals;
  assert(url !== undefined && isVideoUrl(url), "download needs one http or https URL");
  assert(parsed.positionals.length === 1, "download takes exactly one URL");
  assert(parsed.to !== undefined, "download requires --to <video.mp4>");
  const target = resolve(cwd, parsed.to);
  assert(!(await stat(target).then(() => true, () => false)), `Destination ${target} already exists`);
  await mkdir(dirname(target), { recursive: true });
  await downloadVideo(url, target);
  const info = await probeMedia(target);
  assert(info.hasVideo, `${target}: downloaded media has no video stream`);
  if (parsed.json) {
    io.write(`${JSON.stringify({ path: target, url, ...info }, null, 2)}\n`);
    return;
  }
  io.write(`${target}\n  ${info.duration} s  ${info.width}×${info.height}  ${info.hasAudio ? "with audio" : "no audio"}\n`);
}

export const cliCommandModules = [{
  format: "hypit.cli-command@1",
  id: "@hypit/yt-dlp",
  commands: ["download"],
  writeRootHelp(io) { io.write("\nNetwork media\n  download\n  hypit download --help for preparation and destination options\n"); },
  writeHelp(_argv, io) { writeDownloadHelp(io); },
  async run(argv, io, context) { await runDownloadCli(argv, io, context.cwd); },
}] as const satisfies readonly CliCommandModule[];
