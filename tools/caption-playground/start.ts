import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

import { captionPlaygroundPlugin } from "./src/server.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

function usage(message?: string): never {
  if (message !== undefined) process.stderr.write(`${message}\n\n`);
  process.stderr.write(`Usage:
  pnpm caption:playground -- \\
    --source <main.svml> --package-lock <svml.packages.lock> \\
    --style <export> --display <export> --recipe <file.svs#recipe.path> \\
    --font <file.svml#font-stack-id> --canvas <width>x<height> --fps <number> \
    [--package-root <directory>] [--port <number>]
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

function required(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined || !value.trim()) usage(`Missing --${name}`);
  return value;
}

function workspaceAliases(): Array<{ find: string; replacement: string }> {
  const packages = join(repoRoot, "packages");
  return readdirSync(packages, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const manifestPath = join(packages, entry.name, "package.json");
    let manifest: { name?: unknown; exports?: unknown };
    try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as typeof manifest; } catch { return []; }
    const target = (manifest.exports as Record<string, unknown> | undefined)?.["."];
    return typeof manifest.name === "string" && typeof target === "string"
      ? [{ find: manifest.name, replacement: join(packages, entry.name, target) }]
      : [];
  });
}

const rawArguments = process.argv.slice(2);
const values = argumentsByName(rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments);
const recipeArgument = required(values, "recipe");
const hash = recipeArgument.lastIndexOf("#");
if (hash <= 0 || hash === recipeArgument.length - 1) usage("--recipe must be <file.svs#recipe.path>");
const fontArgument = required(values, "font");
const fontHash = fontArgument.lastIndexOf("#");
if (fontHash <= 0 || fontHash === fontArgument.length - 1) usage("--font must be <file.svml#font-stack-id>");
const canvas = /^(\d+)x(\d+)$/u.exec(required(values, "canvas"));
if (canvas === null) usage("--canvas must be <width>x<height>");
const fps = Number(required(values, "fps"));
const port = Number(values.get("port") ?? "5178");
if (!Number.isSafeInteger(fps) || fps <= 0 || !Number.isSafeInteger(port) || port <= 0) usage("--fps and --port must be positive integers");

const source = resolve(required(values, "source"));
const recipeFile = resolve(recipeArgument.slice(0, hash));
const fontFile = resolve(fontArgument.slice(0, fontHash));
const packageRoot = resolve(values.get("package-root") ?? repoRoot);
const server = await createServer({
  configFile: false,
  root: here,
  resolve: {
    alias: [
      { find: "node:crypto", replacement: join(here, "src/shims/node-crypto.ts") },
      ...workspaceAliases(),
    ],
  },
  server: {
    port,
    fs: {
      allow: [...new Set([repoRoot, packageRoot, dirname(source), dirname(recipeFile), dirname(fontFile)])],
    },
  },
  plugins: [captionPlaygroundPlugin({
    source,
    packageLock: resolve(required(values, "package-lock")),
    packageRoot,
    styleExport: required(values, "style"),
    displayExport: required(values, "display"),
    recipeFile,
    recipePath: recipeArgument.slice(hash + 1),
    fontFile,
    fontId: fontArgument.slice(fontHash + 1),
    width: Number(canvas[1]),
    height: Number(canvas[2]),
    fps,
  })],
});

await server.listen();
server.printUrls();
