import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { CliIo } from "@hypit/cli";
import type { CaptureOptions, CaptureOutput, CaptureScript } from "@hypit/browser-capture";

export function writeCaptureHelp(io: CliIo): void {
  io.write(`Browser capture — save website or local HTML material to project files.

  hypit capture screenshot <url-or-file> --to <image> [options]
  hypit capture run <script.mjs> [browser options] [-- script arguments]
  hypit capture install-browser

Screenshot options:
  --full-page                 Capture the full document
  --selector <selector>       Capture one visible element (Puppeteer selector syntax)
  --clip <x,y,width,height>   Capture a rectangle in CSS pixels
  --transparent              Preserve a transparent page background
  --wait-for <selector>       Wait for a visible element before capture
  --wait-ms <milliseconds>    Additional explicitly chosen delay

Browser options:
  --viewport <width>x<height> CSS viewport size (default: 1280x720)
  --scale <number>            Device pixel ratio (default: 1)
  --channel <name>            Installed Chrome channel, e.g. chrome
  --browser <path>            Explicit browser executable instead of a channel
  --headed                   Show the browser
  --timeout-ms <milliseconds> Page operation and navigation timeout
  --json                     Print all saved files with their actual dimensions

The browser defaults to this package's tested Chrome for Testing revision. Prepare
it once with install-browser, or select a compatible installed browser. Native page
recording requires Chrome 153+ and ffprobe on PATH. A script exports default async ({ page, browser, screenshot,
record, args, log }) => { ... }; optional export const options configures Puppeteer
launch options and ffprobePath. Use page.goto/click/type/evaluate normally, then
screenshot({ path: 'assets/page.png' }) or record({ path: 'assets/demo.mp4' }).
Await recorder.stop() to finish a recording; returning finishes open recordings.
Native recording produces MP4; audio is included when record({ audio: true, ... }).

Outputs refuse to overwrite existing files. Paths are relative to the working
directory. Scripts are ordinary project code executed with Node.js permissions.
`);
}

function numeric(raw: string | undefined, label: string, zero = false): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || (zero ? value < 0 : value <= 0)) {
    throw new Error(`${label} must be ${zero ? "non-negative" : "positive"}`);
  }
  return value;
}

async function sourceUrl(source: string, cwd: string): Promise<string> {
  if (/^https?:\/\//i.test(source) || source.startsWith("file:")) return new URL(source).href;
  const path = resolve(cwd, source);
  if (!(await stat(path)).isFile()) throw new Error(`Not a file: ${path}`);
  return pathToFileURL(path).href;
}

export async function runCaptureCli(argv: readonly string[], io: CliIo, cwd = process.cwd()): Promise<void> {
  const command = argv[1];
  if (command === undefined || command === "--help") { writeCaptureHelp(io); return; }
  if (command !== "screenshot" && command !== "run" && command !== "install-browser") throw new Error(`Unknown capture command ${command}`);
  const separator = argv.indexOf("--");
  const args = separator < 0 ? [] : argv.slice(separator + 1);
  if (command === "screenshot" && args.length > 0) throw new Error("Script arguments belong to capture run");
  const parsed = parseArgs({
    args: (separator < 0 ? argv : argv.slice(0, separator)).slice(2), allowPositionals: true,
    options: {
      viewport: { type: "string" }, scale: { type: "string" }, channel: { type: "string" },
      browser: { type: "string" }, headed: { type: "boolean" }, "timeout-ms": { type: "string" },
      json: { type: "boolean" }, debug: { type: "boolean" }, verbose: { type: "boolean" },
      "no-color": { type: "boolean" }, color: { type: "string" }, help: { type: "boolean" },
      to: { type: "string" }, "full-page": { type: "boolean" },
      selector: { type: "string" }, clip: { type: "string" },
      transparent: { type: "boolean" }, "wait-for": { type: "string" },
      "wait-ms": { type: "string" },
    },
  });
  const values = parsed.values;
  if (values.help) { writeCaptureHelp(io); return; }
  if (command === "install-browser") {
    if (parsed.positionals.length > 0 || args.length > 0) throw new Error("install-browser takes no positional arguments");
    for (const name of Object.keys(values)) {
      if (!["json", "debug", "verbose", "color", "no-color"].includes(name)) throw new Error(`install-browser does not use --${name}`);
    }
    io.writeProgress?.("Preparing the capture browser…\n");
    const { installCaptureBrowser } = await import("@hypit/browser-capture");
    const path = await installCaptureBrowser();
    io.write(values.json ? `${JSON.stringify({ format: "hypit.capture-browser@1", path })}\n` : `Capture browser ready: ${path}\n`);
    return;
  }
  const source = parsed.positionals[0];
  if (source === undefined || parsed.positionals.length !== 1) {
    throw new Error(`capture ${command} needs exactly one ${command === "run" ? "script" : "URL or local file"}`);
  }
  if (values.browser && values.channel) throw new Error("Choose --browser or --channel");
  let options: CaptureOptions = {};
  let script: CaptureScript;
  if (command === "run") {
    for (const name of ["to", "full-page", "selector", "clip", "transparent", "wait-for", "wait-ms"] as const) {
      if (values[name] !== undefined) throw new Error(`--${name} belongs to capture screenshot; use the script for capture run`);
    }
    const loaded = await import(pathToFileURL(resolve(cwd, source)).href) as {
      options?: CaptureOptions; default?: CaptureScript;
    };
    if (typeof loaded.default !== "function") throw new Error("Capture script must export a default async function");
    options = loaded.options ?? {};
    script = loaded.default;
  } else {
    if (!values.to) throw new Error("capture screenshot requires --to <image>");
    const modes = [values["full-page"], values.selector, values.clip].filter(Boolean);
    if (modes.length > 1) throw new Error("Choose --full-page, --selector or --clip");
    let clip: { x: number; y: number; width: number; height: number } | undefined;
    if (values.clip) {
      const [x, y, width, height, extra] = values.clip.split(",").map(Number);
      if (extra !== undefined || [x, y, width, height].some((n) => n === undefined || !Number.isFinite(n))
        || x! < 0 || y! < 0 || width! <= 0 || height! <= 0) {
        throw new Error("--clip needs x,y,width,height with non-negative coordinates and positive dimensions");
      }
      clip = { x: x!, y: y!, width: width!, height: height! };
    }
    const url = await sourceUrl(source, cwd);
    const path = resolve(cwd, values.to);
    const waitMs = numeric(values["wait-ms"], "--wait-ms", true);
    script = async ({ page, screenshot }) => {
      const response = await page.goto(url, { waitUntil: "load" });
      if (response && !response.ok()) throw new Error(`Page returned HTTP ${response.status()}: ${page.url()}`);
      if (values["wait-for"]) await page.waitForSelector(values["wait-for"], { visible: true });
      if (waitMs) await new Promise((done) => setTimeout(done, waitMs));
      await screenshot({ path,
        ...(values["full-page"] ? { fullPage: true } : {}),
        ...(values.selector ? { selector: values.selector } : {}),
        ...(clip ? { clip } : {}),
        ...(values.transparent ? { omitBackground: true } : {}),
      });
    };
  }
  const launch = { ...options.launch };
  if (values.browser) { launch.executablePath = resolve(cwd, values.browser); delete launch.channel; }
  if (values.channel) {
    if (!["chrome", "chrome-beta", "chrome-canary", "chrome-dev"].includes(values.channel)) {
      throw new Error("--channel must name a Puppeteer Chrome channel: chrome, chrome-beta, chrome-canary or chrome-dev");
    }
    launch.channel = values.channel as NonNullable<typeof launch.channel>;
    delete launch.executablePath;
  }
  if (values.headed) launch.headless = false;
  if (values.viewport || values.scale) {
    const viewport = { width: 1280, height: 720, deviceScaleFactor: 1, ...launch.defaultViewport };
    if (values.viewport) {
      const match = /^(\d+)x(\d+)$/.exec(values.viewport);
      if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) throw new Error("--viewport needs positive WIDTHxHEIGHT");
      viewport.width = Number(match[1]); viewport.height = Number(match[2]);
    }
    viewport.deviceScaleFactor = numeric(values.scale, "--scale") ?? viewport.deviceScaleFactor;
    launch.defaultViewport = viewport;
  }
  const timeoutMs = numeric(values["timeout-ms"], "--timeout-ms", true) ?? options.timeoutMs;
  const progress = (text: string) => {
    if (io.writeProgress) io.writeProgress(`${text}\n`);
    else if (!values.json) io.write(`${text}\n`);
  };
  const show = (output: CaptureOutput) => progress(`Saved ${output.path} (${output.width}×${output.height}${
    output.duration === undefined ? "" : `, ${output.duration.toFixed(2)}s`})`);
  // Loading the browser library is specific to capture; ordinary Hypit commands do not load it.
  const { withCapture } = await import("@hypit/browser-capture");
  const outputs = await withCapture({ ...options, launch, ...(timeoutMs === undefined ? {} : { timeoutMs }) },
    async (session) => await script({ ...session, args, log: progress }), show);
  if (values.json) io.write(`${JSON.stringify({ format: "hypit.capture@1", outputs }, null, 2)}\n`);
  else io.write(`Capture complete: ${outputs.length} file${outputs.length === 1 ? "" : "s"}.\n`);
}
