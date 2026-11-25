import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { CliIo } from "./output.js";

export type VersionEnvironment = {
  readonly packageRoot: string;
  readonly launcher?: string;
  readonly fetch: typeof globalThis.fetch;
  readonly timeoutMs?: number;
};

export function writeVersionHelp(io: Pick<CliIo, "write">): void {
  io.write("Usage: hypit version [--check] [--registry <url>] [--json]\n\n"
    + "Show the executing Distribution and launcher without opening a project or Runtime.\n"
    + "--check queries npm latest (registry.npmjs.org by default); --registry selects a mirror.\n"
    + "No packages or Skills are updated. hypit --version remains a local version-only query.\n");
}

function deadline(timeoutMs: number): {
  readonly signal: AbortSignal;
  wait<T>(value: Promise<T>): Promise<T>;
  finish(): void;
} {
  const controller = new AbortController();
  let rejectTimeout: ((reason: Error) => void) | undefined;
  const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
  const timer = setTimeout(() => {
    controller.abort();
    rejectTimeout?.(new Error("Registry version query timed out; latest version is unknown"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    async wait<T>(value: Promise<T>): Promise<T> { return await Promise.race([value, timeout]); },
    finish() { clearTimeout(timer); },
  };
}

/** Installation discovery belongs to the root CLI Host, never to one domain contribution. */
export async function runVersionCli(
  argv: readonly string[],
  io: CliIo,
  environment: VersionEnvironment,
): Promise<void> {
  let check = false;
  let json = false;
  let registry = "https://registry.npmjs.org/";
  let selectedRegistry = false;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") check = true;
    else if (arg === "--json") json = true;
    else if (arg === "--registry") {
      selectedRegistry = true;
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error("--registry requires a URL");
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error("--registry requires an HTTP(S) registry URL without credentials, query or fragment");
      }
      registry = `${url.href.replace(/\/+$/u, "")}/`;
    } else if (arg === "--help") { writeVersionHelp(io); return; }
    else if (arg === "--color") {
      // Global presentation options apply to every command; the terminal adapter reads them.
      const value = argv[++i];
      if (value !== "auto" && value !== "always" && value !== "never") throw new Error("--color requires auto, always or never");
    } else if (arg !== "--no-color" && arg !== "--debug" && arg !== "--verbose") throw new Error(`Unknown version option: ${arg}`);
  }
  if (selectedRegistry && !check) throw new Error("--registry selects the source for --check; add --check to query it");
  const manifest = JSON.parse(await readFile(resolve(environment.packageRoot, "package.json"), "utf8")) as {
    name: string; version: string; repository?: { url?: string };
  };
  const repository = manifest.repository?.url?.replace(/^git\+/u, "").replace(/\.git$/u, "");
  const releases = repository === undefined ? undefined : `${repository}/releases`;
  let latest: { registry: string; version?: string; matchesInstalled?: boolean; error?: string } | undefined;
  if (check) {
    latest = { registry };
    const request = deadline(environment.timeoutMs ?? 10_000);
    try {
      const response = await request.wait(environment.fetch(new URL(`${encodeURIComponent(manifest.name)}/latest`, registry), {
        signal: request.signal, headers: { accept: "application/json" },
      }));
      if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}; latest version is unknown`);
      const body = await request.wait(response.json()) as { name?: unknown; version?: unknown };
      if (body.name !== manifest.name || typeof body.version !== "string" || body.version.length === 0) {
        throw new Error("Registry returned no matching package version; latest version is unknown");
      }
      latest.version = body.version;
      latest.matchesInstalled = body.version === manifest.version;
    } catch (error) {
      latest.error = error instanceof Error ? error.message : String(error);
      io.setExitCode?.(1);
    } finally { request.finish(); }
  }
  const report = {
    format: "hypit.cli-version@1", package: manifest.name, version: manifest.version,
    distribution: resolve(environment.packageRoot),
    ...(environment.launcher === undefined ? {} : { launcher: resolve(environment.launcher) }),
    ...(releases === undefined ? {} : { releases }),
    ...(latest === undefined ? {} : { latest }),
  };
  if (json) { io.write(`${JSON.stringify(report, null, 2)}\n`); return; }
  io.write(`${manifest.name} ${manifest.version}\nDistribution: ${report.distribution}\n`
    + (report.launcher === undefined ? "" : `Launcher: ${report.launcher}\n`));
  if (latest !== undefined) {
    io.write(`npm latest: ${latest.version === undefined ? "unknown" : `${latest.version} (${latest.matchesInstalled ? "matches installed" : "differs from installed"})`}\nRegistry: ${registry}\n`);
    if (latest.error !== undefined) io.write(`${latest.error}\n`);
    if (releases !== undefined) io.write(`Release notes: ${releases}\n`);
    io.write("Update through this installation's package manager or checkout; preserve the project's chosen version.\n"
      + "Skill updates belong to its installer and are separate from this executable.\n");
  }
}
