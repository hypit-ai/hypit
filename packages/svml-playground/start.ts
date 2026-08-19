import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

import { importedPackages, usePreviewPackages } from "./src/official-video.js";
import { svmlPlaygroundPlugin } from "./src/server.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

function usage(message?: string): never {
  if (message !== undefined) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  pnpm svml:playground -- --source <main.svml> [--run <build.svrun>]
    [--runtime <hypit.runtime.json>] [--port <number>]

The Playground reads the Source. It never writes to it, and it never runs a
Provider: with no build present it estimates timings from the Script text.
A Run Source is read for material it already names.
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

const rawArguments = process.argv.slice(2);
const values = argumentsByName(rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments);
const sourceArgument = values.get("source");
if (sourceArgument === undefined || !sourceArgument.trim()) usage("Missing --source");
// `pnpm --filter … exec` runs inside the package directory, so a relative
// --source must be resolved against the directory the author typed it in.
const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const source = resolve(invokedFrom, sourceArgument);
const runArgument = values.get("run");
const run = runArgument === undefined ? undefined : resolve(invokedFrom, runArgument);
// A Runtime profile says where material earlier builds produced is kept. Only a
// Source that reuses an accepted take needs one.
const runtimeArgument = values.get("runtime");
const runtime = runtimeArgument === undefined ? undefined : resolve(invokedFrom, runtimeArgument);
// Runtime packages belong to the project that selected them. Pointing into the
// Hypit monorepo would make the preview work here and fail once installed.
const packageRoot = invokedFrom;
const port = Number(values.get("port") ?? "5179");
if (!Number.isSafeInteger(port) || port <= 0) usage("--port must be a positive integer");

// A Source may import a package this application has never heard of, which is
// exactly what a project-local component is. Load what the Source names, from
// the project that installed it, alongside the official list.
usePreviewPackages(
  [source, ...(run === undefined ? [] : [run])]
    .flatMap((path) => importedPackages(readFileSync(path, "utf8"))),
  packageRoot,
);

const server = await createServer({
  configFile: false,
  root: here,
  server: {
    port,
    fs: {
      allow: [...new Set([
        repoRoot, dirname(source),
        ...(run === undefined ? [] : [dirname(run)]),
        ...(runtime === undefined ? [] : [dirname(runtime)]),
      ])],
    },
  },
  plugins: [svmlPlaygroundPlugin({
    source, root: invokedFrom, packageRoot,
    ...(run === undefined ? {} : { run }),
    ...(runtime === undefined ? {} : { runtime }),
  })],
});

await server.listen();
server.printUrls();
