import { execFile } from "node:child_process";

import { probeMediaToolchain } from "@hypit/media-execution";
import { runtimeConfigObject, runtimeConfigString } from "@hypit/runtime-kit";
import type { RuntimeAdapterFactoryContext, ManagedProgram, ManagedProgramState } from "@hypit/runtime-kit";
import { resolveRuntimeExecutable } from "@hypit/runtime-host-node";

import { defaultHyperframesCliPath } from "./provider.js";

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
  context: RuntimeAdapterFactoryContext,
): ManagedProgram {
  const config = runtimeConfigObject(context.config, "local HyperFrames");
  const configuredNode = runtimeConfigString(config.nodePath, "HyperFrames nodePath");
  const configuredCli = runtimeConfigString(config.hyperframesCliPath, "HyperFrames hyperframesCliPath");
  const configuredFfprobe = runtimeConfigString(config.ffprobePath, "HyperFrames ffprobePath");
  const node = resolveRuntimeExecutable(context.dataRoot, configuredNode ?? process.execPath);
  const cli = resolveRuntimeExecutable(context.dataRoot, configuredCli ?? defaultHyperframesCliPath());
  const ffprobe = resolveRuntimeExecutable(context.dataRoot, configuredFfprobe ?? "ffprobe");
  const probeBrowser = async (): Promise<ManagedProgramState> => {
    const located = await run(node, [cli, "browser", "path"]);
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
    id: "hyperframes-browser",
    installation: {
      probe: probeBrowser,
      commands: [{ command: node, args: [cli, "browser", "ensure"] }],
    },
    async probe(): Promise<ManagedProgramState> {
      const browser = await probeBrowser();
      if (browser.state !== "ready") return browser;
      const media = await probeMediaToolchain({ ffprobePath: ffprobe });
      return media.state === "ready"
        ? { state: "ready" }
        : { state: media.state, detail: media.detail };
    },
  };
}
