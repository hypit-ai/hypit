import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";
import { findRuntimeProfile, resolveProjectRoot } from "@hypit/cli";
import { videoCliDistribution } from "@hypit/video-cli";

import { openStudioBuildLibrary } from "./src/build-library.js";
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
const packageRootArgument = values.get("package-root");
const workspaceArgument = values.get("workspace");
const requestedWorkspaceRoot = workspaceArgument === undefined
  ? undefined
  : resolve(invokedFrom, workspaceArgument);
const workspaceRoot = await resolveProjectRoot({
  ...(requestedWorkspaceRoot === undefined ? {} : { workspaceRoot: requestedWorkspaceRoot }),
  cwd: invokedFrom,
});
const packageRoot = packageRootArgument === undefined
  ? workspaceRoot
  : resolve(invokedFrom, packageRootArgument);
const runtimeArgument = values.get("runtime");
const selectedRuntime = runtimeArgument === undefined
  ? await findRuntimeProfile(workspaceRoot)
  : undefined;
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
const buildLibrary = await openStudioBuildLibrary(runtimePath, packageRoot, workspaceRoot, distributionPackageRoot);
let run;
try {
  run = await loadStudioRun({
    run: runPath,
    domain,
    registry,
    buildLibrary,
  });
} catch (error) {
  await buildLibrary.close();
  throw error;
}
const source = run.authorSource;
try {
  inspectStudioRun(registry, run.source, run);
} catch (error) {
  await buildLibrary.close();
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
    ...(buildLibrary === undefined ? {} : { buildLibrary }),
  })],
});
await server.listen();
server.printUrls();
