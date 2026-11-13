import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { CliCommandModule, CliIo } from "@hypit/hypit/cli";
import type { CaptureOptions, CaptureOutput, CapturePlanReport, CaptureScript } from "@hypit/browser-capture";

export function writeCaptureHelp(io: CliIo): void {
  io.write(`Browser capture — save website or local HTML material to project files.

  hypit capture screenshot <url-or-file> --to <image> [options]
  hypit capture run <script.mjs> [browser options] [-- script arguments]
  hypit capture plan <plan.json> --to <directory> [options]
  hypit capture login <url> --profile <name>
  hypit capture install-browser

Plan options (replay a JSON step plan while recording it):
  --to <directory>            New or empty directory for recording.mp4, steps.json, steps.svs, screenshots/
  --scale <number>            Device pixels per CSS pixel; plans default to 2 for sharp zooms
  --cursor none|page          none (default): clean footage, the composition draws the cursor
                              from steps.json; page: draw a cursor into the recording
  --fps <number>              Constant frame rate of recording.mp4 (default 30; needs ffmpeg)
  --login-check <url>         Product session endpoint that must return a user before recording

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
  --browser-version <version> Exact Chrome for Testing version
  --browser-cache <directory> Cache shared by installation and capture
  --browser-download-base-url <url> Compatible archive source for install-browser
  --headed                   Show the browser
  --timeout-ms <milliseconds> Page operation and navigation timeout
  --profile <name>            Persistent browser profile outside the project (log in with capture login)
  --storage-state <file>      Import exported login state ({ cookies, origins })
  --json                     Print all saved files with their actual dimensions

The browser defaults to this package's tested Chrome for Testing revision. Prepare
it once with install-browser, or select a compatible installed browser. Native page
recording requires Chrome 153+ and ffprobe on PATH. A script exports default async ({ page, browser, screenshot,
record, args, log }) => { ... }; optional export const options configures Puppeteer
launch options and ffprobePath. Use page.goto/click/type/evaluate normally, then
screenshot({ path: 'assets/page.png' }) or record({ path: 'assets/demo.mp4' }).
Await recorder.stop() to finish a recording; returning finishes open recordings.
Native recording produces MP4; audio is included when record({ audio: true, ... }).

A plan lists steps such as goto, wait, assert, dismiss, hover, click, fill, type,
press, scroll, pause, screenshot, drag and upload; see the package README. Clicking
a paid or destructive control (generate, buy, delete, send, publish …) is refused
unless that step carries "authorized": true. capture login opens a visible browser
on the profile; log in yourself, then close the window.

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
  if (!["screenshot", "run", "plan", "login", "install-browser"].includes(command)) throw new Error(`Unknown capture command ${command}`);
  const separator = argv.indexOf("--");
  const args = separator < 0 ? [] : argv.slice(separator + 1);
  if (command !== "run" && args.length > 0) throw new Error("Script arguments belong to capture run");
  const parsed = parseArgs({
    args: (separator < 0 ? argv : argv.slice(0, separator)).slice(2), allowPositionals: true,
    options: {
      viewport: { type: "string" }, scale: { type: "string" }, channel: { type: "string" },
      "browser-version": { type: "string" }, "browser-cache": { type: "string" }, "browser-download-base-url": { type: "string" },
      browser: { type: "string" }, headed: { type: "boolean" }, "timeout-ms": { type: "string" },
      json: { type: "boolean" }, debug: { type: "boolean" }, verbose: { type: "boolean" },
      "no-color": { type: "boolean" }, color: { type: "string" }, help: { type: "boolean" },
      to: { type: "string" }, "full-page": { type: "boolean" },
      selector: { type: "string" }, clip: { type: "string" },
      transparent: { type: "boolean" }, "wait-for": { type: "string" },
      "wait-ms": { type: "string" }, profile: { type: "string" }, "storage-state": { type: "string" },
      cursor: { type: "string" }, fps: { type: "string" }, "login-check": { type: "string" },
    },
  });
  const values = parsed.values;
  if (values.help) { writeCaptureHelp(io); return; }
  const managedBrowser = {
    ...(values["browser-version"] === undefined ? {} : { version: values["browser-version"] }),
    ...(values["browser-cache"] === undefined ? {} : { cacheDirectory: resolve(cwd, values["browser-cache"]) }),
    ...(values["browser-download-base-url"] === undefined ? {} : { downloadBaseUrl: values["browser-download-base-url"] }),
  };
  if (command === "install-browser") {
    if (parsed.positionals.length > 0 || args.length > 0) throw new Error("install-browser takes no positional arguments");
    for (const name of Object.keys(values)) {
      if (!["json", "debug", "verbose", "color", "no-color", "browser-version", "browser-cache", "browser-download-base-url"].includes(name)) throw new Error(`install-browser does not use --${name}`);
    }
    io.writeProgress?.("Preparing the capture browser…\n");
    const { installCaptureBrowser } = await import("@hypit/browser-capture");
    const path = await installCaptureBrowser(managedBrowser);
    io.write(values.json ? `${JSON.stringify({ format: "hypit.capture-browser@1", path })}\n` : `Capture browser ready: ${path}\n`);
    return;
  }
  const source = parsed.positionals[0];
  if (source === undefined || parsed.positionals.length !== 1) {
    throw new Error(`capture ${command} needs exactly one ${command === "run" ? "script" : command === "plan" ? "plan file" : "URL or local file"}`);
  }
  if (values.browser && values.channel) throw new Error("Choose --browser or --channel");
  for (const name of ["cursor", "fps", "login-check"] as const) {
    if (values[name] !== undefined && command !== "plan") throw new Error(`--${name} belongs to capture plan`);
  }
  if (command === "login" && values.profile === undefined) throw new Error("capture login requires --profile <name>");
  let options: CaptureOptions = {};
  let script: CaptureScript;
  let planReport: CapturePlanReport | undefined;
  let planDirectory: string | undefined;
  if (command === "plan" || command === "login") {
    for (const name of ["full-page", "selector", "clip", "transparent", "wait-for", "wait-ms"] as const) {
      if (values[name] !== undefined) throw new Error(`--${name} belongs to capture screenshot`);
    }
  }
  if (command === "login") {
    if (values.to !== undefined) throw new Error("capture login saves nothing; it only prepares the profile");
    script = async () => {};
  } else if (command === "plan") {
    if (!values.to) throw new Error("capture plan requires --to <directory>");
    if (values.cursor !== undefined && values.cursor !== "none" && values.cursor !== "page") throw new Error("--cursor must be none or page");
    const { parseCapturePlan, runCapturePlan } = await import("@hypit/browser-capture");
    const planPath = resolve(cwd, source);
    const plan = parseCapturePlan(JSON.parse(await readFile(planPath, "utf8")));
    const directory = resolve(cwd, values.to);
    planDirectory = directory;
    const fps = numeric(values.fps, "--fps");
    const cursor = values.cursor as "none" | "page" | undefined;
    script = async (session) => {
      planReport = await runCapturePlan(session, plan, { directory, baseDirectory: dirname(planPath), log: session.log,
        ...(cursor === undefined ? {} : { cursor }), ...(fps === undefined ? {} : { fps }),
        ...(values["login-check"] === undefined ? {} : { loginCheck: values["login-check"] }) });
    };
  } else if (command === "run") {
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
  if (Object.keys(managedBrowser).length > 0) options = { ...options, browser: { ...options.browser, ...managedBrowser } };
  if (values.browser || values.channel) {
    if (Object.keys(managedBrowser).length > 0) throw new Error("Choose managed browser options or --browser/--channel");
    const { browser: _managed, ...externalOptions } = options;
    options = externalOptions;
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
  if (values.profile !== undefined) {
    const { captureProfileDirectory } = await import("@hypit/browser-capture");
    launch.userDataDir = captureProfileDirectory(values.profile);
  }
  if (values["storage-state"] !== undefined) options = { ...options, storageState: resolve(cwd, values["storage-state"]) };
  // A walkthrough is usually zoomed into later, so plans record at 2 device pixels per CSS pixel.
  if (values.viewport || values.scale || command === "plan") {
    const viewport = { width: 1280, height: 720, deviceScaleFactor: command === "plan" ? 2 : 1, ...launch.defaultViewport };
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
  // A plan's native recording is an intermediate file; the plan reports its own deliverables.
  const deliverable = (output: CaptureOutput) => planDirectory === undefined || output.path.startsWith(`${planDirectory}${sep}`);
  const show = (output: CaptureOutput) => {
    if (deliverable(output)) progress(`Saved ${output.path} (${output.width}×${output.height}${
      output.duration === undefined ? "" : `, ${output.duration.toFixed(2)}s`})`);
  };
  // Loading the browser library is specific to capture; ordinary Hypit commands do not load it.
  const { withCapture, openCaptureLogin } = await import("@hypit/browser-capture");
  if (command === "login") {
    const url = await sourceUrl(source, cwd);
    progress(`Log in to ${url} in the opened window, then close it. Profile: ${launch.userDataDir}`);
    await openCaptureLogin({ ...options, launch, profileDirectory: launch.userDataDir! }, url);
    io.write(values.json ? `${JSON.stringify({ format: "hypit.capture-profile@1", profile: values.profile, path: launch.userDataDir })}\n`
      : `Profile ${values.profile} saved; pass --profile ${values.profile} to capture with this login.\n`);
    return;
  }
  const captured = await withCapture({ ...options, launch, ...(timeoutMs === undefined ? {} : { timeoutMs }) },
    async (session) => await script({ ...session, args, log: progress }), show);
  const outputs = [...captured.filter(deliverable), ...(planReport?.recording ? [planReport.recording] : [])];
  if (planReport !== undefined) {
    if (values.json) io.write(`${JSON.stringify({ format: "hypit.capture@1", outputs, plan: planReport }, null, 2)}\n`);
    else io.write(planReport.failed === null
      ? `Plan passed: ${planReport.steps.length} steps, ${planReport.recording?.duration?.toFixed(2) ?? "?"}s recorded. Read steps.json and the screenshots before using the clip.\n`
      : `Plan failed at ${planReport.failed}\nThe partial recording, steps.json and screenshots/failed.png are kept for diagnosis.\n`);
    if (planReport.failed !== null) io.setExitCode?.(1);
    return;
  }
  if (values.json) io.write(`${JSON.stringify({ format: "hypit.capture@1", outputs }, null, 2)}\n`);
  else io.write(`Capture complete: ${outputs.length} file${outputs.length === 1 ? "" : "s"}.\n`);
}

export const cliCommandModules = [{
  format: "hypit.cli-command@1",
  id: "@hypit/browser-capture",
  commands: ["capture"],
  writeRootHelp(io) {
    io.write("\nBrowser capture\n  capture screenshot | run | plan | login | install-browser\n  hypit capture --help for options\n");
  },
  writeHelp(_argv, io) {
    writeCaptureHelp(io);
  },
  async run(argv, io, context) {
    await runCaptureCli(argv, io, context.cwd);
  },
}] as const satisfies readonly CliCommandModule[];
