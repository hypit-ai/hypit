import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { HtmlRasterRequest, RenderedVisual } from "@hypit/html-program";
import { terminateLocalProcessTree, type HtmlCaptureBackend } from "@hypit/html-render-local";

function electronEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.NODE_OPTIONS;
  return environment;
}

export async function inspectElectronExecutable(path: string): Promise<string> {
  if (!(await stat(path)).isFile()) throw new Error(`Electron executable is not a file: ${path}.`);
  await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
  const { stdout } = await promisify(execFile)(path, ["-p", "process.versions.electron"], {
    timeout: 15_000,
    windowsHide: true,
    env: { ...electronEnvironment(), ELECTRON_RUN_AS_NODE: "1" },
  });
  const version = stdout.trim();
  if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/u.test(version)) throw new Error(`Electron returned invalid version ${version}.`);
  if (Number(version.split(".")[0]) < 45) throw new Error(`Electron ${version} does not expose the shared-texture API.`);
  return version;
}

export function electronHtmlBackend(electronPath: string): HtmlCaptureBackend {
  const executable = electronPath.trim();
  if (executable.length === 0) throw new Error("Electron HTML rendering requires an explicit executable path.");
  return {
    id: "hypit.html.electron",
    mode: "encoded-stream",
    async renderVisual(request, staged, destination, options): Promise<RenderedVisual> {
      if (request.picture.alpha !== "opaque") throw new Error("Electron shared-texture delivery requires opaque Picture output.");
      await inspectElectronExecutable(executable);
      const range = request.range ?? { startFrame: 0, endFrameExclusive: request.program.frameCount };
      const config = `${staged.directory}/electron-render.json`;
      await writeFile(config, JSON.stringify({
        document: staged.document,
        url: staged.url,
        destination,
        ffmpegPath: options.ffmpegPath,
        width: request.program.canvas.width,
        height: request.program.canvas.height,
        frameRate: request.program.frameRate,
        startFrame: range.startFrame,
        endFrameExclusive: range.endFrameExclusive,
        quality: request.quality,
      }), "utf8");
      const runtime = fileURLToPath(new URL("../runtime/main.cjs", import.meta.url));
      const child = spawn(executable, [runtime, config], {
        detached: process.platform !== "win32",
        env: electronEnvironment(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let diagnostic = "";
      child.stderr.on("data", (chunk: Buffer) => { diagnostic += chunk.toString("utf8"); });
      let progressBuffer = "";
      child.stdout.on("data", (chunk: Buffer) => {
        progressBuffer += chunk.toString("utf8");
        const lines = progressBuffer.split("\n");
        progressBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const match = /^HYPIT_PROGRESS (\d+) (\d+)$/u.exec(line.trim());
          if (match !== null) options.onProgress?.({ completedFrames: Number(match[1]), totalFrames: Number(match[2]) });
        }
      });
      let stopping: Promise<void> | undefined;
      const stop = (): Promise<void> => {
        if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
        stopping ??= child.pid === undefined
          ? Promise.resolve().then(() => { child.kill("SIGKILL"); })
          : terminateLocalProcessTree(child.pid);
        return stopping;
      };
      const abort = () => { void stop(); };
      options.signal?.addEventListener("abort", abort, { once: true });
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      }).catch(async (error) => { await stop(); throw error; })
        .finally(() => options.signal?.removeEventListener("abort", abort));
      await (stopping ?? Promise.resolve());
      options.signal?.throwIfAborted();
      if (code !== 0) throw new Error(`Electron HTML rendering failed (${code ?? "signal"}): ${diagnostic.trim()}`);
      const information = await stat(destination);
      return {
        resource: { address: destination, mediaType: "video/mp4", size: information.size },
        frameRate: structuredClone(request.program.frameRate),
        frameCount: range.endFrameExclusive - range.startFrame,
        width: request.program.canvas.width,
        height: request.program.canvas.height,
      };
    },
  };
}
