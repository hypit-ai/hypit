import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { constants, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { downloadArtifact } from "@electron/get";
import extract from "extract-zip";
import { lock } from "proper-lockfile";

const release = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).hypit.htmlElectron as {
  version: string; checksums: Record<string, string>;
};
export const recommendedElectronVersion = release.version;
export type ElectronOptions = {
  readonly renderer?: "chromium" | "electron";
  readonly electronPath?: string;
  readonly electronCacheDirectory?: string;
  /** Release archive base URL; selected archives must match the Provider's checksums. */
  readonly electronDownloadBaseUrl?: string;
};

export function usesElectron(options: ElectronOptions): boolean {
  const renderer = options.renderer ?? (options.electronPath === undefined ? "chromium" : "electron");
  if (!["chromium", "electron"].includes(renderer)) throw new Error("HTML renderer renderer must be chromium or electron");
  if (renderer !== "electron" && [options.electronPath, options.electronCacheDirectory, options.electronDownloadBaseUrl].some(value => value !== undefined)) {
    throw new Error("Electron configuration requires renderer electron");
  }
  if (options.electronPath !== undefined && (options.electronPath.trim() === ""
    || options.electronCacheDirectory !== undefined || options.electronDownloadBaseUrl !== undefined)) {
    throw new Error("electronPath must be nonempty and is mutually exclusive with managed Electron configuration");
  }
  return renderer === "electron";
}

export function electronCacheDirectory(options: ElectronOptions): string {
  return resolve(options.electronCacheDirectory ?? join(homedir(), ".cache", "hypit", "html-rasterizer", "electron"));
}
function executableRelativePath(): string {
  if (process.platform === "darwin") return "Electron.app/Contents/MacOS/Electron";
  if (process.platform === "win32") return "electron.exe";
  if (process.platform === "linux") return "electron";
  throw new Error(`Managed Electron is unavailable for ${process.platform}`);
}
function archiveName(): string {
  const name = `electron-v${release.version}-${process.platform}-${process.arch}.zip`;
  if (!release.checksums[name]) throw new Error(`Managed Electron is unavailable for ${process.platform}/${process.arch}`);
  return name;
}
export function electronDownloadUrl(options: ElectronOptions): string {
  const value = options.electronDownloadBaseUrl ?? "https://github.com/electron/electron/releases/download";
  let base: URL;
  try { base = new URL(value); } catch { throw new Error("electronDownloadBaseUrl must be an absolute HTTP(S) URL"); }
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error("electronDownloadBaseUrl must be an HTTP(S) archive base without credentials, query or fragment");
  }
  return `${base.href.replace(/\/+$/u, "")}/v${release.version}/${archiveName()}`;
}
export function electronExecutablePath(options: ElectronOptions): string | undefined {
  if (!usesElectron(options)) return undefined;
  if (options.electronPath !== undefined) return resolve(options.electronPath);
  electronDownloadUrl(options);
  return join(electronCacheDirectory(options), `${release.version}-${process.platform}-${process.arch}`, executableRelativePath());
}
export function electronEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  return env;
}
export async function requireElectronExecutable(path: string): Promise<void> {
  try {
    if (!(await stat(path)).isFile()) throw new Error("Electron path is not a file");
    await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    const { stdout } = await promisify(execFile)(path, ["-p", "process.versions.electron"], {
      timeout: 15_000, windowsHide: true, env: { ...electronEnvironment(), ELECTRON_RUN_AS_NODE: "1" },
    });
    if (stdout.trim() !== release.version) throw new Error(`Expected Electron ${release.version}, received ${stdout.trim()}`);
    if (process.platform === "darwin") {
      const { stdout: agent } = await promisify(execFile)("/usr/bin/plutil", [
        "-extract", "LSUIElement", "raw", "-expect", "bool", "-o", "-", join(dirname(dirname(path)), "Info.plist"),
      ], { timeout: 15_000 }).catch(() => {
        throw new Error('macOS Electron must be a background app with LSUIElement=true; use renderer "electron" for managed preparation, or select a prepared background app');
      });
      if (agent.trim() !== "true") throw new Error("macOS Electron requires LSUIElement=true");
    }
  } catch (error) {
    throw new Error(`HTML renderer Electron is unavailable at ${path}: ${error instanceof Error ? error.message : String(error)}. Prepare the selected Runtime with hypit runtime up --runtime <profile>, or correct its electronPath.`);
  }
}

/** Explicit Runtime preparation installs a checksum-verified, versioned distribution. */
export async function installHtmlElectron(cacheDir: string, downloadBaseUrl?: string): Promise<void> {
  const options = { renderer: "electron" as const, electronCacheDirectory: cacheDir,
    ...(downloadBaseUrl === undefined ? {} : { electronDownloadBaseUrl: downloadBaseUrl }) };
  const executable = electronExecutablePath(options)!;
  const directory = join(electronCacheDirectory(options), `${release.version}-${process.platform}-${process.arch}`);
  const cacheRoot = electronCacheDirectory(options);
  await mkdir(cacheRoot, { recursive: true });
  // Independent Runtime profiles can select the same archive cache.
  const unlock = await lock(cacheRoot, { stale: 600_000, retries: {
    retries: 360, factor: 1, minTimeout: 1_000, maxTimeout: 1_000,
  } });
  try {
    try { await requireElectronExecutable(executable); return; } catch { /* Explicit preparation repairs this selection. */ }
    const url = electronDownloadUrl(options);
    process.stdout.write(`Preparing Electron ${release.version} at ${executable}\nDownload source: ${url}\n`);
    await mkdir(dirname(directory), { recursive: true });
    const stage = await mkdtemp(`${directory}-staging-`);
    try {
      const archive = await downloadArtifact({ version: release.version, artifactName: "electron",
        platform: process.platform, arch: process.arch, cacheRoot: join(electronCacheDirectory(options), "downloads"),
        checksums: release.checksums, downloadOptions: { signal: AbortSignal.timeout(300_000) },
        mirrorOptions: { resolveAssetURL: async details => {
          if (details.version !== `v${release.version}`) throw new Error("Electron environment version override conflicts with the Provider selection");
          return url;
        } },
      });
      await extract(archive, { dir: stage });
      if (process.platform === "darwin") {
        const bundle = join(stage, "Electron.app");
        // Launch Services reads this before Electron can execute the worker script.
        await promisify(execFile)("/usr/bin/plutil", ["-insert", "LSUIElement", "-bool", "YES", join(bundle, "Contents", "Info.plist")]);
        await promisify(execFile)("/usr/bin/codesign", ["--force", "--deep", "--sign", "-",
          "--preserve-metadata=identifier,entitlements,flags,runtime", bundle], { timeout: 60_000 });
        await promisify(execFile)("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle], { timeout: 60_000 });
      }
      await requireElectronExecutable(join(stage, executableRelativePath()));
      await rm(directory, { recursive: true, force: true });
      await rename(stage, directory);
      await requireElectronExecutable(executable);
    } finally { await rm(stage, { recursive: true, force: true }); }
  } finally { await unlock(); }
}
