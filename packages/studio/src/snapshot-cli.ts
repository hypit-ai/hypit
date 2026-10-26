import { mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  cliEndpointLine,
  cliEndpointView,
  createCliScratchResources,
  openCliRuntimeHost,
  selectCliEndpoint,
} from "@hypit/hypit/cli";
import type { CliIo, CliRuntimeSelectionContext } from "@hypit/hypit/cli";
import { assertHtmlProgram, selectHtmlArtifacts } from "@hypit/html-program";
import type { HtmlFrameRequest, HtmlProgram } from "@hypit/html-program";
import { htmlFrameRequest, htmlProgramCapabilities, htmlProgramTypes, verifyHtmlFrameImagesForRequest } from "@hypit/html-program";
import type { Need } from "@hypit/hypit/protocol";
import { snapshotFrameAnnotation, writeFrameGrid } from "@hypit/media-local/files";

const OPTIONS = ["--studio", "--to", "--at-frame", "--start-frame", "--end-frame-exclusive", "--step-frames", "--grid", "--cell", "--runtime", "--project"];

/** `--studio` is a base URL, not a host:port token. `new URL` otherwise throws TypeError. */
export function studioDocumentUrl(studio: string): string {
  try {
    const base = new URL(studio);
    if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("unsupported protocol");
    return new URL("/__studio/document", base).href;
  } catch {
    throw new Error(`--studio needs an http(s) Studio URL, got ${studio}`);
  }
}

export function writeSnapshotHelp(io: CliIo): void {
  io.write(`hypit snapshot\nCapture exact frames from Studio's current compiled HTML Program through the selected Runtime Profile.\n\n`
    + `  hypit snapshot --studio <studio-url> --at-frame <n[,n,…]> --to <directory>\n`
    + `  hypit snapshot --studio <studio-url> --start-frame <n> --end-frame-exclusive <n> [--step-frames <n>] --to <directory>\n`
    + `      [--grid <columns>x<rows>] [--cell <pixels>] [--runtime <profile>] [--project <directory>] [--json]\n\n`
    + `Frame indices are zero-based on the current HtmlProgram clock. Ranges exclude the end.\n`
    + `Writes full-size PNGs and optional paginated grids. --cell controls grid image width (default 480).\n`
    + `Uses rasterize-frames in one immediate request. Browser preparation belongs to the selected Provider.\n`
    + `Studio supplies the typed HTML Program and its declared Artifacts; raw HTML is not reverse-compiled.\n`);
}

export async function runSnapshotCli(argv: readonly string[], io: CliIo, application: CliRuntimeSelectionContext): Promise<void> {
  if (argv.includes("--help")) { writeSnapshotHelp(io); return; }
  const options = new Map<string, string>();
  const positionals = [];
  const json = argv.includes("--json");
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index]!;
    if (["--json", "--debug", "--verbose", "--no-color"].includes(arg)) continue;
    if (arg === "--color") { index++; continue; }
    if (!arg.startsWith("--")) { positionals.push(arg); continue; }
    if (!OPTIONS.includes(arg)) throw new Error(`Unknown snapshot option ${arg}`);
    if (options.has(arg)) throw new Error(`${arg} cannot be repeated`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    options.set(arg, value);
  }
  const studio = options.get("--studio");
  if (positionals.length !== 0 || studio === undefined || !options.has("--to")) throw new Error("snapshot requires --studio <url> and --to <directory>");
  const integer = (raw: string | undefined, label: string, minimum = 0): number => {
    if (raw === undefined || !/^\d+$/u.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < minimum) throw new Error(`${label} needs an integer >= ${minimum}`);
    return Number(raw);
  };
  const source = studioDocumentUrl(studio);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Studio HtmlProgram: HTTP ${response.status} ${await response.text()}`);
  const document = await response.json() as HtmlProgram;
  assertHtmlProgram(document);
  const explicit = options.get("--at-frame");
  let frames: number[];
  if (explicit !== undefined) {
    if (["--start-frame", "--end-frame-exclusive", "--step-frames"].some(key => options.has(key))) throw new Error("Choose --at-frame or a frame range");
    frames = explicit.split(",").map(value => integer(value, "--at-frame"));
  } else {
    const start = integer(options.get("--start-frame"), "--start-frame");
    const end = integer(options.get("--end-frame-exclusive"), "--end-frame-exclusive");
    const step = integer(options.get("--step-frames") ?? "1", "--step-frames", 1);
    if (end <= start || end > document.frameCount) throw new Error(`The frame range must satisfy 0 <= start < end <= ${document.frameCount}`);
    frames = Array.from({ length: Math.ceil((end - start) / step) }, (_, index) => start + index * step);
  }
  const grid = options.get("--grid")?.split("x");
  if (grid !== undefined && grid.length !== 2) throw new Error("--grid needs columns x rows, for example 4x3");
  const columns = grid === undefined ? undefined : integer(grid[0], "grid columns", 1);
  const rows = grid === undefined ? undefined : integer(grid[1], "grid rows", 1);
  if (options.has("--cell") && grid === undefined) throw new Error("--cell requires --grid");
  const cell = integer(options.get("--cell") ?? "480", "--cell", 32);
  const to = resolve(application.cwd, options.get("--to")!);
  if (await stat(to).then(() => true, () => false)) throw new Error(`Destination ${to} already exists`);
  let staging: string | undefined;
  try {
    const resources = createCliScratchResources();
    const selection = frames.map((frame) => ({ startFrame: frame, endFrameExclusive: frame + 1 }));
    for (const { artifact } of selectHtmlArtifacts(document, selection)) {
      const response = await fetch(new URL(`/__studio/material/${artifact.resource}`, studio));
      if (!response.ok) throw new Error(`Studio material ${artifact.resource}: HTTP ${response.status}`);
      await resources.write(artifact, new Uint8Array(await response.arrayBuffer()));
    }
    const request: HtmlFrameRequest = {
      program: document,
      picture: {
        colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
        colorRange: "full", bitDepth: 8,
        alpha: { mode: "opaque", matte: "#000000" },
      },
      frames,
    };
    const need: Need = { id: "need:hypit-snapshot", capability: htmlProgramCapabilities.rasterizeFrames,
      returns: htmlProgramTypes.frameImages, result: "record:hypit-snapshot", constraints: htmlFrameRequest(request) };
    const { host, profile } = await openCliRuntimeHost(application, options.get("--runtime"), options.get("--project"));
    const endpoint = await selectCliEndpoint(host, need, profile);
    if (!json) io.write(`Capturing ${frames.length} frames through ${cliEndpointLine(endpoint)}\n`);
    const report = json ? io.writeProgress : io.writeProgress ?? io.write;
    const fulfilled = await host.invoke(need, resources, {
      reportProgress: async progress => { report?.(`  · ${progress.phase}\n`); },
      reportDiagnostic: async diagnostic => { report?.(`  · ${diagnostic.message}\n`); },
    });
    verifyHtmlFrameImagesForRequest(fulfilled, request);
    const images = fulfilled;
    if (images.frames.length !== frames.length) {
      throw new Error(`Requested ${frames.length} frames, received ${images.frames.length}`);
    }
    await mkdir(dirname(to), { recursive: true });
    staging = await mkdtemp(join(dirname(to), ".hypit-snapshot-"));
    const files = [];
    for (const [index, image] of images.frames.entries()) {
      const frame = frames[index]!;
      if (image.frame !== frame) throw new Error(`Requested frame ${frame}, received frame ${image.frame}`);
      const name = `frame-${String(frame).padStart(9, "0")}.png`;
      const bytes = await resources.get(image.artifact.resource);
      if (bytes === undefined) throw new Error(`Snapshot frame ${frame} is unavailable`);
      await writeFile(join(staging, name), bytes, { flag: "wx" });
      files.push({ frame, seconds: frame * document.frameRate.denominator / document.frameRate.numerator, path: join(to, name) });
    }
    const grids: string[] = [];
    if (columns !== undefined && rows !== undefined) {
      const count = columns * rows;
      for (let offset = 0; offset < files.length; offset += count) {
        const page = [];
        for (const file of files.slice(offset, offset + count)) page.push({ path: join(staging, `frame-${String(file.frame).padStart(9, "0")}.png`),
          annotation: await snapshotFrameAnnotation(file.frame, file.seconds, cell) });
        const name = `grid-${String(grids.length + 1).padStart(3, "0")}.jpg`;
        await writeFrameGrid(page, join(staging, name), cell, columns);
        grids.push(join(to, name));
      }
    }
    await rename(staging, to);
    staging = undefined;
    if (json) io.write(`${JSON.stringify({ format: "hypit.studio-snapshot@1", source, ...cliEndpointView(endpoint), frames: files, grids }, null, 2)}\n`);
    else io.write(`Captured ${files.length} PNGs${grids.length === 0 ? "" : ` and ${grids.length} grid${grids.length === 1 ? "" : "s"}`}\n  ${to}\n`);
  } finally {
    if (staging !== undefined) await rm(staging, { recursive: true, force: true });
  }
}
