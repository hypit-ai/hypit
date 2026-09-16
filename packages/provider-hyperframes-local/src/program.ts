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
    readonly hyperframesCliPath: string | (() => string);
    readonly ffprobePath: string;
    readonly ffmpegPath?: string;
  },
): ManagedProgram {
  const cliPath = () => typeof input.hyperframesCliPath === "string" ? input.hyperframesCliPath : input.hyperframesCliPath();
  const probeBrowser = async (): Promise<ManagedProgramState> => {
    try { cliPath(); } catch (error) { return { state: "down", detail: error instanceof Error ? error.message : String(error) }; }
    // Readiness asks the engine's own resolver, so it answers for the browser the renderer will
    // launch: its managed download, a configured override, or Puppeteer's cache.
    const { resolveHeadlessShellPath } = await import("@hyperframes/engine");
    const path = resolveHeadlessShellPath({});
    if (path === undefined) {
      return { state: "down", detail: "HyperFrames render browser is not downloaded; run hypit runtime up" };
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
