import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

import { openStudioArchive } from "./src/archive.js";
import { loadStudioDomain } from "./src/domain.js";
import { loadStudioRun } from "./src/run.js";
import { studioPlugin } from "./src/server.js";
import { inspectStudioRun } from "./src/studio-preflight.js";

const here = dirname(fileURLToPath(import.meta.url));

function usage(message?: string): never {
  if (message !== undefined) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  pnpm studio -- --run <build.svrun> [--runtime <hypit.runtime.json>]
    [--port <number>] [--workspace <directory>] [--package-root <directory>]

Studio opens one explicit Run Source, requires a Film/Render target and a
resolved deterministic semantic projection, and writes only its Author SVML.
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
const packageRoot = packageRootArgument === undefined
  ? invokedFrom
  : resolve(invokedFrom, packageRootArgument);
const workspaceRoot = workspaceArgument === undefined
  ? dirname(runPath)
  : resolve(invokedFrom, workspaceArgument);
const runtimeArgument = values.get("runtime");
const runtimePath = runtimeArgument === undefined ? undefined : resolve(invokedFrom, runtimeArgument);
const port = Number(values.get("port") ?? "5179");
if (!Number.isSafeInteger(port) || port <= 0) usage("--port must be a positive integer");

const domain = await loadStudioDomain({ run: runPath, workspaceRoot, packageRoot });
const archive = await openStudioArchive(runtimePath, packageRoot);
let run;
try {
  run = await loadStudioRun({
    run: runPath,
    domain,
    ...(archive === undefined ? {} : { archive }),
  });
} catch (error) {
  await archive?.close();
  throw error;
}
const source = run.authorSource;
try {
  inspectStudioRun(run.source, run);
} catch (error) {
  await archive?.close();
  throw error;
}
const server = await createServer({
  configFile: false,
  root: here,
  server: {
    port,
    fs: { allow: [workspaceRoot, here] },
  },
  plugins: [studioPlugin({
    source,
    runPath,
    workspaceRoot,
    domain,
    ...(archive === undefined ? {} : { archive }),
  })],
});
await server.listen();
server.printUrls();
