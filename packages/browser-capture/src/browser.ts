import { homedir } from "node:os";
import { join } from "node:path";
import { Browser, computeExecutablePath, install } from "@puppeteer/browsers";

// Page.record uses Chrome's native recording protocol, introduced in Chrome 153.
// This package owns its tested browser revision independently of other renderers.
const chromeVersion = "153.0.8010.12";

const cacheDirectory = () => process.env.PUPPETEER_CACHE_DIR ?? join(homedir(), ".cache", "puppeteer");

export async function captureBrowserExecutablePath(): Promise<string> {
  return computeExecutablePath({ browser: Browser.CHROME, buildId: chromeVersion, cacheDir: cacheDirectory() });
}

/** Explicit setup, using Puppeteer's cache configuration and upstream browser installer. */
export async function installCaptureBrowser(): Promise<string> {
  const installed = await install({ browser: Browser.CHROME, buildId: chromeVersion, cacheDir: cacheDirectory() });
  return installed.executablePath;
}
