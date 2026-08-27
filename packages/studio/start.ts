import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";
import { findRuntimeProfile } from "@hypit/cli";
import { videoCliDistribution } from "@hypit/video-cli";
import { EndpointRegistry } from "@hypit/driver-node";
import { createLocalMediaProvider } from "@hypit/provider-media-local";

import { openStudioArchive } from "./src/archive.js";
import { loadStudioCompanionRegistry } from "./src/companion-profile.js";
import { loadStudioDomain } from "./src/domain.js";
import { loadStudioRun } from "./src/run.js";
import { studioPlugin } from "./src/server.js";
import { inspectStudioRun } from "./src/studio-preflight.js";

const here = dirname(fileURLToPath(import.meta.url));

function usage(message?: string): never {
  if (message !== undefined) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  hypit-studio --run <build.svrun> [--runtime <hypit.runtime.json>]
    [--port <number>] [--workspace <directory>] [--package-root <directory>]
    [--studio-profile <hypit.studio.json>]

Studio opens one explicit Run Source, requires a Film/Render target and a
resolved deterministic semantic projection, and writes only the selected file
inside that exact Run and Author Source closure.
`);
  process.exit(1);
}

function argumentsByName(argv: readonly string[]): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || !flag.startsWith("--") || value === undefined || value.startsWith("--")) {
      usage(`Malformed argument near ${flag ?? "end of command"}`);
    }
    result.set(flag.slice(2), value);
  }
  return result;
}

const raw = process.argv.slice(2);
const values = argumentsByName(raw[0] === "--" ? raw.slice(1) : raw);
const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const runArgument = values.get("run");
if (runArgument === undefined || runArgument.trim().length === 0) usage("Missing --run");
const runPath = resolve(invokedFrom, runArgument);
const previewOnly = /[\\/]\.hypit[\\/]preview[\\/]/u.test(runPath);
const packageRootArgument = values.get("package-root");
const workspaceArgument = values.get("workspace");
const requestedWorkspaceRoot = workspaceArgument === undefined
  ? undefined
  : resolve(invokedFrom, workspaceArgument);
const selectedRuntime = await findRuntimeProfile(requestedWorkspaceRoot ?? dirname(runPath));
const workspaceRoot = workspaceArgument === undefined
  ? selectedRuntime?.projectRoot ?? dirname(runPath)
  : requestedWorkspaceRoot!;
const packageRoot = packageRootArgument === undefined
  ? workspaceRoot
  : resolve(invokedFrom, packageRootArgument);
const runtimeArgument = values.get("runtime");
const runtimePath = runtimeArgument === undefined
  ? selectedRuntime?.profile
  : resolve(invokedFrom, runtimeArgument);
const studioProfileArgument = values.get("studio-profile");
const studioProfilePath = studioProfileArgument === undefined ? undefined : resolve(invokedFrom, studioProfileArgument);
const port = Number(values.get("port") ?? "5179");
if (!Number.isSafeInteger(port) || port <= 0) usage("--port must be a positive integer");

const distributionPackageRoot = videoCliDistribution.packageRoot ?? resolve(here, "../..");
const registry = await loadStudioCompanionRegistry({
  workspaceRoot,
  packageRoot,
  distributionPackageRoot,
  ...(studioProfilePath === undefined ? {} : { profile: studioProfilePath }),
});
const domain = await loadStudioDomain({ run: runPath, workspaceRoot, packageRoot });
const archive = await openStudioArchive(runtimePath, packageRoot, workspaceRoot, distributionPackageRoot);
let run;
try {
  run = await loadStudioRun({
    run: runPath,
    domain,
    registry,
    ...(archive === undefined ? {} : { archive }),
  });
} catch (error) {
  await archive?.close();
  throw error;
}
const source = run.authorSource;
// A preview Run has already persisted all mock media as relative file
// Candidates, but deterministic inspect/normalize/render-media Producers still
// need the local FFmpeg endpoint.  This is not a paid or external Provider and
// is never installed for ordinary production Runs.
const endpoints = previewOnly ? new EndpointRegistry() : undefined;
if (endpoints !== undefined) await createLocalMediaProvider({}).install(endpoints);
try {
  inspectStudioRun(registry, run.source, run, previewOnly ? new Set([
    "@hypit/media-pipeline@1#inspect-media",
    "@hypit/media-pipeline@1#normalize-media",
    "@hypit/media-pipeline@1#extract-audio",
    "@hypit/media-pipeline@1#render-audio",
    "@hypit/media-pipeline@1#mux",
  ]) : undefined);
} catch (error) {
  await archive?.close();
  throw error;
}
const server = await createServer({
  configFile: false,
  root: here,
  server: {
    port,
    // Vite resolves package assets through pnpm's real paths. The package root
    // must therefore be readable for self-hosted fonts and other declared
    // Studio dependencies, while the author workspace remains separately
    // available for Source and material previews.
    fs: { allow: [workspaceRoot, packageRoot, distributionPackageRoot, here] },
  },
  plugins: [studioPlugin({
    source,
    runPath,
    workspaceRoot,
    domain,
    registry,
    ...(archive === undefined ? {} : { archive }),
    ...(endpoints === undefined ? {} : { endpoints }),
  })],
});
await server.listen();
server.printUrls();
