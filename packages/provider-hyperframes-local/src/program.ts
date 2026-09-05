import { execFile } from "node:child_process";

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
 * HyperFrames owns the browser cache behind its CLI. It is deployment state,
 * not an author dependency, so the Endpoint lifecycle prepares it only
 * when this Provider is selected.
 */
export function localHyperframesBrowserProgram(
  input: {
    readonly id: string;
    readonly nodePath: string;
    readonly hyperframesCliPath: string;
    readonly ffprobePath: string;
    readonly ffmpegPath?: string;
  },
): ManagedProgram {
  const probeBrowser = async (): Promise<ManagedProgramState> => {
    const located = await run(input.nodePath, [input.hyperframesCliPath, "browser", "path"]);
    if (!located.ok) return { state: "down", detail: `HyperFrames browser is unavailable: ${located.output}` };
    const path = located.output.trim();
    if (path.length === 0 || path.includes("\n") || path.includes("\r")) {
      return { state: "mismatch", detail: "HyperFrames returned an invalid browser path" };
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
      commands: [{ command: input.nodePath, args: [input.hyperframesCliPath, "browser", "ensure"] }],
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
