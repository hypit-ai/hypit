import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

import { deterministicSpeechDurations, deterministicSpeechDurationsFromGraph } from "@hypit/compiler-node";
import type { NodeCompiledSourceClosure } from "@hypit/compiler-node";
import type { NodeRuntimeHost } from "@hypit/runtime-host-node";
import {
  hypitHostPackageRoot,
  inspectHostPackage,
  prepareHostPackages,
} from "@hypit/runtime-host-node";
import { plannedNeeds } from "@hypit/runtime";
import type { BuildCatalogDescriptor, CapacityReservation, OperationProgress } from "@hypit/runtime";
import type { BuildState, CapabilityRef, TypeRef } from "@hypit/protocol";
import { parseSourceHeader } from "@hypit/source";

import {
  acceptedArchivedOutputs,
  collectArtifacts,
  findArchivedArtifact,
  inspectBuild,
  materializeArtifact,
  materializeRecord,
  pinnedRecords,
  selectArchivedRecord,
  summarizeBuildCatalog,
} from "./archive.js";
import { unreachedGenerations } from "./reachability.js";
import { typecheckProjectPackages } from "./package-typecheck.js";
import { checkRunFile, collectRunFrontends, loadRunFile } from "./run-file.js";
import type { CliDistribution } from "./distribution.js";
import type {
  CliBuildSubmission,
  CliManagedProgramProgress,
  CliManagedProgramReport,
  CliRuntime,
  CliRuntimeArchiveControl,
  CliRuntimeArtifactAccess,
  CliRuntimeController,
} from "./runtime-port.js";
import { writeCliHelp, writeCliOutput } from "./output.js";
import type { CliColorMode, CliIo } from "./output.js";
import { hypitHostStateRoot, hypitProjectStateRoot } from "./paths.js";
import { loadDiscoveredSourcePackages } from "./source-packages.js";
import {
  clearRuntimeProfile,
  findRuntimeProfile,
  selectRuntimeProfile,
} from "./runtime-selection.js";

type ParsedArgs = {
  readonly command: string | undefined;
  /** Second command word for scoped commands such as runtime and cancel. */
  readonly action: string | undefined;
  readonly file: string | undefined;
  /** Canonical containment boundary for Author and Run Sources plus source assets. */
  readonly workspaceRoot: string | undefined;
  readonly assetRoots: readonly string[];
  /** Host directory whose node_modules contains selected packages. */
  readonly packageRoot: string | undefined;
  readonly runtime: string | undefined;
  readonly follow: boolean;
  /** Emit the Run Source markup that reuses these Records instead of listing them. */
  readonly pin: boolean;
  /** Omit this Build's requested Targets from history and generated pin markup. */
  readonly excludeTargets: boolean;
  readonly maxWaitMs: number | undefined;
  readonly record: string | undefined;
  readonly output: string | undefined;
  readonly name: string | undefined;
  readonly artifact: string | undefined;
  readonly to: string | undefined;
  /** Prompt text, or the path of a text file holding it. */
  readonly prompt: string | undefined;
  /** Installed package specifier naming the exact model family. */
  readonly model: string | undefined;
  readonly aspectRatio: string | undefined;
  readonly resolution: string | undefined;
  readonly json: boolean;
  readonly color: CliColorMode;
  readonly verbose: boolean;
  readonly watch: boolean;
  readonly jsonl: boolean;
  readonly readyFile: string | undefined;
  readonly reason: string | undefined;
  readonly slot: string | undefined;
  readonly from: string | undefined;
  /** Exact historical source path filter. It is Host presentation, never Build identity. */
  readonly source: string | undefined;
  /** Exact option spellings seen after positional dispatch. */
  readonly seenOptions: readonly string[];
};

const HYPIHUB_OAUTH_CLIENT_ID = "hyc_d5d5e8e7131b0c877756e66c";

// Keep the callback page independent from a network request, but use the same
// mark shipped by hypit.ai (rather than a hand-drawn approximation).
const HYPIHUB_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="158.2 -39.5 415.6 415.6" aria-hidden="true"><defs><linearGradient id="hypit-callback-mark" x1="246.21386109" y1="324.13157352" x2="485.13742708" y2="22.56333286" gradientTransform="translate(0 337.46521538) scale(1 -1)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e83f5f"/><stop offset=".14" stop-color="#e94765"/><stop offset=".33" stop-color="#ec5774"/><stop offset=".56" stop-color="#f1738c"/><stop offset=".8" stop-color="#f599af"/><stop offset=".88" stop-color="#f6a9bd"/></linearGradient></defs><path d="M549.67231627,138.36559516c-9.03995973-13.04594537-23.93013015-20.81603972-39.78785439-20.81603972h-141.20754521c-18.56362718,0-37.6714659,11.24702323-44.746216,28.41986963l-42.72053713,114.61681504c-6.9538001,17.00658197-6.86310202,36.35627455,3.35595582,51.63954686,10.26440688,15.34370695,29.26643886,24.41388399,47.72425931,24.41388399h129.97565371c21.3451426,0,40.66461787-13.42386941,48.13240067-33.40849469l44.88226312-120.28567569c5.54794526-14.87508482,3.46179716-31.53396006-5.57816258-44.56481984v-.03021732h-.03021732v.01513172ZM471.42693057,288.67353473c-1.42099809,3.80945775-5.12464911,6.3793597-9.19111551,6.3793597h-126.15104116c-6.56075586,0-10.09811937-4.23273084-11.32261265-6.03165297s-3.77924044-6.69680298-1.26981925-12.7587194l36.05396299-100.13473985c3.46177409-9.59927994,12.21450786-16.43213004,22.40334838-16.96123293.49886251-.03021732,1.01283367-.03021732,1.54193656-.03021732h113.996991s18.91133391,2.14662887,14.04367038,22.08585897l-40.10529767,107.46647552h0l-.00002307-.01513172ZM251.97398813,265.21202671s-33.80152739-17.52055313-26.69654845-49.3720026l44.85202273-124.30679305c7.22590587-20.02997431,26.24304651-33.39336296,47.54284008-33.39336296h143.64135391c9.44810109,0,18.29153294,4.58043756,23.74873399,12.30520594l20.99748201,29.75019271h-170.7763187c-13.15175211,0-24.92787822,8.17828184-29.50831579,20.51372816l-53.80126132,144.51816352h0l.00001153-.01513172ZM201.25658839,207.07215861s-33.81664758-17.52055313-26.69655421-49.3720026l44.8520285-124.30679305C226.65308874,13.36338865,245.67022938,0,266.95491429,0h135.9166086c9.44810109,0,18.29153294,4.58043756,23.74875705,12.30520594l20.99745894,29.75019271h-163.02130994c-13.15130994,0-24.92786669,8.17828184-29.50831579,20.51372816l-53.80126132,144.51816352h-.03022885l-.0000346-.01513172Z" fill="url(#hypit-callback-mark)"/></svg>`;

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function hypiHubOAuthOrigin(): string {
  const configured = process.env.HYPIHUB_BASE_URL?.trim() || "https://hypit.ai";
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("HYPIHUB_BASE_URL must be an HTTP(S) URL");
  }
  return url.origin;
}

async function hypiHubOAuthLogin(io: CliIo): Promise<string> {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(24));
  const server = createServer();
  const callback = new Promise<string>((resolveCode, reject) => {
    let settled = false;
    let closeRequested = false;
    const closeServer = (): void => {
      if (closeRequested) return;
      closeRequested = true;
      server.close();
      server.closeIdleConnections?.();
    };
    const closeAllConnections = (): void => {
      server.closeAllConnections?.();
      server.unref();
    };
    server.on("request", (request, response) => {
      // Browsers commonly fetch /favicon.ico after rendering the callback.
      // The old one-shot listener left that second connection unanswered,
      // keeping the local server (and therefore the CLI) alive forever after
      // a successful login.
      if (settled) {
        response.writeHead(204, { "cache-control": "no-store", connection: "close" });
        response.end();
        return;
      }
      try {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/callback") throw new Error("unexpected OAuth callback path");
        if (url.searchParams.get("state") !== state) throw new Error("HypiHub OAuth state mismatch");
        const error = url.searchParams.get("error");
        if (error !== null) throw new Error(`HypiHub OAuth authorization failed: ${error}`);
        const code = url.searchParams.get("code");
        if (code === null || code.length === 0) throw new Error("HypiHub OAuth callback contained no code");
        response.writeHead(200, {
          "cache-control": "no-store",
          connection: "close",
          "content-type": "text/html; charset=utf-8",
        });
        response.end(oauthCallbackPage(true), closeAllConnections);
        settled = true;
        resolveCode(code);
      } catch (error) {
        response.writeHead(400, {
          "cache-control": "no-store",
          connection: "close",
          "content-type": "text/html; charset=utf-8",
        });
        response.end(oauthCallbackPage(false), closeAllConnections);
        settled = true;
        reject(error);
      } finally {
        // Resolve the OAuth operation immediately; a browser may keep the
        // callback connection around for its favicon request. The server is
        // closed and unref'ed so that request cannot keep the CLI alive.
        closeServer();
        server.unref();
      }
    });
    server.once("error", reject);
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen());
    server.once("error", rejectListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("could not open a local OAuth callback");
  const redirectUri = `http://127.0.0.1:${address.port}/callback`;
  // Open the site's SPA consent surface rather than the protocol endpoint.
  // The latter can only read a browser session from an Authorization header,
  // while the login page stores the session in localStorage. Returning there
  // after login would therefore bounce straight back to /login forever. The
  // consent page reads that localStorage token and calls /oauth/authorize with
  // the required header.
  const oauthOrigin = hypiHubOAuthOrigin();
  const authorize = new URL("/oauth/consent", oauthOrigin);
  authorize.search = new URLSearchParams({
    response_type: "code", client_id: HYPIHUB_OAUTH_CLIENT_ID, redirect_uri: redirectUri,
    scope: "user:profile user:inference", state, code_challenge: challenge, code_challenge_method: "S256",
  }).toString();
  io.write(`Opening HypiHub login: ${authorize}\n`);
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const openerArgs = process.platform === "win32" ? ["/c", "start", "", authorize.toString()] : [authorize.toString()];
  spawn(opener, openerArgs, { stdio: "ignore", detached: true, windowsHide: true }).unref();
  const code = await callback;
  const tokenResponse = await fetch(new URL("/oauth/token", oauthOrigin), {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: HYPIHUB_OAUTH_CLIENT_ID, code_verifier: verifier }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await tokenResponse.text();
  if (!tokenResponse.ok) throw new Error(`HypiHub OAuth token exchange failed (${tokenResponse.status}): ${body.slice(0, 200)}`);
  const parsed = JSON.parse(body) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    expires_at?: unknown;
  };
  if (typeof parsed.access_token !== "string" || parsed.access_token.length === 0) throw new Error("HypiHub OAuth returned no access token");
  const expiresAt = typeof parsed.expires_at === "number" && Number.isFinite(parsed.expires_at)
    ? (parsed.expires_at > 10_000_000_000 ? parsed.expires_at : parsed.expires_at * 1_000)
    : typeof parsed.expires_in === "number" && Number.isFinite(parsed.expires_in) && parsed.expires_in > 0
      ? Date.now() + parsed.expires_in * 1_000
      : undefined;
  return JSON.stringify({
    format: "hypit.hypihub-oauth@1",
    accessToken: parsed.access_token,
    ...(typeof parsed.refresh_token === "string" && parsed.refresh_token.length > 0 ? { refreshToken: parsed.refresh_token } : {}),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  });
}

/**
 * The loopback callback is the last screen a person sees during login. Keep it
 * self-contained: relying on a remote stylesheet or image makes a successful
 * login look broken when the network is settling, and the old plain-text body
 * had no visual identity at all.
 */
function oauthCallbackPage(success: boolean): string {
  const title = success ? "Signed in to Hypit" : "Hypit sign-in failed";
  const heading = success ? "Hypit is signed in" : "Hypit sign-in failed";
  const message = success
    ? "Your HypiHub session is ready. You can close this window."
    : "The sign-in could not be completed. You can close this window and try again.";
  const tone = success ? "success" : "error";
  const favicon = `data:image/svg+xml,${encodeURIComponent(HYPIHUB_MARK_SVG)}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <link rel="icon" href="${favicon}">
    <title>${title}</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: #18181b; background: #f7f6f3; }
      main { width: min(100% - 48px, 560px); padding: 48px 42px 52px; border: 1px solid #e2dfdb; border-radius: 16px; background: #fff; box-shadow: 0 18px 50px rgba(24,24,27,.08); }
      .brand { display: inline-flex; align-items: center; gap: 10px; color: #18181b; font-size: 18px; font-weight: 650; letter-spacing: -.04em; }
      .brand svg { width: 28px; height: 28px; }
      .wordmark { background: linear-gradient(110deg, #e83f5f, #f6a9bd); -webkit-background-clip: text; background-clip: text; color: transparent; }
      .mark { width: 58px; height: 58px; margin: 72px 0 28px; display: grid; place-items: center; border: 1px solid #ddd9d5; border-radius: 14px; background: #fff; color: #e83f5f; }
      .mark.success { color: #e83f5f; }
      .mark.error { color: #c73d45; border-color: #e2c9c9; background: #fffafa; }
      h1 { margin: 0; font-size: clamp(26px, 7vw, 34px); line-height: 1.08; letter-spacing: -.035em; }
      p { margin: 14px 0 0; color: #66636a; font-size: 15px; line-height: 1.6; }
      @media (prefers-color-scheme: dark) {
        body { color: #f7f2f4; background: #111114; }
        .brand { color: #f7f2f4; }
        main { border-color: #3a3036; background: #19171b; box-shadow: 0 24px 70px rgba(0,0,0,.36); }
        .mark { border-color: #3a3036; background: #19171b; }
        .mark.error { border-color: #6b3f40; background: #291d1e; }
        p { color: #bdb3b8; }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="brand" aria-label="Hypit">
        ${HYPIHUB_MARK_SVG}
        <span class="wordmark">hypit</span>
      </div>
      <div class="mark ${tone}" aria-hidden="true">
        ${success ? '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="m5 12 4 4L19 6"/></svg>' : '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M6 6 18 18M18 6 6 18"/></svg>'}
      </div>
      <h1>${heading}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`;
}

async function nearestProjectPackageRoot(start: string): Promise<string | undefined> {
  let directory = resolve(start);
  while (true) {
    const candidate = resolve(directory, "package.json");
    try {
      if ((await stat(candidate)).isFile()) return directory;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

async function resolvePackageRoot(projectStart: string): Promise<string> {
  // The Distribution is a separate read-only fallback. Package discovery must
  // retain the project root even when this lightweight project has no package.json.
  return await nearestProjectPackageRoot(projectStart) ?? resolve(projectStart);
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...tail] = argv;
  const scoped = command === "programs" || command === "runtime" || command === "auth"
    || command === "packages";
  const action = scoped ? tail[0] : undefined;
  const positional = scoped ? tail.slice(1) : tail;
  const noFile = command === "builds" || command === "queue" || command === "paths"
    || command === "image";
  const hasFile = !noFile && positional[0] !== undefined && !positional[0]!.startsWith("--");
  const file = hasFile ? positional[0] : undefined;
  const rest = noFile || !hasFile ? positional : positional.slice(1);
  let workspaceRoot: string | undefined;
  const assetRoots: string[] = [];
  let packageRoot: string | undefined;
  let runtime: string | undefined;
  let follow = false;
  let pin = false;
  let excludeTargets = false;
  let maxWaitMs: number | undefined;
  let record: string | undefined;
  let output: string | undefined;
  let name: string | undefined;
  let artifact: string | undefined;
  let to: string | undefined;
  let prompt: string | undefined;
  let model: string | undefined;
  let aspectRatio: string | undefined;
  let resolution: string | undefined;
  let json = false;
  let color: CliColorMode = "auto";
  let verbose = false;
  let watch = false;
  let jsonl = false;
  let readyFile: string | undefined;
  let reason: string | undefined;
  let slot: string | undefined;
  let from: string | undefined;
  let source: string | undefined;
  const seenOptions = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index]!;
    if (item.startsWith("--")) {
      const repeatable = [
        "--json", "--jsonl", "--watch", "--verbose", "--debug",
        "--no-color", "--follow", "--asset-root",
      ].includes(item);
      if (!repeatable && seenOptions.has(item)) throw new Error(`${item} cannot be repeated`);
      seenOptions.add(item);
    }
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--jsonl") {
      jsonl = true;
      continue;
    }
    if (item === "--watch") {
      watch = true;
      continue;
    }
    if (item === "--verbose") {
      verbose = true;
      continue;
    }
    if (item === "--debug") {
      continue;
    }
    if (item === "--no-color") {
      color = "never";
      continue;
    }
    if (item === "--color") {
      const value = rest[index + 1];
      if (value !== "auto" && value !== "always" && value !== "never") {
        throw new Error("--color requires auto, always or never");
      }
      color = value;
      index += 1;
      continue;
    }
    if (item === "--workspace") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--workspace requires a directory");
      workspaceRoot = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--asset-root") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--asset-root requires a directory");
      assetRoots.push(resolve(value));
      index += 1;
      continue;
    }
    if (item === "--package-root") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--package-root requires a directory");
      packageRoot = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--runtime") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--runtime requires a Runtime Profile");
      runtime = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--out") {
      throw new Error("--out was removed: Build always archives accepted Records; use `get <build-id> --to <path>` for an optional copy");
    }
    if (item === "--record") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--record requires a Record id");
      record = value;
      index += 1;
      continue;
    }
    if (item === "--output") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--output requires a Logical Output id");
      output = value;
      index += 1;
      continue;
    }
    if (item === "--name") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--name requires a source output name");
      name = value;
      index += 1;
      continue;
    }
    if (item === "--artifact") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--artifact requires a content digest");
      artifact = value;
      index += 1;
      continue;
    }
    if (item === "--to") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--to requires a file path");
      to = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--prompt") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--prompt requires text or a text file path");
      prompt = value;
      index += 1;
      continue;
    }
    if (item === "--model") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--model requires an installed package specifier");
      model = value;
      index += 1;
      continue;
    }
    if (item === "--aspect-ratio") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--aspect-ratio requires a ratio the model accepts");
      aspectRatio = value;
      index += 1;
      continue;
    }
    if (item === "--resolution") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--resolution requires a resolution the model accepts");
      resolution = value;
      index += 1;
      continue;
    }
    if (item === "--follow") {
      follow = true;
      continue;
    }
    if (item === "--pin") {
      pin = true;
      continue;
    }
    if (item === "--exclude-targets") {
      excludeTargets = true;
      continue;
    }
    if (item === "--max-wait-ms") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--max-wait-ms requires milliseconds");
      maxWaitMs = Number(value);
      if (!Number.isSafeInteger(maxWaitMs) || maxWaitMs < 0) {
        throw new Error("--max-wait-ms must be a non-negative safe integer");
      }
      index += 1;
      continue;
    }
    if (item === "--ready-file") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--ready-file requires a path");
      readyFile = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--reason") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--reason requires text");
      reason = value;
      index += 1;
      continue;
    }
    if (item === "--slot") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--slot requires a credential slot");
      slot = value;
      index += 1;
      continue;
    }
    if (item === "--from") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--from requires a credential file");
      from = resolve(value);
      index += 1;
      continue;
    }
    if (item === "--source") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("--source requires a source path");
      source = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`unknown option ${item}`);
  }
  return {
    command,
    action,
    file,
    workspaceRoot,
    assetRoots,
    packageRoot,
    runtime,
    follow,
    pin,
    excludeTargets,
    maxWaitMs,
    record,
    output,
    name,
    artifact,
    to,
    prompt,
    model,
    aspectRatio,
    resolution,
    json,
    color,
    verbose,
    watch,
    jsonl,
    readyFile,
    reason,
    slot,
    from,
    source,
    seenOptions: [...seenOptions],
  };
}

function assertCommandOptions(args: ParsedArgs): void {
  const common = ["--json", "--color", "--no-color", "--verbose", "--debug"];
  const allowed = new Set(common);
  const add = (...items: readonly string[]): void => { for (const item of items) allowed.add(item); };
  switch (args.command) {
    case "programs":
      // This command has older, more specific diagnostics for deployment-selection
      // flags and waiting on status/down; let its handler render those repairs.
      add("--max-wait-ms", "--runtime");
      break;
    case "runtime":
      add("--runtime");
      if (args.action === "up" || args.action === "down") add("--max-wait-ms");
      break;
    case "packages":
      break;
    case "auth":
      add("--runtime", "--slot");
      if (args.action === "login") add("--from");
      break;
    case "queue":
      add("--runtime", "--watch", "--jsonl");
      break;
    case "paths":
      add("--runtime");
      break;
    case "get":
      add("--runtime", "--name", "--record", "--output", "--artifact", "--to");
      break;
    case "image":
      // A package asset needs credentials and nothing else; no Runtime Profile applies.
      add("--prompt", "--to", "--model", "--aspect-ratio", "--resolution");
      break;
    case "cancel":
      add("--runtime", "--reason");
      break;
    case "status":
      add("--runtime", "--watch");
      if (args.watch) add("--max-wait-ms");
      break;
    case "builds":
    case "history":
    case "inspect":
      add("--runtime");
      if (args.command === "history") add("--source", "--pin", "--exclude-targets");
      break;
    case "check":
    case "plan":
    case "quote":
      add("--runtime", "--package-root", "--workspace", "--asset-root");
      break;
    case "build":
      add("--runtime", "--package-root", "--workspace", "--asset-root", "--follow",
        "--max-wait-ms");
      break;
  }
  const invalid = args.seenOptions.find((item) => !allowed.has(item));
  if (invalid !== undefined) {
    const command = args.action === undefined ? args.command : `${args.command} ${args.action}`;
    if (args.command === "doctor" && invalid === "--workspace") {
      throw new Error("doctor does not compile a Source Workspace; remove --workspace");
    }
    throw new Error(`${invalid} does not apply to ${command}`);
  }
  if (args.seenOptions.includes("--color") && args.seenOptions.includes("--no-color")) {
    throw new Error("--color and --no-color are mutually exclusive");
  }
}

function usage(): string {
  return [
    "usage:",
    "  hypit doctor [<runtime-profile>]",
    "  hypit programs up|down|status [<runtime-profile>] [--max-wait-ms milliseconds]",
    "  hypit runtime use <runtime-profile>",
    "  hypit runtime unset",
    "  hypit runtime up|status|logs|down [<runtime-profile>]",
    "  hypit packages install|status <package@exact-version>",
    "  hypit queue [--runtime profile.json] [--watch]",
    "  hypit check <self-described-source> [--runtime profile.json] [--workspace workspace] [--asset-root directory]",
    "  hypit plan <run-source> [--runtime profile.json] [--workspace workspace] [--asset-root directory]",
    "  hypit quote <run-source> --runtime profile.json",
    "  hypit build <run-source> [--runtime profile.json] [--workspace workspace] [--asset-root directory] [--follow]",
    "  hypit status <build-id> [--runtime profile.json] [--watch]",
    "  hypit builds [--runtime profile.json]",
    "  hypit history [source-output-name] [--runtime profile.json] [--source author.svml] [--pin] [--exclude-targets]",
    "  hypit inspect <build-id> [--runtime profile.json]",
    "  hypit get <build-id> [--runtime profile.json] [--name source-name|--record record-id|--output logical-output-id|--artifact digest] [--to path]",
    "  hypit cancel <build-id> [--runtime profile.json] [--reason text]",
    "  hypit auth status|login|logout <endpoint-instance> [--runtime profile.json] [--slot name] [--from secret-file]",
    "  hypit image --prompt <text|text-file> --to <path.png> [--model package] [--aspect-ratio r] [--resolution r]",
    "",
    "output:",
    "  --json  --verbose  --color auto|always|never  --no-color  --debug",
  ].join("\n");
}

/**
 * A prompt is either the text itself or a file holding it. A long prompt lives in a file
 * beside the asset it describes, so it can be edited and reread; a short one does not
 * deserve a file.
 */
async function readPromptText(value: string): Promise<string> {
  const path = resolve(value);
  const isFile = await stat(path).then((item) => item.isFile(), () => false);
  const prompt = (isFile ? await readFile(path, "utf8") : value).trim();
  if (prompt.length === 0) {
    throw new Error(isFile ? `prompt file ${path} is empty` : "--prompt is empty");
  }
  return prompt;
}

function createCatalogDescriptor(options: {
  readonly source: string;
  readonly compilation: NodeCompiledSourceClosure;
  readonly run?: { readonly path: string };
}): BuildCatalogDescriptor {
  const aliases = options.compilation.exports.map((item) => {
    if (item.ref.kind === "operation-result") {
      throw new Error(`public output ${item.name} was not lowered to a stable Record or Logical Output`);
    }
    return { name: item.name, ref: item.ref };
  });
  return {
    source: {
      path: resolve(options.source),
    },
    ...(options.run === undefined ? {} : { run: {
      path: resolve(options.run.path),
    } }),
    aliases,
  };
}

function demandedCapabilities(state: BuildState): readonly CapabilityRef[] {
  const found = new Map(plannedNeeds(state).map((need) => [capabilityName(need.capability), need.capability]));
  return [...found.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
}

function capabilityName(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

async function preflightPlan(
  host: NodeRuntimeHost,
  state: BuildState,
) {
  const capabilities = demandedCapabilities(state);
  const result = await host.preflight({ capabilities });
  return {
    ok: !result.diagnostics.some((item) => item.severity === "error"),
    dataRoot: result.dataRoot,
    capabilities: capabilities.map(capabilityName),
    diagnostics: result.diagnostics,
  } as const;
}

function assertPreflight(
  preflight: Awaited<ReturnType<typeof preflightPlan>>,
): void {
  if (preflight === undefined || preflight.ok) return;
  const errors = preflight.diagnostics.filter((item) => item.severity === "error");
  throw new Error([
    `Runtime preflight failed for ${errors.length} demanded deployment requirement${errors.length === 1 ? "" : "s"}:`,
    ...errors.map((item) => `  ${item.code}${item.subject === undefined ? "" : ` (${item.subject})`}: ${item.message}`),
    "No Build was submitted and no external capability request was made.",
  ].join("\n"));
}

async function loadRuntime(host: NodeRuntimeHost): Promise<CliRuntime> {
  return await host.createRuntime();
}

async function loadRuntimeArchive(
  host: NodeRuntimeHost,
  readOnly = true,
): Promise<CliRuntimeArchiveControl> {
  return await host.openArchive({ readOnly });
}

async function loadRuntimeArtifactAccess(
  host: NodeRuntimeHost,
): Promise<CliRuntimeArtifactAccess> {
  return await host.openArtifacts();
}

function displayType(type: TypeRef): string {
  return `${type.module.name}@${type.module.version}/${type.name}`;
}

function submissionStatus(
  dispatch: NonNullable<Awaited<ReturnType<CliRuntime["status"]>>["dispatch"]>,
): CliBuildSubmission["status"] {
  return dispatch.phase === "terminal"
    ? dispatch.terminal!
    : dispatch.phase;
}

function formatOperationProgress(progress: OperationProgress): string {
  if (progress.completed === undefined) return progress.phase;
  const amount = progress.total === undefined
    ? String(progress.completed)
    : `${progress.completed}/${progress.total}`;
  return `${progress.phase} · ${amount}${progress.unit === undefined ? "" : ` ${progress.unit}`}`;
}

type QueueLaneSummary = {
  readonly pool: string;
  readonly lane: string;
  readonly inFlight: number;
};

/** Derive the Provider → capability view from generic tickets; no model registry participates. */
function summarizeQueueLanes(capacity: readonly CapacityReservation[]): readonly QueueLaneSummary[] {
  const groups = new Map<string, QueueLaneSummary>();
  for (const ticket of capacity) {
    if (ticket.queue === undefined) continue;
    const key = `${ticket.queue.pool}\u0000${ticket.queue.lane}`;
    const previous = groups.get(key);
    groups.set(key, {
      pool: ticket.queue.pool,
      lane: ticket.queue.lane,
      inFlight: (previous?.inFlight ?? 0) + 1,
    });
  }
  return [...groups.values()].sort((left, right) =>
    left.pool.localeCompare(right.pool) || left.lane.localeCompare(right.lane));
}

function queueLaneLines(groups: readonly QueueLaneSummary[]): readonly string[] {
  const lines: string[] = [];
  let pool: string | undefined;
  for (const group of groups) {
    if (group.pool !== pool) {
      pool = group.pool;
      lines.push(pool);
    }
    lines.push(`  ${group.lane}: ${group.inFlight} remote`);
  }
  return lines;
}

function programLine(program: CliManagedProgramReport): string {
  const stateDetail = "detail" in program.state ? ` — ${program.state.detail}` : "";
  const action = program.action === undefined ? "" : ` · ${program.action}`;
  const detail = program.detail === undefined ? "" : ` · ${program.detail}`;
  const instances = program.instances.length === 0 ? "" : ` · ${program.instances.join(", ")}`;
  const pid = program.pid === undefined ? "" : ` · pid ${program.pid}`;
  const log = program.logPath === undefined ? "" : ` · log ${program.logPath}`;
  return `${program.id}: ${program.state.state}${stateDetail}${action}${detail}${instances}${pid}${log}`;
}

function inlineValuePreview(value: unknown, limit = 240): string {
  const encoded = JSON.stringify(value);
  if (encoded.length <= limit) return encoded;
  return `${encoded.slice(0, Math.max(0, limit - 3))}...`;
}

async function observeBuild(
  runtime: Pick<CliRuntimeArchiveControl, "activity" | "status">,
  initial: CliBuildSubmission,
  options: {
    readonly maxWaitMs?: number;
    readonly controller?: CliRuntimeController;
    readonly onProgress?: (value: {
      readonly build: string;
      readonly phase: string;
      readonly operations: Readonly<Record<string, number>>;
      readonly activity: readonly string[];
    }) => void;
  },
): Promise<CliBuildSubmission> {
  let current = initial;
  let lastProgress: string | undefined;
  let pollDelayMs = 100;
  let observedActivity = false;
  const startedAt = Date.now();
  while (current.status !== "complete" && current.status !== "failed" && current.status !== "cancelled") {
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = options.maxWaitMs === undefined
      ? undefined
      : options.maxWaitMs - elapsedMs;
    if (remainingMs !== undefined && remainingMs <= 0) break;
    const waitMs = remainingMs === undefined
      ? pollDelayMs
      : Math.min(pollDelayMs, remainingMs);
    await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
    const status = await runtime.activity(current.id);
    observedActivity = true;
    if (status.dispatch === undefined) {
      throw new Error(`Build ${current.id} disappeared while it was being observed`);
    }
    current = {
      id: current.id,
      state: current.state,
      status: submissionStatus(status.dispatch),
      dispatch: status.dispatch,
    };
    if (!["complete", "failed", "cancelled"].includes(current.status)
      && options.controller !== undefined) {
      const worker = await options.controller.worker.status();
      if (worker.state !== "running") {
        throw new Error(
          `Runtime Worker is ${worker.state}; Build ${current.id} remains durable. `
          + `Run hypit runtime up, then run hypit status ${current.id} --watch again`,
        );
      }
    }
    const operations = Object.fromEntries([...new Set(status.operations.map((item) => item.status))]
      .sort().map((state) => [state, status.operations.filter((item) => item.status === state).length]));
    const activity = status.operations
      .filter((item) => item.status === "pending")
      .map((item) => `${item.endpoint}: ${item.progress === undefined
        ? item.status
        : formatOperationProgress(item.progress)}`);
    const nextProgress = JSON.stringify({
      phase: status.dispatch.phase,
      terminal: status.dispatch.terminal,
      operations,
      activity: status.operations.map((item) => ({
        id: item.id,
        status: item.status,
        progress: item.progress,
      })),
    });
    if (nextProgress !== lastProgress) {
      lastProgress = nextProgress;
      pollDelayMs = 100;
      options.onProgress?.({
        build: current.id,
        phase: status.dispatch.phase,
        operations,
        activity,
      });
    } else {
      pollDelayMs = Math.min(1_000, pollDelayMs * 2);
    }
  }
  if (observedActivity) {
    const status = await runtime.status(current.id);
    if (status.build === undefined || status.dispatch === undefined) {
      throw new Error(`Build ${current.id} disappeared while it was being observed`);
    }
    current = {
      id: current.id,
      state: status.build.state,
      status: submissionStatus(status.dispatch),
      dispatch: status.dispatch,
    };
  }
  return current;
}

type RuntimeArchiveView = Pick<CliRuntimeArchiveControl, "status" | "close">;

/**
 * A Run Source needs the archive only when it names a historical Build Candidate.
 * Delay Store assembly until that edge is actually resolved.
 */
function lazyRuntimeArchive(
  host: NodeRuntimeHost,
): RuntimeArchiveView {
  let loading: Promise<CliRuntimeArchiveControl> | undefined;
  const open = (): Promise<CliRuntimeArchiveControl> => {
    loading ??= loadRuntimeArchive(host);
    return loading;
  };
  return {
    async status(build) {
      return await (await open()).status(build);
    },
    async close() {
      if (loading !== undefined) await (await loading).close();
    },
  };
}

export async function runCli(
  argv: readonly string[],
  io: CliIo,
  distribution: CliDistribution,
): Promise<void> {
  if (argv.length === 0 || argv[0] === "help" || argv.includes("--help")) {
    const topic = argv[0] === "help" ? argv[1] : argv.includes("--help") ? argv[0] : undefined;
    writeCliHelp(io, topic);
    return;
  }
  let args = parseArgs(argv);
  let selectedRuntimeProjectRoot: string | undefined;
  const commandProjectRoot = (): string => args.workspaceRoot
    ?? selectedRuntimeProjectRoot
    ?? ((args.command === "check" || args.command === "plan" || args.command === "build" || args.command === "quote")
      && args.file !== undefined
      ? dirname(resolve(args.file))
      : process.cwd());
  const packageRootForProject = async (projectRoot = commandProjectRoot()): Promise<string> =>
    args.packageRoot ?? await resolvePackageRoot(projectRoot);
  const writeOperational = (
    machine: unknown,
    title: string,
    status: "success" | "warning" | "error" | "info" = "info",
    facts: readonly (readonly [string, string])[] = [],
    lines: readonly string[] = [],
  ): void => writeCliOutput(io, {
    json: args.json || args.jsonl,
    jsonl: args.jsonl,
    color: args.color,
    verbose: args.verbose,
  }, { kind: "operational", machine, title, status, facts, lines });
  const reportProgramProgress = args.json || args.jsonl
    ? undefined
    : (event: CliManagedProgramProgress): void => {
      const verb = {
        checking: "Checking",
        installing: "Installing",
        starting: "Starting",
        waiting: "Waiting for",
        ready: "Ready",
      }[event.phase];
      io.write(`  · ${verb} ${event.id}\n`);
    };
  const reportPackageProgress = args.json || args.jsonl
    ? undefined
    : (event: { readonly specifier: string; readonly phase: "checking" | "installing" | "ready" }): void => {
      if (event.phase === "installing") io.write(`  · Installing ${event.specifier}\n`);
    };
  const runtimeHosts = new Map<string, Promise<NodeRuntimeHost>>();
  const runtimeHost = async (path: string, requestedPackageRoot?: string): Promise<NodeRuntimeHost> => {
    const profile = resolve(path);
    const packageRoot = requestedPackageRoot ?? await packageRootForProject();
    const key = `${profile}\u0000${packageRoot}`;
    let opened = runtimeHosts.get(key);
    if (opened === undefined) {
      opened = distribution.openRuntimeHost(profile, {
        packageRoot,
        ...(distribution.packageRoot === undefined
          ? {}
          : { distributionPackageRoot: distribution.packageRoot }),
      });
      runtimeHosts.set(key, opened);
    }
    return await opened;
  };
  if (args.command === "_worker") {
    if (args.file === undefined || args.readyFile === undefined) throw new Error("internal Worker launch is incomplete");
    await (await runtimeHost(args.file, await packageRootForProject())).runWorker(args.readyFile);
    return;
  }
  if (args.command === "runtime" && args.action === "use") {
    if (args.runtime !== undefined) {
      throw new Error("runtime use takes the Runtime Profile positionally, not through --runtime");
    }
    if (args.file === undefined) throw new Error("runtime use requires a Runtime Profile");
    assertCommandOptions(args);
    const profile = resolve(args.file);
    const selected = await selectRuntimeProfile(args.workspaceRoot ?? process.cwd(), profile);
    writeOperational({
      format: "hypit.cli-runtime-selection@1",
      profile: selected.profile,
      project: selected.projectRoot,
      selectionFile: selected.selectionFile,
    }, "Runtime selected", "success", [
      ["Profile", selected.profile],
      ["Project", selected.projectRoot],
    ]);
    return;
  }
  if (args.command === "runtime" && args.action === "unset") {
    if (args.file !== undefined || args.runtime !== undefined) {
      throw new Error("runtime unset does not take a Runtime Profile");
    }
    assertCommandOptions(args);
    const cleared = await clearRuntimeProfile(process.cwd());
    writeOperational({
      format: "hypit.cli-runtime-selection@1",
      selected: false,
      removed: cleared !== undefined,
      profile: cleared?.profile,
      project: cleared?.projectRoot,
    }, cleared === undefined ? "No Runtime was selected" : "Runtime selection removed",
    cleared === undefined ? "info" : "success", cleared === undefined ? [] : [
      ["Profile", cleared.profile], ["Project", cleared.projectRoot],
    ]);
    return;
  }

  const positionalRuntime = (args.command === "runtime" || args.command === "programs"
    || args.command === "doctor") && args.file !== undefined;
  const runtimeWasExplicit = args.runtime !== undefined || positionalRuntime;
  let runtimeNeedsHint = runtimeWasExplicit;
  if (args.runtime === undefined && !positionalRuntime) {
    const sourceScoped = args.command === "check" || args.command === "plan" || args.command === "build" || args.command === "quote";
    const start = sourceScoped && args.file !== undefined ? dirname(resolve(args.file)) : process.cwd();
    const selected = await findRuntimeProfile(start);
    if (selected !== undefined) {
      args = { ...args, runtime: selected.profile };
      selectedRuntimeProjectRoot = selected.projectRoot;
      const cwdFromProject = relative(selected.projectRoot, resolve(process.cwd()));
      runtimeNeedsHint = cwdFromProject === ".." || cwdFromProject.startsWith(`..${sep}`)
        || isAbsolute(cwdFromProject);
    }
  }
  const known = args.command === "check" || args.command === "plan"
    || args.command === "build" || args.command === "quote" || args.command === "status" || args.command === "builds"
    || args.command === "history"
    || args.command === "inspect" || args.command === "get" || args.command === "cancel"
    || args.command === "doctor" || args.command === "programs"
    || args.command === "runtime" || args.command === "queue" || args.command === "paths"
    || args.command === "image" || args.command === "packages";
  const operational = known || args.command === "auth";
  const fileOptional = args.command === "builds" || args.command === "history" || args.command === "queue"
    || args.command === "paths" || args.command === "image"
    || args.command === "programs" || args.command === "runtime" || args.command === "doctor";
  if (!operational || (!fileOptional && args.file === undefined)) {
    throw new Error(usage());
  }
  if (args.watch && args.command !== "queue" && args.command !== "status") {
    throw new Error("--watch applies only to status or queue");
  }
  if (args.jsonl && (args.command !== "queue" || !args.watch)) {
    throw new Error("--jsonl applies only to queue --watch");
  }
  if (args.command === "queue" && args.watch && args.json) {
    throw new Error("queue --watch is a stream; use --jsonl instead of --json");
  }
  if (args.command === "history" && args.file === undefined && args.source === undefined) {
    throw new Error("history requires an output name or --source path");
  }
  assertCommandOptions(args);
  if (args.excludeTargets && !args.pin) {
    throw new Error("--exclude-targets requires history --pin");
  }
  const runtimeController = async (profile: string, source?: string): Promise<CliRuntimeController> => {
    const workspaceRoot = args.workspaceRoot
      ?? selectedRuntimeProjectRoot
      ?? (source === undefined ? process.cwd() : dirname(resolve(source)));
    const packageRoot = await packageRootForProject(workspaceRoot);
    return await (await runtimeHost(profile, packageRoot)).controller({
      packageRoot,
    });
  };
  if (args.command === "image") {
    if (args.prompt === undefined) throw new Error("image requires --prompt with text or a text file path");
    if (args.to === undefined) throw new Error("image requires --to with the file to write");
    if (distribution.generatePicture === undefined) {
      throw new Error("this Distribution cannot generate a picture directly");
    }
    const picture = await distribution.generatePicture({
      prompt: await readPromptText(args.prompt),
      packageRoot: await packageRootForProject(process.cwd()),
      ...(distribution.packageRoot === undefined
        ? {}
        : { distributionPackageRoot: distribution.packageRoot }),
      ...(args.model === undefined ? {} : { model: args.model }),
      ...(args.aspectRatio === undefined ? {} : { aspectRatio: args.aspectRatio }),
      ...(args.resolution === undefined ? {} : { resolution: args.resolution }),
    });
    await mkdir(dirname(args.to), { recursive: true });
    await writeFile(args.to, picture.bytes);
    writeOperational({
      format: "hypit.cli-image@1",
      package: picture.package,
      model: picture.model,
      mediaType: picture.mediaType,
      size: picture.bytes.byteLength,
      path: args.to,
    }, "Picture written", "success", [
      ["Model", picture.model],
      ["Package", picture.package],
      ["Type", picture.mediaType],
      ["Bytes", String(picture.bytes.byteLength)],
      ["Path", args.to],
    ], ["This picture is authoring input; no Build, Record or Runtime Profile took part."]);
    return;
  }
  if (args.command === "paths") {
    const projectRoot = selectedRuntimeProjectRoot ?? process.cwd();
    const runtimePaths = args.runtime === undefined
      ? undefined
      : await (await runtimeHost(args.runtime)).resolvePaths();
    const machine = {
      format: "hypit.cli-paths@1" as const,
      project: projectRoot,
      projectState: hypitProjectStateRoot(projectRoot),
      profile: args.runtime,
      runtimeData: runtimePaths?.runtimeDataRoot,
      hostState: hypitHostStateRoot(),
      machinePackages: hypitHostPackageRoot(),
      distribution: distribution.packageRoot,
    };
    writeOperational(machine, "Hypit paths", "info", [
      ["Project", machine.project],
      ["Project state", machine.projectState],
      ["Runtime Profile", machine.profile ?? "not selected"],
      ["Runtime data", machine.runtimeData ?? "not selected"],
      ["Host state", machine.hostState],
      ["Machine packages", machine.machinePackages],
      ["Distribution", machine.distribution ?? "embedded"],
    ]);
    return;
  }
  if (args.command === "packages") {
    if (args.action !== "install" && args.action !== "status") {
      throw new Error("packages takes install or status");
    }
    if (args.file === undefined) throw new Error(`packages ${args.action} requires package@exact-version`);
    const root = hypitHostPackageRoot();
    const existing = await inspectHostPackage(args.file, root);
    const reports = args.action === "install"
      ? await prepareHostPackages([args.file], {
        root,
        ...(reportPackageProgress === undefined ? {} : { onProgress: reportPackageProgress }),
      })
      : existing === undefined ? [] : [existing];
    const ready = reports.length === 1;
    writeOperational({
      format: "hypit.cli-packages-status@1",
      ok: ready,
      root,
      packages: reports,
    }, args.action === "install" ? "Machine package is ready" : "Machine package status",
    ready ? "success" : "warning", [
      ["Package", args.file],
      ["Root", root],
      ["Ready", String(ready)],
    ]);
    if (!ready) io.setExitCode?.(1);
    return;
  }
  if (args.command === "doctor") {
    if (args.packageRoot !== undefined) {
      throw new Error("doctor reads all deployment selection from the Runtime Profile itself");
    }
    const profileInput = args.runtime ?? args.file;
    if (profileInput === undefined) {
      throw new Error("doctor requires a Runtime Profile; run hypit runtime use <profile> or provide it positionally");
    }
    const profile = resolve(profileInput);
    const result = await (await runtimeHost(profile)).doctor();
    const machine = {
      format: "hypit.cli-doctor@1" as const,
      ok: !result.diagnostics.some((item) => item.severity === "error"),
      dataRoot: result.dataRoot,
      diagnostics: result.diagnostics,
    };
    writeCliOutput(io, args, { kind: "doctor", machine, profile });
    if (!machine.ok) io.setExitCode?.(1);
    return;
  }
  if (args.command === "programs") {
    if (args.file !== undefined && args.runtime !== undefined) {
      throw new Error("programs reads all deployment selection from the Runtime Profile itself; provide that Profile only once");
    }
    if (args.packageRoot !== undefined) {
      throw new Error("programs reads all deployment selection from the Runtime Profile itself");
    }
    if (args.action !== "up" && args.action !== "down" && args.action !== "status") {
      throw new Error("programs takes up, down or status");
    }
    if (args.action !== "up" && args.maxWaitMs !== undefined) {
      throw new Error("--max-wait-ms applies to programs up");
    }
    const profileInput = args.runtime ?? args.file;
    if (profileInput === undefined) throw new Error("programs requires a Runtime Profile");
    const profile = resolve(profileInput);
    const host = await runtimeHost(profile);
    const prepared = args.action === "up"
      ? await host.prepare(reportPackageProgress === undefined ? {} : { onProgress: reportPackageProgress })
      : [];
    const controller = await runtimeController(profile);
    const result = args.action === "up"
      ? await controller.programs.up({
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
        ...(reportProgramProgress === undefined ? {} : { onProgress: reportProgramProgress }),
      })
      : args.action === "down"
        ? await controller.programs.down()
        : await controller.programs.report();
    const ready = result.programs.every((item) => item.state.state === "ready");
    const desiredState = args.action === "down" ? !result.programs.some((item) => item.state.state === "ready") : ready;
    const machine = {
      format: "hypit.cli-programs-status@1" as const,
      // A successful status query is not a failed lifecycle action. `ready` carries readiness.
      ok: args.action === "status" ? true : desiredState,
      ready,
      dataRoot: result.dataRoot,
      packages: prepared,
      programs: result.programs,
    };
    const shownPrograms = args.verbose || args.action !== "status"
      ? result.programs
      : result.programs.filter((item) => item.state.state !== "ready");
    writeOperational(machine, `External programs ${args.action}`,
      args.action === "status" ? ready ? "success" : "info" : machine.ok ? "success" : "warning", [
      ["Data root", result.dataRoot],
      ["Programs", String(result.programs.length)],
      ["Ready", String(result.programs.filter((item) => item.state.state === "ready").length)],
    ], shownPrograms.map(programLine));
    if (args.action !== "status" && !machine.ok) io.setExitCode?.(1);
    return;
  }
  if (args.command === "runtime") {
    if (args.action !== "up" && args.action !== "down" && args.action !== "status" && args.action !== "logs") {
      throw new Error("runtime takes up, down, status or logs");
    }
    if (args.file !== undefined && args.runtime !== undefined) {
      throw new Error("runtime accepts the Runtime Profile either positionally or with --runtime, not both");
    }
    const profileInput = args.runtime ?? args.file;
    if (profileInput === undefined) throw new Error("runtime requires a Runtime Profile");
    const profile = resolve(profileInput);
    const controller = await runtimeController(profile);
    if (args.action === "up") {
      const packageRoot = await packageRootForProject();
      const host = await runtimeHost(profile, packageRoot);
      const prepared = await host.prepare(
        reportPackageProgress === undefined ? {} : { onProgress: reportPackageProgress },
      );
      // Read the Runtime Profile before starting the Worker or its programs.
      const validated = await loadRuntime(host);
      await validated.close();
      const external = await controller.programs.up({
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
        ...(reportProgramProgress === undefined ? {} : { onProgress: reportProgramProgress }),
      });
      const processState = await controller.worker.up({
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
      });
      const ok = processState.state === "running"
        && external.programs.every((item) => item.state.state === "ready");
      writeOperational({ ok, packages: prepared, worker: processState, programs: external.programs }, "Runtime is up",
        ok ? "success" : "warning", [
        ["Machine packages", String(prepared.length)],
        ["Worker", String(processState.pid)],
        ["External programs", String(external.programs.length)],
      ]);
      if (!ok) io.setExitCode?.(1);
      return;
    }
    if (args.action === "logs") {
      const logs = await controller.worker.logs();
      const lines = logs.text.length === 0 ? [] : logs.text.replace(/\n$/u, "").split("\n");
      const shown = args.verbose ? lines : lines.slice(-100);
      writeOperational({
        format: "hypit.cli-runtime-logs@1",
        path: logs.path,
        text: logs.text,
      }, "Runtime logs", "info", [
        ["Path", logs.path],
        ["Lines", String(lines.length)],
      ], shown.length === 0 ? ["No log output."] : shown);
      return;
    }
    if (args.action === "down") {
      const worker = await controller.worker.down({
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
      });
      writeOperational({ ok: true, worker }, "Runtime Worker is down", "success", [
        ["Worker", worker.state],
      ], ["External programs were left running. Stop them explicitly with hypit programs down."]);
      return;
    }
    // These are independent views over one Profile. Load them concurrently without inventing a
    // second registry; each selected package remains responsible for its own report.
    const runtimeLoading = loadRuntimeArchive(await runtimeHost(profile));
    let runtime: CliRuntimeArchiveControl | undefined;
    try {
      const loaded = await Promise.all([
        controller.worker.status(),
        controller.programs.report(),
        runtimeLoading,
      ]);
      const [worker, external, selectedRuntime] = loaded;
      runtime = selectedRuntime;
      const queue = await runtime.queue();
      const counts = Object.fromEntries(["queued", "running", "waiting", "terminal"]
        .map((phase) => [phase, queue.dispatches.filter((item) => item.phase === phase).length]));
      const lanes = summarizeQueueLanes(queue.capacity);
      const ready = worker.state === "running"
        && external.programs.every((item) => item.state.state === "ready");
      const active = ["queued", "running", "waiting"]
        .reduce((total, phase) => total + (counts[phase] ?? 0), 0);
      const attention = active > 0 && !ready;
      const unavailable = external.programs.filter((item) => item.state.state !== "ready");
      const machine = {
        format: "hypit.cli-runtime-status@1" as const,
        ok: true,
        ready,
        attention,
        worker,
        queue: { counts, lanes, capacity: queue.capacity },
        programs: external.programs,
      };
      writeOperational(machine, "Runtime status", attention ? "warning" : ready ? "success" : "info", [
        ["Worker", worker.state],
        ["Queued", String(counts.queued ?? 0)],
        ["Running", String(counts.running ?? 0)],
        ["Waiting", String(counts.waiting ?? 0)],
        ["Programs", `${external.programs.length - unavailable.length}/${external.programs.length} ready`],
        ["Capacity reservations", String(queue.capacity.length)],
      ], [
        ...unavailable.map(programLine),
        ...queueLaneLines(lanes),
      ]);
    } finally {
      if (runtime !== undefined) await runtime.close();
      else await runtimeLoading.then(async (loaded) => await loaded.close(), () => undefined);
    }
    return;
  }
  if (args.command === "auth") {
    if (args.action !== "status" && args.action !== "login" && args.action !== "logout") {
      throw new Error("auth takes status, login or logout");
    }
    if (args.runtime === undefined) {
      throw new Error("auth requires a Runtime; run hypit runtime use <profile> or pass --runtime <profile>");
    }
    if (args.from !== undefined && args.action !== "login") throw new Error("--from applies only to auth login");
    const runtime = await (await runtimeHost(args.runtime)).openCredentials(args.file!);
    try {
      let credentials = await runtime.credentials(args.file!);
      if (args.slot !== undefined) credentials = credentials.filter((item) => item.slot === args.slot);
      if (credentials.length === 0) throw new Error(`Endpoint ${args.file} has no matching credential`);
      if (args.slot === undefined && credentials.length > 1 && args.action !== "status") {
        throw new Error(`Endpoint ${args.file} has several credentials; select one with --slot`);
      }
      if (args.action === "status") {
        writeOperational({ endpoint: args.file, credentials }, "Credential status", "info", [
          ["Endpoint", args.file!],
          ["Configured", `${credentials.filter((item) => item.configured).length}/${credentials.length}`],
        ], credentials.map((item) => `${item.slot}: ${item.configured ? "configured" : "missing"} · ${item.writable ? "writable" : "read-only"}`));
      } else if (args.action === "login") {
        const [item] = credentials;
        if (item === undefined) throw new Error(`Endpoint ${args.file} has no matching credential`);
        if (!item.writable) {
          const source = item.ref.store === "env"
            ? `set ${item.ref.key} in the environment`
            : `configure ${item.ref.key} through CredentialStore ${item.ref.store}`;
          throw new Error(
            `CredentialStore ${item.ref.store} is read-only for ${item.label}; ${source}, `
            + "or select the writable OS CredentialStore in the Runtime Profile",
          );
        }
        const oauth = item.ref.store === "os" && /hypihub/iu.test(`${item.endpoint} ${item.ref.key}`);
        const raw = oauth && args.from === undefined
          ? await hypiHubOAuthLogin(io)
          : args.from === undefined
            ? await io.readSecret?.(`${item.label}: `)
            : await readFile(args.from, "utf8");
        if (raw === undefined) throw new Error("interactive credential input is unavailable; use --from <file>");
        const secret = raw.trim();
        if (secret.length === 0) throw new Error("credential input is empty");
        if (item.kind === "json") {
          try { JSON.parse(secret); } catch { throw new Error(`${item.label} is not valid JSON`); }
        }
        const stored = await runtime.putCredential(item.endpoint, item.slot, secret);
        writeOperational({ endpoint: args.file, stored }, "Credential stored", "success", [
          ["Endpoint", args.file!], ["Slot", stored.slot], ["Store", stored.ref.store],
        ]);
      } else {
        const [item] = credentials;
        if (item === undefined) throw new Error(`Endpoint ${args.file} has no matching credential`);
        const removed = await runtime.deleteCredential(item.endpoint, item.slot);
        writeOperational({ endpoint: args.file, ...removed }, removed.deleted ? "Credential removed" : "Credential was absent",
          removed.deleted ? "success" : "warning", [
            ["Endpoint", args.file!], ["Slot", removed.credential.slot], ["Store", removed.credential.ref.store],
          ]);
      }
    } finally {
      await runtime.close();
    }
    return;
  }
  if (args.command === "status" || args.command === "builds" || args.command === "inspect"
    || args.command === "history" || args.command === "get" || args.command === "cancel" || args.command === "queue"
  ) {
    if (args.runtime === undefined) {
      throw new Error(
        `${args.command} requires a Runtime; run hypit runtime use <profile> or pass --runtime <profile>`,
      );
    }
    const runtime = await loadRuntimeArchive(await runtimeHost(args.runtime), args.command !== "cancel");
    try {
      if (args.command === "queue") {
        const controller = await runtimeController(args.runtime);
        let previous: string | undefined;
        const writeQueue = async (): Promise<void> => {
          const [queue, worker] = await Promise.all([
            runtime.queue(),
            controller.worker.status(),
          ]);
          const queueView = JSON.stringify({
            dispatches: queue.dispatches,
            capacity: queue.capacity,
            worker,
            operations: queue.operations.map((item) => ({
              id: item.id,
              status: item.status,
              progress: item.progress,
            })),
          });
          if (args.watch && queueView === previous) return;
          previous = queueView;
          const value = {
            format: "hypit.cli-queue@1",
            at: Date.now(),
            worker,
            dispatches: queue.dispatches,
            lanes: summarizeQueueLanes(queue.capacity),
            capacity: queue.capacity,
            operations: queue.operations.map((item) => ({
              id: item.id,
              build: item.build,
              endpoint: item.endpoint,
              pool: item.pool,
              lane: item.lane,
              status: item.status,
              ...(item.progress === undefined ? {} : { progress: item.progress }),
            })),
          };
          const active = queue.dispatches.filter((item) => item.phase !== "terminal");
          const activeOperations = queue.operations.filter((item) =>
            item.status === "pending");
          const buildLines = active.slice(0, args.verbose ? undefined : 12).map((item) =>
            `${item.build}: ${item.phase}${item.cancellation === undefined ? "" : " · cancelling"}`);
          const laneLines = queueLaneLines(summarizeQueueLanes(queue.capacity));
          const genericCapacityLines = queue.capacity.filter((item) => item.queue === undefined)
            .slice(0, args.verbose ? undefined : 12)
            .map((item) => `${item.resources.map((resource) => resource.id).join(" + ")}: remote · ${item.build}`);
          const operationLines = activeOperations.slice(0, args.verbose ? undefined : 12).map((item) =>
            `${item.build} · ${item.pool} → ${item.lane}: ${item.progress === undefined
              ? item.status
              : formatOperationProgress(item.progress)}`);
          writeOperational(value, "Runtime queue", active.length === 0 ? "success" : "info", [
            ["Active Builds", String(active.length)],
            ["Active Operations", String(activeOperations.length)],
            ["Worker", worker.pid === undefined ? worker.state : `${worker.state} · ${worker.pid}`],
            ["Operation tickets", String(queue.capacity.length)],
          ], [
            ...buildLines,
            ...(operationLines.length === 0 ? [] : ["Operations:", ...operationLines]),
            ...(laneLines.length === 0 ? [] : ["Provider queues:", ...laneLines]),
            ...(genericCapacityLines.length === 0 ? [] : ["Other resources:", ...genericCapacityLines]),
          ]);
        };
        if (!args.watch) await writeQueue();
        else while (true) {
          await writeQueue();
          await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
        }
      } else if (args.command === "builds") {
        const entries = await runtime.builds();
        const inspected = args.json || args.verbose ? entries : entries.slice(0, 20);
        const builds = await Promise.all(inspected.map(async (entry) => {
          const status = await runtime.status(entry.build);
          return {
            build: entry.build,
            createdAt: entry.createdAt,
            status: status.dispatch === undefined
              ? status.build?.state.status
              : submissionStatus(status.dispatch),
            ...(status.build === undefined ? {} : { coreStatus: status.build.state.status }),
            ...summarizeBuildCatalog(entry, status.build?.state),
          };
        }));
        writeOperational({ builds }, "Build archive", "info", [["Builds", String(entries.length)]],
          builds.map((item) => {
            const source = basename(item.run?.path ?? item.source.path);
            const targets = item.targets.length === 0 ? "no named target" : item.targets.join(", ");
            return `${item.build}: ${item.status ?? "unknown"} · ${source} · ${targets}`;
          }));
      } else if (args.command === "history") {
        const catalogs = await runtime.builds();
        const history = await Promise.all(catalogs.map(async (catalog) => {
          if (args.source !== undefined && catalog.source.path !== args.source) {
            return { entries: [], targetNames: [] };
          }
          if (args.file !== undefined && !catalog.aliases.some((alias) => alias.name === args.file)) {
            return { entries: [], targetNames: [] };
          }
          const status = await runtime.status(catalog.build);
          if (status.build === undefined) return { entries: [], targetNames: [] };
          const targetOutputs = new Set(status.build.state.request.targets.map((target) => target.output));
          return {
            targetNames: catalog.aliases
              .filter((alias) => alias.ref.kind === "logical-output" && targetOutputs.has(alias.ref.id))
              .map((alias) => alias.name),
            entries: acceptedArchivedOutputs(status.build.state, catalog)
              .filter((output) => args.file === undefined || output.name === args.file)
              .map((output) => ({
                build: catalog.build,
                createdAt: catalog.createdAt,
                status: status.dispatch === undefined
                  ? status.build!.state.status
                  : submissionStatus(status.dispatch),
                source: catalog.source,
                ...(catalog.run === undefined ? {} : { run: catalog.run }),
                output,
              })),
          };
        }));
        const targetNames = new Set(history.flatMap((item) => item.targetNames));
        const entries = history.flatMap((item) => item.entries)
          .filter((entry) => !args.excludeTargets || !targetNames.has(entry.output.name))
          .sort((left, right) => right.createdAt - left.createdAt
            || left.output.name.localeCompare(right.output.name)
            || left.build.localeCompare(right.build));
        const query = {
          ...(args.file === undefined ? {} : { output: args.file }),
          ...(args.source === undefined ? {} : { source: args.source }),
        };
        const pins = args.pin ? pinnedRecords(entries) : [];
        const shown = entries.slice(0, args.verbose ? undefined : 20);
        writeOperational({ query, entries, ...(args.pin ? { pins } : {}) },
          entries.length === 0 ? "No accepted output history" : args.pin ? "Reuse these Records" : "Output history",
          entries.length === 0 ? "warning" : "info", [
            ...(args.file === undefined ? [] : [["Output", args.file] as const]),
            ...(args.source === undefined ? [] : [["Source", args.source] as const]),
            ["Records", String(entries.length)],
            ...(args.pin ? [["Outputs pinned", String(pins.length)] as const] : []),
          ], args.pin
            ? [
              "Paste into a Run Source; the newest accepted Record of each output is selected.",
              ...pins.flatMap((item) => item.markup),
            ]
            : shown.map((item) => {
              const created = new Date(item.createdAt).toISOString();
              return `${item.build}: ${item.output.name} · ${created} · ${item.output.record.id}`;
            }));
      } else if (args.command === "status") {
        let status = await runtime.status(args.file!);
        if (args.watch && status.build !== undefined && status.dispatch !== undefined) {
          await observeBuild(runtime, {
            id: status.build.build,
            state: status.build.state,
            status: submissionStatus(status.dispatch),
            dispatch: status.dispatch,
          }, {
            ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
            controller: await runtimeController(args.runtime),
            ...(args.json ? {} : {
              onProgress: (progress) => {
                const operations = Object.entries(progress.operations)
                  .map(([operationStatus, count]) => `${count} ${operationStatus}`)
                  .join(", ");
                io.write(`  · ${progress.build}: ${progress.phase}`
                  + `${operations.length === 0 ? "" : ` · ${operations}`}\n`);
                for (const line of progress.activity) io.write(`    ${line}\n`);
              },
            }),
          });
          status = await runtime.status(args.file!);
        }
        const effectiveStatus = status.dispatch === undefined
          ? status.build?.state.status
          : submissionStatus(status.dispatch);
        const machine = {
          build: status.build === undefined ? null : {
            id: status.build.build,
            status: effectiveStatus,
            coreStatus: status.build.state.status,
            diagnostics: status.build.state.diagnostics,
          },
          catalog: status.catalog === undefined
            ? null
            : summarizeBuildCatalog(status.catalog, status.build?.state),
          operations: status.operations.map((operation) => ({
            id: operation.id,
            command: operation.command,
            endpoint: operation.endpoint,
            status: operation.status,
            ...(operation.wakeAt === undefined ? {} : { wakeAt: operation.wakeAt }),
            ...(operation.progress === undefined ? {} : { progress: operation.progress }),
            ...(operation.failure === undefined ? {} : { failure: operation.failure }),
          })),
          dispatch: status.dispatch ?? null,
        };
        const phase = status.dispatch?.phase ?? "missing";
        const notableOperations = status.operations.filter((operation) =>
          operation.status !== "completed").slice(0, args.verbose ? undefined : 12);
        const terminal = status.dispatch?.phase === "terminal";
        writeOperational(machine, status.build === undefined
          ? "Build not found"
          : args.watch
            ? terminal ? "Build finished" : "Build still running"
            : "Build status",
        status.build === undefined
          ? "warning"
          : status.dispatch?.terminal === "failed"
            ? "error"
            : args.watch && !terminal ? "warning" : "info", [
            ["Build", args.file!],
            ["Status", effectiveStatus ?? "missing"],
            ...(status.build === undefined || terminal || effectiveStatus === status.build.state.status
              ? []
              : [["Core", status.build.state.status] as const]),
            ["Dispatch", phase],
            ["Operations", String(status.operations.length)],
          ], notableOperations.map((operation) => operation.failure !== undefined
            ? `${operation.endpoint}: ${operation.failure.code} — ${operation.failure.message}`
            : operation.progress === undefined
              ? `${operation.endpoint}: ${operation.status}`
              : `${operation.endpoint}: ${formatOperationProgress(operation.progress)}`)
            .concat(status.dispatch?.reason === undefined ? [] : [`Reason    ${status.dispatch.reason}`]));
        if (status.build === undefined || status.dispatch?.terminal === "failed") io.setExitCode?.(1);
      } else if (args.command === "inspect") {
        const status = await runtime.status(args.file!);
        if (status.build === undefined) throw new Error(`Build ${args.file} does not exist`);
        const archive = inspectBuild(status.build.state, status.catalog);
        const effectiveStatus = status.dispatch === undefined
          ? status.build.state.status
          : submissionStatus(status.dispatch);
        const machine = {
          build: status.build.build,
          status: effectiveStatus,
          coreStatus: status.build.state.status,
          dispatch: status.dispatch,
          archive,
          operations: status.operations.map((operation) => ({
            id: operation.id,
            command: operation.command,
            endpoint: operation.endpoint,
            status: operation.status,
            ...(operation.wakeAt === undefined ? {} : { wakeAt: operation.wakeAt }),
            ...(operation.progress === undefined ? {} : { progress: operation.progress }),
            ...(operation.failure === undefined ? {} : { failure: operation.failure }),
          })),
        };
        const aliases = archive.presentation?.aliases ?? [];
        const aliasByOutput = new Map(aliases.flatMap((alias) =>
          alias.ref.kind === "logical-output" ? [[alias.ref.id, alias] as const] : []));
        const recordById = new Map(archive.records.map((record) => [record.id, record]));
        const targetOutputs = new Set(archive.targets.map((target) => target.output));
        const targetLines = archive.targets.map((target) => {
          const alias = aliasByOutput.get(target.output);
          const record = target.record === undefined ? undefined : recordById.get(target.record);
          const name = alias?.name ?? target.output;
          if (record === undefined) return `Target    ${name} · not accepted`;
          return `Target    ${name} · ${displayType(record.type)} · ${record.id}`;
        });
        const otherAccepted = archive.demandedOutputs.filter((item) =>
          item.accepted && !targetOutputs.has(item.output));
        const otherLines = args.verbose
          ? otherAccepted.map((item) => {
              const alias = aliasByOutput.get(item.output);
              const record = recordById.get(item.record);
              const name = alias?.name ?? item.output;
              return record === undefined
                ? `Output    ${name}`
                : `Output    ${name} · ${displayType(record.type)} · ${record.id}`;
            })
          : otherAccepted.length === 0
            ? []
            : [`Other accepted outputs  ${otherAccepted.length} · use --verbose to list them`];
        writeOperational(machine, "Build archive detail", "info", [
          ["Build", status.build.build], ["Status", effectiveStatus],
          ...(status.dispatch?.phase === "terminal" || effectiveStatus === archive.status
            ? [] : [["Core", archive.status] as const]),
          ["Targets", String(archive.targets.length)], ["Accepted records", String(archive.records.length)],
          ["Operations", String(status.operations.length)],
        ], [
          ...(status.dispatch?.reason === undefined ? [] : [`Reason    ${status.dispatch.reason}`]),
          ...targetLines,
          ...otherLines,
        ]);
      } else if (args.command === "get") {
        const status = await runtime.status(args.file!);
        if (status.build === undefined) throw new Error(`Build ${args.file} does not exist`);
        if (args.artifact !== undefined && (args.name !== undefined || args.record !== undefined || args.output !== undefined)) {
          throw new Error("get accepts one of --name, --record, --output or --artifact");
        }
        if (args.artifact !== undefined) {
          const references = findArchivedArtifact(status.build.state, args.artifact);
          if (args.to === undefined) {
            writeOperational({ build: status.build.build, artifact: args.artifact, references }, "Artifact references", "info", [
              ["Build", status.build.build], ["Artifact", args.artifact], ["References", String(references.length)],
            ]);
          } else {
            const [first] = references;
            if (first === undefined) throw new Error(`Build ${args.file} does not reference Artifact ${args.artifact}`);
            const artifacts = await loadRuntimeArtifactAccess(await runtimeHost(args.runtime!));
            let materialized;
            try {
              materialized = await materializeArtifact(artifacts, first, args.to, `Build ${args.file}`);
            } finally {
              await artifacts.close();
            }
            const machine = {
              build: status.build.build,
              artifact: args.artifact,
              references,
              materialized,
            };
            writeOperational(machine, "Artifact materialized", "success", [
              ["Build", status.build.build], ["Artifact", args.artifact], ["Path", materialized.path],
            ]);
          }
          return;
        }
        const record = selectArchivedRecord(status.build.state, {
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(args.record === undefined ? {} : { record: args.record }),
          ...(args.output === undefined ? {} : { output: args.output }),
          ...(status.catalog === undefined ? {} : { catalog: status.catalog }),
        });
        if (args.to === undefined) {
          const machine = {
            build: status.build.build,
            record,
            artifacts: collectArtifacts(record.value.kind === "blob" ? record.value : record.value.value),
          };
          writeOperational(machine, "Archived Record", "info", [
            ["Build", status.build.build], ["Record", record.id],
            ...(record.value.kind === "inline"
              ? [["Value", inlineValuePreview(record.value.value)] as const]
              : []),
            ["Artifacts", String(machine.artifacts.length)],
          ]);
        } else {
          const artifacts = await loadRuntimeArtifactAccess(await runtimeHost(args.runtime!));
          let materialized;
          try {
            materialized = await materializeRecord(artifacts, record, args.to);
          } finally {
            await artifacts.close();
          }
          const machine = {
            build: status.build.build,
            record: record.id,
            materialized,
          };
          writeOperational(machine, "Record materialized", "success", [
            ["Build", status.build.build], ["Record", record.id], ["Path", materialized.path],
          ]);
        }
      } else {
        const result = await runtime.cancel(args.file!, args.reason);
        const machine = {
          build: args.file,
          requested: result !== undefined
            && (result.phase !== "terminal" || result.terminal === "cancelled"),
          phase: result?.phase,
          terminal: result?.terminal,
        };
        const title = result === undefined
          ? "Build not found"
          : result.terminal === "cancelled"
            ? "Build cancelled"
            : result.phase === "terminal"
              ? "Build already finished"
              : "Build cancellation requested";
        writeOperational(machine, title,
          result === undefined ? "warning" : result.phase === "terminal" && result.terminal !== "cancelled" ? "info" : "success", [
            ["Build", args.file!], ["Phase", result?.phase ?? "missing"],
          ], result?.phase === "terminal" && result.terminal !== "cancelled"
            ? [`No running work was changed; this Build is already ${result.terminal}.`]
            : []);
        if (result === undefined) io.setExitCode?.(1);
      }
    } finally {
      await runtime.close();
    }
    return;
  }
  const runtimePaths = args.runtime === undefined
    ? undefined
    : await (await runtimeHost(args.runtime)).resolvePaths();
  const effectivePackageRoot = args.packageRoot ?? runtimePaths?.packageRoot;
  const effectiveWorkspaceRoot = args.workspaceRoot
    ?? selectedRuntimeProjectRoot
    ?? dirname(resolve(args.file!));
  const sourcePackageRoot = effectivePackageRoot
    ?? await resolvePackageRoot(effectiveWorkspaceRoot);
  const loadedPackageSet = distribution.discoverSourcePackages === undefined
    ? undefined
    : await loadDiscoveredSourcePackages(distribution, {
          source: args.file!,
          ...(effectiveWorkspaceRoot === undefined ? {} : { workspaceRoot: effectiveWorkspaceRoot }),
          packageRoot: sourcePackageRoot,
          ...(distribution.packageRoot === undefined
            ? {}
            : { distributionPackageRoot: distribution.packageRoot }),
        });
  const packageContributions = (loadedPackageSet ?? distribution.bootstrapPackages)
    .map((item) => item.contribution);
  const runFrontends = collectRunFrontends(packageContributions);
  const compiler = distribution.createCompiler({
    ...(effectiveWorkspaceRoot === undefined ? {} : { workspaceRoot: effectiveWorkspaceRoot }),
    ...(args.assetRoots.length === 0 ? {} : { assetRoots: args.assetRoots }),
    packageContributions,
  });
  const workspace = await compiler.openFile(args.file!);
  const sourceHeader = parseSourceHeader(workspace.entry.name, workspace.entry.text);
  const runMode = runFrontends.some((frontend) => frontend.id === sourceHeader.using);
  const authorMode = compiler.supportsFrontend(sourceHeader.using);
  if (runMode === authorMode) {
    const message = runMode
      ? `Frontend ${sourceHeader.using} is ambiguously registered as Author and Run`
      : `No trusted Author or Run compiler accepts Frontend ${sourceHeader.using}`;
    throw new Error(message);
  }
  if ((args.command === "plan" || args.command === "build" || args.command === "quote") && !runMode) {
    throw new Error(`${args.command} requires a self-described Run Source; check Author Sources independently`);
  }
  if (args.command === "check") {
    // A project's own packages decide their element field names in TypeScript, and nothing authored
    // carries them, so this is the only place before a Build that can read them.
    const packageDiagnostics = typecheckProjectPackages(sourcePackageRoot, distribution.packageRoot);
    if (packageDiagnostics.length > 0) {
      throw new Error(`this project's own author packages do not typecheck:\n${packageDiagnostics.join("\n")}`);
    }
    if (runMode) {
        const loaded = await checkRunFile({
          workspace,
          authorCompiler: compiler,
          frontends: runFrontends,
          packageContributions,
        });
        const machine = {
          format: "hypit.cli-check@1" as const,
          sourceKind: "run" as const,
          ok: true,
          run: loaded.source,
          source: loaded.authorSource,
          targets: loaded.document.targets,
          candidates: Object.fromEntries(loaded.document.candidates.map((item) => [item.id, item.kind])),
          satisfactions: loaded.document.satisfactions,
          unresolvedBuildRecords: loaded.unresolvedBuildRecords,
          deterministic_durations: deterministicSpeechDurationsFromGraph(loaded.author.graph, loaded.author.program.records),
        } as const;
        writeCliOutput(io, args, {
          kind: "check-run",
          machine,
          frontend: sourceHeader.using,
        });
        return;
    }
    {
      const result = await compiler.compileSource(workspace.entry, workspace);
      const machine = {
        format: "hypit.cli-check@1" as const,
          sourceKind: "author" as const,
          ok: true,
          units: result.closure.units.length,
        sourceAssets: result.attachments.map((item) => item.artifact),
        modules: result.program.closure.modules.map((item) => `${item.manifest.name}@${item.manifest.version}`),
        exports: result.exports.map((item) => ({ name: item.name, type: item.type, kind: item.ref.kind })),
      } as const;
      writeCliOutput(io, args, {
        kind: "check-author",
        machine,
        source: workspace.entry.name,
        frontend: sourceHeader.using,
      });
      return;
    }
  }
  if (args.command === "quote") {
    if (args.runtime === undefined) {
      throw new Error("quote requires a Runtime; run hypit runtime use <profile> or pass --runtime <profile>");
    }
    const archive = lazyRuntimeArchive(await runtimeHost(args.runtime));
    let loadedRun;
    try {
      loadedRun = await loadRunFile({
        workspace,
        authorCompiler: compiler,
        frontends: runFrontends,
        packageContributions,
        runtime: archive,
      });
    } finally {
      await archive.close();
    }
    const result = loadedRun.compiler.planCompilation(loadedRun);
    const preflight = await preflightPlan(await runtimeHost(args.runtime), result.state);
    assertPreflight(preflight);
    const runtime = await loadRuntime(await runtimeHost(args.runtime));
    try {
      const quote = await runtime.quoteBuild({
        definition: result.definition,
        ...(loadedPackageSet === undefined ? {} : {
          componentPackages: loadedPackageSet
            .filter((item) => (item.contribution.components?.length ?? 0) > 0)
            .map((item) => item.specifier),
        }),
      });
      writeOperational(quote, "Build quote", "success", [
        ["Credits", String(quote.totalCredits)],
        ["USD", `$${quote.totalUsd}`],
        ["Requests", String(quote.items.length)],
      ], quote.items.map((item) =>
        `${item.request}  ${item.model}  ${item.estimatedCredits} credits  $${item.estimatedUsd}`));
    } finally {
      await runtime.close();
    }
    return;
  }
  if (args.command === "build") {
    if (args.runtime === undefined) {
      throw new Error("build requires a Runtime; run hypit runtime use <profile> or pass --runtime <profile>");
    }
    const archive = lazyRuntimeArchive(await runtimeHost(args.runtime));
    let loadedRun;
    try {
      loadedRun = await loadRunFile({
        workspace,
        authorCompiler: compiler,
        frontends: runFrontends,
        packageContributions,
        runtime: archive,
      });
    } finally {
      await archive.close();
    }
    const result = loadedRun.compiler.planCompilation(loadedRun);
    let runtime: CliRuntime | undefined;
    try {
      const catalog = createCatalogDescriptor({
        source: loadedRun.authorSource,
        compilation: result.compilation.author,
        run: {
          path: loadedRun.path,
        },
      });
      const request = {
        // One CLI invocation is one execution instance. Source and Plan identity
        // remain in Core; they never reclaim a previous Build.
        id: `bld_${randomUUID()}`,
        definition: result.definition,
        ...(loadedPackageSet === undefined ? {} : {
          componentPackages: loadedPackageSet
            .filter((item) => (item.contribution.components?.length ?? 0) > 0)
            .map((item) => item.specifier),
        }),
        catalog,
        attachments: result.compilation.attachments,
      } as const;
      const controller = await (await runtimeHost(args.runtime)).controller({
        packageRoot: sourcePackageRoot,
      });
      let worker = await controller.worker.status();
      const preflight = await preflightPlan(await runtimeHost(args.runtime), result.state);
      // Build is an execution boundary, not a provisioning command. The cheap
      // preflight must already be clean; `runtime up` is the explicit place for
      // installing or starting declared programs.
      assertPreflight(preflight);
      runtime = await loadRuntime(await runtimeHost(args.runtime));
      let built = await runtime.build(request);
      try {
        worker = await controller.worker.up({
          ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Build ${built.id} is queued, but the Runtime Worker could not start: ${detail}`);
      }
      if (args.follow && runtime !== undefined) {
        built = await observeBuild(runtime, built, {
          ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
          controller,
          ...(args.json || args.jsonl ? {} : {
            onProgress: (progress) => {
              const operations = Object.entries(progress.operations)
                .map(([status, count]) => `${count} ${status}`)
                .join(", ");
              io.write(`  · ${progress.build}: ${progress.phase}`
                + `${operations.length === 0 ? "" : ` · ${operations}`}\n`);
              for (const line of progress.activity) io.write(`    ${line}\n`);
            },
          }),
        });
      }
      const targetOutputs = new Set(built.state.request.targets.map((target) => target.output));
      const presentation = catalog;
      const targetAliases = presentation.aliases.filter((alias) =>
        alias.ref.kind === "logical-output" && targetOutputs.has(alias.ref.id));
      const targetPresentations = targetAliases.flatMap((alias) => {
        const selection = built.state.plan.selections.find((item) => item.output === alias.ref.id);
        const record = selection === undefined
          ? undefined
          : built.state.records.find((item) => item.id === selection.record);
        if (record === undefined) return [];
        return [{
          alias,
          record,
          ...(record?.value.kind === "inline"
            ? { inline: inlineValuePreview(record.value.value) }
            : {}),
        }];
      });
      const machine = {
        build: built.id,
        status: built.status,
        worker,
        goals: built.state.plan.goals.map((goal) => {
          const record = built.state.records.find((item) => item.id === goal.record);
          return {
            record: goal.record,
            type: goal.type,
            ...(record === undefined ? {} : { value: record.value }),
          };
        }),
        dispatch: {
          phase: built.dispatch.phase,
          ...(built.dispatch.cancellation === undefined ? {} : { cancellation: true }),
          ...(built.dispatch.reason === undefined ? {} : { reason: built.dispatch.reason }),
        },
      };
      const runtimeHint = runtimeNeedsHint ? ` --runtime ${args.runtime}` : "";
      const terminalLines = targetPresentations.length === 0
        ? [
            ...(built.dispatch.reason === undefined ? [] : [`Reason   ${built.dispatch.reason}`]),
            `Inspect  hypit inspect ${built.id}${runtimeHint}`,
          ]
        : [
            ...(built.dispatch.reason === undefined ? [] : [`Reason   ${built.dispatch.reason}`]),
            `Inspect  hypit inspect ${built.id}${runtimeHint}`,
            ...targetPresentations
              .filter((item) => item.inline !== undefined)
              .slice(0, args.verbose ? undefined : 8)
              .map((item) => `Result   ${item.alias.name} = ${item.inline}`),
            ...targetPresentations
              .filter((item) => item.inline === undefined)
              .slice(0, args.verbose ? undefined : 4)
              .map((item) =>
                `Export   hypit get ${built.id}${runtimeHint} --name ${item.alias.name} --to <path>`),
          ];
      const terminal = built.dispatch.phase === "terminal";
      writeOperational(machine, args.follow
        ? terminal ? "Build finished" : "Build still running"
        : "Build submitted",
      built.status === "failed" ? "error"
        : built.status === "cancelled" || (args.follow && !terminal) ? "warning" : "success", [
          ["Build", built.id],
          ["Status", built.status],
          ["Worker", worker.state === "running" ? String(worker.pid) : worker.state],
          ["Goals", String(machine.goals.length)],
        ], terminal ? terminalLines : [
          `Watch    hypit status ${built.id}${runtimeHint} --watch`,
          `Cancel   hypit cancel ${built.id}${runtimeHint}`,
        ]);
      if (built.status === "failed") io.setExitCode?.(1);
    } finally {
      await runtime?.close();
    }
    return;
  }
  let runtime: RuntimeArchiveView | undefined;
  try {
    runtime = args.runtime === undefined
      ? undefined
      : lazyRuntimeArchive(await runtimeHost(args.runtime));
    const loaded = await loadRunFile({
      workspace,
      authorCompiler: compiler,
      frontends: runFrontends,
      packageContributions,
      ...(runtime === undefined ? {} : { runtime }),
    });
    const result = loaded.compiler.planCompilation(loaded);
    const preflight = args.runtime === undefined
      ? undefined
      : await preflightPlan(await runtimeHost(args.runtime), result.state);
    const outputNames = Object.fromEntries(result.compilation.author.exports.flatMap((item) =>
      item.ref.kind === "logical-output" ? [[item.ref.id, item.name]] : []));
    writeCliOutput(io, args, {
      kind: "plan",
      machine: {
        format: "hypit.cli-plan@1",
        ok: preflight?.ok ?? true,
        plan: result.definition.plan,
        unreached: unreachedGenerations(result.compilation.author.graph, result.state, outputNames),
        deterministic_durations: deterministicSpeechDurations(result.compilation),
        ...(preflight === undefined ? {} : { preflight }),
      },
      run: loaded.path,
      outputNames,
      satisfactionNames: loaded.run.satisfactionNames,
    });
    if (preflight !== undefined && !preflight.ok) io.setExitCode?.(1);
  } finally {
    await runtime?.close();
  }
}
