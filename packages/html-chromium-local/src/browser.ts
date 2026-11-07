import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, stat } from "node:fs/promises";
import { constants, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Browser, computeExecutablePath, detectBrowserPlatform, getDownloadUrl, install, uninstall } from "@puppeteer/browsers";

// The Chromium renderer release owns this recommendation alongside its browser integration.
// It is installation input, not a second browser discovery policy in executable code.
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
export const recommendedBrowserVersion: string = exactBrowserVersion(manifest.hypit?.htmlBrowser?.version);

function exactBrowserVersion(value: unknown): string {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+\.\d+$/u.test(value)) {
    throw new Error("HTML renderer browserVersion must be an exact four-part Chrome version; channels such as latest are not selections");
  }
  return value;
}

export type BrowserOptions = {
  readonly chromePath?: string;
  readonly browserVersion?: string;
  readonly browserCacheDirectory?: string;
  /** Chrome for Testing archive base URL; used only during explicit preparation. */
  readonly browserDownloadBaseUrl?: string;
};

export function browserDownloadBaseUrl(options: BrowserOptions): string | undefined {
  const value = options.browserDownloadBaseUrl;
  if (value === undefined) return undefined;
  if (options.chromePath !== undefined) {
    throw new Error("HTML renderer chromePath and browserDownloadBaseUrl are mutually exclusive; a user-managed browser is not downloaded");
  }
  let url: URL;
  try { url = new URL(value); } catch {
    throw new Error("HTML renderer browserDownloadBaseUrl must be an absolute HTTP(S) archive base URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("HTML renderer browserDownloadBaseUrl must be an HTTP(S) archive base URL without credentials, query or fragment");
  }
  return url.href.replace(/\/+$/u, "");
}

export function browserDownloadUrl(options: BrowserOptions): string {
  const baseUrl = browserDownloadBaseUrl(options);
  const version = selectedBrowserVersion(options);
  if (version === undefined) throw new Error("A user-managed browser has no download URL");
  const platform = detectBrowserPlatform();
  if (platform === undefined) throw new Error("The managed HTML browser is unavailable for this host; select chromePath");
  return getDownloadUrl(Browser.CHROMEHEADLESSSHELL, platform, version, baseUrl).href;
}

/** Only Profile/caller configuration selects a browser; environment hints are not inputs. */
export function configuredBrowserPath(options: BrowserOptions): string | undefined {
  browserDownloadBaseUrl(options);
  if (options.chromePath !== undefined && options.browserVersion !== undefined) {
    throw new Error("HTML renderer chromePath and browserVersion are mutually exclusive");
  }
  if (options.chromePath === "") throw new Error("HTML renderer chromePath must not be empty");
  return options.chromePath === undefined ? undefined : resolve(options.chromePath);
}

export function selectedBrowserVersion(options: BrowserOptions): string | undefined {
  return configuredBrowserPath(options) === undefined
    ? exactBrowserVersion(options.browserVersion ?? recommendedBrowserVersion) : undefined;
}

export function browserCacheDirectory(options: BrowserOptions): string {
  return resolve(options.browserCacheDirectory ?? join(homedir(), ".cache", "hypit", "html-rasterizer", "chrome"));
}

export function browserExecutablePath(options: BrowserOptions): string {
  const configured = configuredBrowserPath(options);
  if (configured !== undefined) return configured;
  const version = selectedBrowserVersion(options)!;
  try {
    return computeExecutablePath({
      browser: Browser.CHROMEHEADLESSSHELL, buildId: version, cacheDir: browserCacheDirectory(options),
    });
  } catch (error) {
    throw new Error("The managed HTML browser is unavailable for this host. Select an installed Chrome/Chromium with the Provider's chromePath.", { cause: error });
  }
}

export async function requireBrowserExecutable(path: string, version?: string): Promise<void> {
  try {
    if (!(await stat(path)).isFile()) throw new Error("Browser path is not a file");
    await access(path, constants.X_OK);
    const { stdout } = await promisify(execFile)(path, ["--version"], { timeout: 15_000, windowsHide: true });
    if (!stdout.trim()) throw new Error("Browser returned no version");
    if (version !== undefined && !stdout.trim().split(/\s+/u).includes(version)) {
      throw new Error(`Expected Chrome Headless Shell ${version}, received ${stdout.trim()}`);
    }
  }
  catch (error) {
    throw new Error(`HTML browser is unavailable at ${path}: ${error instanceof Error ? error.message : String(error)}. Prepare that exact browser environment, or correct chromePath.`, { cause: error });
  }
}

/** Explicit environment preparation; ordinary rendering never installs tools. */
export async function installHtmlBrowser(cacheDir: string, version: string, downloadBaseUrl?: string): Promise<void> {
  const buildId = exactBrowserVersion(version);
  const options = { browserVersion: buildId, ...(downloadBaseUrl === undefined ? {} : { browserDownloadBaseUrl: downloadBaseUrl }) };
  const baseUrl = browserDownloadBaseUrl(options);
  const url = browserDownloadUrl(options);
  const path = computeExecutablePath({ browser: Browser.CHROMEHEADLESSSHELL, buildId, cacheDir });
  process.stdout.write(`Preparing Chrome Headless Shell ${buildId} at ${path}\nDownload source: ${url}\n`);
  try { await requireBrowserExecutable(path, buildId); return; } catch { /* Explicit preparation repairs this selection only. */ }
  await uninstall({ browser: Browser.CHROMEHEADLESSSHELL, buildId, cacheDir });
  try {
    // A single baseUrl uses the library's DefaultProvider without its provider-chain fallback.
    await install({ browser: Browser.CHROMEHEADLESSSHELL, buildId, cacheDir, ...(baseUrl === undefined ? {} : { baseUrl }) });
    await requireBrowserExecutable(path, buildId);
  } catch (error) {
    throw new Error(`Could not prepare Chrome Headless Shell ${buildId} from ${url} at ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
