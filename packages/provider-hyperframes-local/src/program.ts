import { execFile } from "node:child_process";
import { access } from "node:fs/promises";

import { probeMediaToolchain } from "@hypit/media-execution";
import type { ManagedProgram, ManagedProgramState } from "@hypit/runtime-kit";

function run(executable: string, args: readonly string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(executable, [...args], { timeout: 15_000, shell: false, windowsHide: true }, (error, stdout, stderr) => {
      resolve(error === null
        ? { ok: true, output: stdout.trim() }
        : { ok: false, output: (stderr.trim() || error.message).split("\n").at(-1) ?? "" });
    });
  });
}

/**
 * The executable the engine's launch will use, asked of the engine itself so the probe cannot
 * drift from it. `hyperframes browser path` is not that answer: its lookup falls back to a system
 * Chrome on macOS and Linux, which the engine never launches. When the engine finds no managed
 * chrome-headless-shell it leaves the choice to puppeteer's own bundled Chrome, so that is the
 * fallback reported here; an empty line means nothing would launch.
 */
const browserExecutableScript = `
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const [engineModule] = process.argv.slice(1);
const engine = await import(engineModule);
let executable = engine.resolveHeadlessShellPath({});
if (executable === undefined) {
  try {
    const puppeteer = (await import(pathToFileURL(createRequire(engineModule).resolve("puppeteer")).href)).default;
    executable = await puppeteer.executablePath();
  } catch {}
}
process.stdout.write(executable ?? "");
`;

/**
 * HyperFrames owns the browser cache behind its CLI. It is deployment state,
 * not an author dependency, so the Endpoint lifecycle prepares it only
 * when this Provider is selected.
 */
export function localHyperframesBrowserProgram(
  input: {
    readonly id: string;
    readonly nodePath: string;
    readonly hyperframesCliPath: string | (() => string);
    /** URL of the `@hyperframes/engine` module the render process will import. */
    readonly engineModule: string;
    readonly ffprobePath: string;
    readonly ffmpegPath?: string;
  },
): ManagedProgram {
  const cliPath = () => typeof input.hyperframesCliPath === "string" ? input.hyperframesCliPath : input.hyperframesCliPath();
  const probeBrowser = async (): Promise<ManagedProgramState> => {
    const located = await run(input.nodePath, ["--input-type=module", "-e", browserExecutableScript, "--", input.engineModule]);
    if (!located.ok) return { state: "down", detail: `HyperFrames browser is unavailable: ${located.output}` };
    const path = located.output.trim();
    if (path.includes("\n") || path.includes("\r")) {
      return { state: "mismatch", detail: "HyperFrames returned an invalid browser path" };
    }
    if (path.length === 0 || !await access(path).then(() => true, () => false)) {
      return {
        state: "down",
        detail: `HyperFrames has no rendering browser installed${path.length === 0 ? "" : ` at ${path}`}; `
          + "the render engine launches its managed chrome-headless-shell, not a system Chrome. "
          + "Run hypit runtime up, or hyperframes browser ensure",
      };
    }
    const version = await run(path, ["--version"]);
    if (!version.ok || version.output.length === 0) {
      return { state: "mismatch", detail: `HyperFrames browser cannot start: ${version.output}` };
    }
    return { state: "ready" };
  };
  return {
    id: input.id,
    installation: {
      probe: probeBrowser,
      get commands() { return [{ command: input.nodePath, args: [cliPath(), "browser", "ensure"] }]; },
    },
    async probe(): Promise<ManagedProgramState> {
      const browser = await probeBrowser();
      if (browser.state !== "ready") return browser;
      const media = await probeMediaToolchain({ ffprobePath: input.ffprobePath, ...(input.ffmpegPath === undefined ? {} : { ffmpegPath: input.ffmpegPath }) });
      return media.state === "ready"
        ? { state: "ready" }
        : { state: media.state, detail: media.detail };
    },
  };
}
