/**
 * Prepares the external programs that installed Providers declare.
 *
 * A Provider that needs a separate program — WhisperX, OpenCV — states that in
 * its own `service.ts`, and marks itself with `"service": true` under `svml` in
 * its package.json. Nothing here names a Provider, so adding one is a change to
 * that package alone.
 *
 * The prepare command is read from the declaration rather than restated here.
 * Two statements of "how this environment is built" drift, and the copy that
 * drifts is the one nobody runs during a Build.
 *
 * This runs from `pnpm install` and must never fail it. A missing `uv`, a
 * Provider whose activation will not import, a prepare that exits non-zero —
 * each is reported and stepped over. What it prepares is a convenience; what it
 * must not do is stop someone from installing the repository.
 *
 * Reading a declaration means importing TypeScript, so that half runs in a
 * child under tsx (`--declare`, printing JSON). A child that dies takes its
 * failure with it.
 */
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const packageRoot = new URL("../packages/", import.meta.url);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

/** Packages that declare an external program, as `{ name, activation }`. */
async function declaringPackages() {
  const found = [];
  for (const entry of await readdir(packageRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let manifest;
    try {
      manifest = JSON.parse(await readFile(new URL(`./${entry.name}/package.json`, packageRoot), "utf8"));
    } catch {
      continue;
    }
    if (manifest.svml?.service !== true) continue;
    const activation = manifest.svml?.activation;
    if (typeof activation !== "string") {
      console.warn(`  ${manifest.name} marks itself as a service but declares no activation`);
      continue;
    }
    found.push({
      name: manifest.name,
      activation: fileURLToPath(new URL(`./${entry.name}/${activation.replace(/^\.\//u, "")}`, packageRoot)),
    });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Streams stay separate: the declaration child answers on stdout, and Node's
 * own deprecation notices arrive on stderr. Merging them would leave the JSON
 * unparseable for a reason that has nothing to do with what was declared.
 */
function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: repositoryRoot, shell: false, ...options });
    let out = "";
    let err = "";
    if (options.stdio === undefined) {
      child.stdout.on("data", (chunk) => { out += chunk.toString(); });
      child.stderr.on("data", (chunk) => { err += chunk.toString(); });
    }
    child.on("error", (error) => resolve({ ok: false, out: "", err: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, out: out.trim(), err: err.trim(), code }));
  });
}

function lastLine(text) {
  return text.split("\n").filter((line) => line.trim().length > 0).at(-1) ?? "unknown error";
}

/**
 * Asks a child running under tsx what each package declares. The parent stays
 * plain JavaScript so that a repository without tsx built yet still installs.
 */
async function declarations(packages) {
  const result = await run(process.execPath, [
    "--import", "tsx",
    fileURLToPath(import.meta.url),
    "--declare",
    ...packages.map((item) => `${item.name}=${item.activation}`),
  ]);
  if (!result.ok) {
    console.warn(`  could not read service declarations: ${lastLine(result.err)}`);
    return [];
  }
  try {
    return JSON.parse(result.out);
  } catch {
    console.warn("  service declarations were not readable JSON");
    return [];
  }
}

/** Imports the activations named on argv and prints what they declare. */
async function emitDeclarations(specifiers) {
  const declared = [];
  for (const specifier of specifiers) {
    const separator = specifier.indexOf("=");
    const name = specifier.slice(0, separator);
    try {
      const module = await import(specifier.slice(separator + 1));
      const facets = (module.default ?? module.svmlPackage)?.hostFacets ?? [];
      for (const facet of facets) {
        // A Provider states its program for a Runtime Profile it has not seen
        // yet. An empty config is what a fresh clone has, and yields the
        // defaults this repository ships.
        const service = facet.implementation?.service?.({
          root: repositoryRoot,
          instance: "",
          config: {},
        });
        if (service?.prepare === undefined) continue;
        declared.push({
          package: name,
          id: service.id,
          prepare: { command: service.prepare.command, args: [...service.prepare.args] },
        });
      }
    } catch (error) {
      declared.push({ package: name, failure: error instanceof Error ? error.message : String(error) });
    }
  }
  process.stdout.write(JSON.stringify(declared));
}

async function main() {
  const packages = await declaringPackages();
  if (packages.length === 0) return;

  console.log(`Preparing external services for ${packages.length} Provider${packages.length === 1 ? "" : "s"}`);
  const declared = await declarations(packages);

  // One program may be declared by more than one Provider; prepare it once.
  const unique = new Map();
  for (const item of declared) {
    if (item.failure !== undefined) {
      console.warn(`  ${item.package}: ${item.failure}`);
      continue;
    }
    if (!unique.has(item.id)) unique.set(item.id, item);
  }

  const missing = new Set();
  let prepared = 0;
  for (const item of unique.values()) {
    const { command, args } = item.prepare;
    if (missing.has(command) || !(await run(command, ["--version"])).ok) {
      missing.add(command);
      console.warn(`  ${item.id}: skipped, ${command} is not on PATH`);
      continue;
    }
    console.log(`  ${item.id}: ${command} ${args.join(" ")}`);
    const result = await run(command, args, { stdio: "inherit" });
    if (result.ok) prepared += 1;
    else console.warn(`  ${item.id}: prepare exited ${result.code ?? "abnormally"}; run it by hand to see why`);
  }

  const skipped = unique.size - prepared;
  console.log(`Prepared ${prepared} service${prepared === 1 ? "" : "s"}${skipped > 0 ? `, skipped ${skipped}` : ""}`);
  if (missing.size > 0) {
    console.log(`Install ${[...missing].join(", ")} and run pnpm install again to finish setup`);
  }
}

const declareAt = process.argv.indexOf("--declare");
try {
  if (declareAt === -1) await main();
  else await emitDeclarations(process.argv.slice(declareAt + 1));
} catch (error) {
  // Nothing this script does is worth failing an install over.
  console.warn(`Service preparation stopped: ${error instanceof Error ? error.message : String(error)}`);
}
