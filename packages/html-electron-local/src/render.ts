import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { constants, existsSync } from "node:fs";
import { access, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { RenderedVisual } from "@hypit/html-program";
import { terminateLocalProcessTree, type HtmlCaptureBackend } from "@hypit/html-render-local";

const execFileAsync = promisify(execFile);

function hasHeadlessPlistFlag(plist: string): boolean {
  return /<key>\s*(?:LSUIElement|LSBackgroundOnly)\s*<\/key>\s*(?:<true\s*\/>|<string>\s*1\s*<\/string>)/u.test(plist);
}

function injectLsuiElement(plist: string): string {
  if (hasHeadlessPlistFlag(plist)) return plist;
  const replaced = plist.replace(
    /<key>\s*LSUIElement\s*<\/key>\s*(?:<false\s*\/>|<string>\s*0\s*<\/string>)/u,
    "<key>LSUIElement</key>\n\t<true/>",
  );
  if (replaced !== plist) return replaced;
  return plist.replace("<dict>", "<dict>\n\t<key>LSUIElement</key>\n\t<true/>");
}

/**
 * On macOS, spawning an Electron .app binary whose Info.plist lacks LSUIElement
 * causes LaunchServices/WindowServer to register a regular Dock tile and bounce
 * the Electron icon before JS can call app.setActivationPolicy("accessory").
 * Clone the bundle with APFS copy-on-write (zero extra disk blocks) into a cache
 * directory with LSUIElement=true so the worker never appears in the Dock.
 */
async function resolveMacHeadlessElectron(executable: string): Promise<string> {
  if (process.platform !== "darwin") return executable;
  try {
    const resolved = await realpath(executable);
    const macOsDir = dirname(resolved);
    const contentsDir = dirname(macOsDir);
    const appDir = dirname(contentsDir);
    if (basename(macOsDir) !== "MacOS" || basename(contentsDir) !== "Contents" || !appDir.endsWith(".app")) {
      return executable;
    }
    const sourcePlistPath = join(contentsDir, "Info.plist");
    const sourcePlist = await readFile(sourcePlistPath, "utf8");
    if (hasHeadlessPlistFlag(sourcePlist)) return executable;

    const [plistInfo, binInfo] = await Promise.all([stat(sourcePlistPath), stat(resolved)]);
    const hash = createHash("sha256")
      .update(`${appDir}\0${plistInfo.mtimeMs}\0${plistInfo.size}\0${binInfo.mtimeMs}\0${binInfo.size}`)
      .digest("hex")
      .slice(0, 16);
    const cacheBase = join(homedir() || tmpdir(), ".cache", "hypit", "electron-headless");
    const targetDir = join(cacheBase, hash);
    const appName = basename(appDir);
    const binName = basename(resolved);
    const targetApp = join(targetDir, appName);
    const targetBin = join(targetApp, "Contents", "MacOS", binName);
    const targetPlist = join(targetApp, "Contents", "Info.plist");

    if (existsSync(targetBin)) {
      const cachedPlist = await readFile(targetPlist, "utf8").catch(() => "");
      if (hasHeadlessPlistFlag(cachedPlist)) return targetBin;
    }

    await mkdir(cacheBase, { recursive: true });
    const stagingDir = join(cacheBase, `.staging-${hash}-${process.pid}-${Date.now()}`);
    const stagingApp = join(stagingDir, appName);
    await mkdir(stagingDir, { recursive: true });
    try {
      try {
        await execFileAsync("cp", ["-cR", appDir, stagingApp], { timeout: 30_000 });
      } catch {
        await execFileAsync("cp", ["-R", appDir, stagingApp], { timeout: 60_000 });
      }
      await writeFile(join(stagingApp, "Contents", "Info.plist"), injectLsuiElement(sourcePlist), "utf8");
      if (existsSync(join(stagingApp, "Contents", "_CodeSignature"))) {
        await execFileAsync("codesign", ["--force", "--sign", "-", stagingApp], { timeout: 30_000 }).catch(() => {});
      }
      try {
        await rename(stagingDir, targetDir);
      } catch {
        if (!existsSync(targetBin)) throw new Error("Failed to publish headless Electron bundle.");
      }
      return existsSync(targetBin) ? targetBin : executable;
    } finally {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch {
    return executable;
  }
}

function electronEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const environment = { ...process.env, ...extra };
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
      const config = join(staged.directory, "electron-render.json");
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
      const launchExecutable = await resolveMacHeadlessElectron(executable);
      const child = spawn(launchExecutable, [runtime, config], {
        detached: process.platform !== "win32",
        env: electronEnvironment({
          HYPIT_ELECTRON_WORKER: runtime,
          HYPIT_ELECTRON_CONFIG: config,
        }),
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

export function electronHtmlFrameBackend(electronPath: string): HtmlCaptureBackend {
  const executable = electronPath.trim();
  if (executable.length === 0) throw new Error("Electron HTML frame capture requires an explicit executable path.");
  return {
    id: "hypit.html.electron-frame",
    mode: "frame-buffer",
    async createWorker(request, staged, options) {
      options.signal?.throwIfAborted();
      await inspectElectronExecutable(executable);
      const selection = "frames" in request
        ? request.frames.map((frame) => ({ startFrame: frame, endFrameExclusive: frame + 1 }))
        : [request.range ?? { startFrame: 0, endFrameExclusive: request.program.frameCount }];
      const config = join(staged.directory, "electron-capture.json");
      await writeFile(config, JSON.stringify({
        url: staged.url,
        width: request.program.canvas.width,
        height: request.program.canvas.height,
        selection,
        userData: join(staged.directory, "electron-capture-profile"),
      }), "utf8");
      const runtime = fileURLToPath(new URL("../runtime/capture.cjs", import.meta.url));
      const launchExecutable = await resolveMacHeadlessElectron(executable);
      const child = spawn(launchExecutable, [runtime, config], {
        detached: process.platform !== "win32",
        env: electronEnvironment({
          HYPIT_ELECTRON_WORKER: runtime,
          HYPIT_ELECTRON_CONFIG: config,
        }),
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      let diagnostic = "";
      child.stderr.on("data", (chunk: Buffer) => { diagnostic += chunk.toString("utf8"); });

      let nextId = 1;
      const pending = new Map<number, { resolve: (buffer: Buffer) => void; reject: (error: Error) => void }>();
      let stdoutBuffer = "";
      let resolveReady!: () => void;
      let rejectReady!: (error: unknown) => void;
      const readyPromise = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });

      const failAll = (error: Error) => {
        rejectReady(error);
        for (const entry of pending.values()) entry.reject(error);
        pending.clear();
      };

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (line === "HYPIT_CAPTURE_READY") {
            resolveReady();
            continue;
          }
          if (line.startsWith("HYPIT_CAPTURE_RESULT ")) {
            const payload = JSON.parse(line.slice("HYPIT_CAPTURE_RESULT ".length)) as {
              id: number;
              data?: string;
              error?: string;
            };
            const waiter = pending.get(payload.id);
            if (!waiter) continue;
            pending.delete(payload.id);
            if (payload.error !== undefined) waiter.reject(new Error(payload.error));
            else if (typeof payload.data === "string") waiter.resolve(Buffer.from(payload.data, "base64"));
            else waiter.reject(new Error("Electron returned no frame image."));
          }
        }
      });

      child.once("error", (error) => failAll(error));
      child.once("exit", (code) => {
        failAll(new Error(`Electron frame capture exited (${code ?? "signal"}): ${diagnostic.trim()}`));
      });

      let closing: Promise<void> | undefined;
      const close = (): Promise<void> => {
        closing ??= (async () => {
          if (child.exitCode === null && child.signalCode === null) {
            try { child.stdin.end(`${JSON.stringify({ close: true })}\n`); } catch { /* ignore */ }
            const exited = once(child, "exit");
            if (child.pid !== undefined) await terminateLocalProcessTree(child.pid);
            await exited;
          }
          child.stdout.destroy();
          child.stderr.destroy();
        })();
        return closing;
      };

      const abort = () => {
        failAll(options.signal?.reason instanceof Error ? options.signal.reason : new Error("Electron frame capture aborted."));
        void close().catch(() => undefined);
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(() => {
        failAll(new Error("Electron frame capture timed out while starting."));
      }, 30_000).unref();

      try {
        if (options.signal?.aborted) abort();
        await readyPromise;
      } catch (error) {
        options.signal?.removeEventListener("abort", abort);
        await close().catch(() => undefined);
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      return {
        capture(frame: number, transparent: boolean): Promise<Buffer> {
          if (child.exitCode !== null || child.signalCode !== null) {
            return Promise.reject(new Error("Electron frame capture worker is closed."));
          }
          const id = nextId++;
          return new Promise<Buffer>((resolve, reject) => {
            pending.set(id, { resolve, reject });
            child.stdin.write(`${JSON.stringify({ id, frame, transparent })}\n`);
          });
        },
        close: () => {
          options.signal?.removeEventListener("abort", abort);
          return close();
        },
      };
    },
  };
}
